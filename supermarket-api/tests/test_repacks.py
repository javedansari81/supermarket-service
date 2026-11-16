"""Repack (loose stock -> own-packed products) endpoint tests"""
from decimal import Decimal
import pytest
from app.models import Product, ProductBatch, StockMovement, TenantSetting

REP = "/api/v1/repacks"


@pytest.fixture()
def dal(db, seed, category):
    """Toor Dal Loose, 30 kg at Rs 100/kg, with 1 kg, 500 g and 250 g MF packs"""
    tenant_id = seed["tenant_a"].id
    loose = Product(tenant_id=tenant_id, category_id=category.id, product_no="L001",
                    product_name="Toor Dal Loose", item_name="Toor Dal", product_type="loose",
                    is_loose=True, unit_type="kg", plu_code=1, purchase_price=100,
                    selling_price=130, stock_quantity=30)
    packs = {}
    for no, qty, unit, mrp in (("P1", 1, "kg", 150), ("P2", 500, "g", 80), ("P3", 250, "g", 42)):
        packs[f"{qty}{unit}"] = Product(
            tenant_id=tenant_id, category_id=category.id, product_no=no,
            product_name=f"Toor Dal {qty} {unit} MF", item_name="Toor Dal", product_type="own_packed",
            unit_type="pcs", net_quantity=qty, net_unit=unit, mrp=mrp, selling_price=mrp - 5,
            stock_quantity=0)
    other = Product(tenant_id=tenant_id, product_no="P9", product_name="Moong Dal 1 kg MF",
                    item_name="Moong Dal", product_type="own_packed", unit_type="pcs",
                    net_quantity=1, net_unit="kg", mrp=140, selling_price=135, stock_quantity=0)
    db.add_all([loose, other, *packs.values()])
    db.commit()
    return {"loose": loose, **packs}


def body(dal, **extra):
    return {"source_product_id": dal["loose"].id,
            "items": [{"product_id": dal["1kg"].id, "pack_count": 10},
                      {"product_id": dal["500g"].id, "pack_count": 12},
                      {"product_id": dal["250g"].id, "pack_count": 8}], **extra}


def test_source_lists_matching_packs(client, dal, admin_headers):
    res = client.get(f"{REP}/sources/{dal['loose'].id}", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert Decimal(data["wastage_percent"]) == Decimal("0.5")
    assert [p["product_name"] for p in data["packs"]] == \
        ["Toor Dal 1 kg MF", "Toor Dal 500 g MF", "Toor Dal 250 g MF"]
    assert [Decimal(p["source_quantity_per_pack"]) for p in data["packs"]] == \
        [Decimal("1"), Decimal("0.5"), Decimal("0.25")]


def test_source_must_be_loose(client, dal, admin_headers):
    assert client.get(f"{REP}/sources/{dal['1kg'].id}", headers=admin_headers).status_code == 400


def test_repack_with_recommended_wastage(client, db, dal, admin_headers):
    res = client.post(REP, json=body(dal), headers=admin_headers)
    assert res.status_code == 201, res.text
    data = res.json()
    # 10 + 6 + 2 = 18 kg packed, 0.5% wastage = 0.09 kg
    assert Decimal(data["packed_quantity"]) == Decimal("18")
    assert Decimal(data["wastage_quantity"]) == Decimal("0.09")
    assert Decimal(data["total_quantity"]) == Decimal("18.09")
    assert data["repack_no"].startswith("RP")

    db.expire_all()
    assert db.get(Product, dal["loose"].id).stock_quantity == Decimal("11.91")
    assert db.get(Product, dal["1kg"].id).stock_quantity == 10
    assert db.get(Product, dal["500g"].id).stock_quantity == 12
    assert db.get(Product, dal["250g"].id).stock_quantity == 8

    # Cost includes the wastage: 100/kg x 18.09/18
    by_product = {i["product_id"]: i for i in data["items"]}
    assert Decimal(by_product[dal["1kg"].id]["unit_cost"]) == Decimal("100.50")
    assert Decimal(by_product[dal["500g"].id]["unit_cost"]) == Decimal("50.25")
    batch = db.get(ProductBatch, by_product[dal["1kg"].id]["batch_id"])
    assert batch.quantity_left == 10 and batch.batch_no == data["repack_no"]
    assert batch.mrp == 150 and batch.purchase_price == Decimal("100.50")

    moves = {(m.product_id, m.movement_type): m.quantity for m in db.query(StockMovement).filter(
        StockMovement.reference_type == "repack", StockMovement.reference_id == data["id"])}
    assert moves[(dal["loose"].id, "repack_out")] == Decimal("18")
    assert moves[(dal["loose"].id, "wastage_out")] == Decimal("0.09")
    assert moves[(dal["250g"].id, "repack_in")] == 8


def test_repack_custom_and_disabled_wastage(client, db, dal, admin_headers):
    custom = client.post(REP, json=body(dal, wastage_quantity=0.2), headers=admin_headers)
    assert custom.status_code == 201
    assert Decimal(custom.json()["wastage_quantity"]) == Decimal("0.2")

    off = client.post(REP, json={"source_product_id": dal["loose"].id,
                                 "items": [{"product_id": dal["1kg"].id, "pack_count": 5}],
                                 "wastage_enabled": False, "wastage_quantity": 0.2},
                      headers=admin_headers)
    assert off.status_code == 201
    assert Decimal(off.json()["wastage_quantity"]) == 0
    assert off.json()["wastage_enabled"] is False
    db.expire_all()
    # 30 - (18 + 0.2) - 5
    assert db.get(Product, dal["loose"].id).stock_quantity == Decimal("6.8")


def test_repack_uses_store_wastage_percent(client, db, seed, dal, admin_headers):
    db.add(TenantSetting(tenant_id=seed["tenant_a"].id, setting_key="repack_wastage_percent",
                         setting_value="2"))
    db.commit()
    res = client.post(REP, json={"source_product_id": dal["loose"].id,
                                 "items": [{"product_id": dal["1kg"].id, "pack_count": 5}]},
                      headers=admin_headers)
    assert Decimal(res.json()["wastage_quantity"]) == Decimal("0.1")


def test_repack_insufficient_stock(client, db, dal, admin_headers):
    res = client.post(REP, json={"source_product_id": dal["loose"].id,
                                 "items": [{"product_id": dal["1kg"].id, "pack_count": 30}]},
                      headers=admin_headers)
    assert res.status_code == 400
    assert "Not enough" in res.json()["detail"]
    db.expire_all()
    assert db.get(Product, dal["loose"].id).stock_quantity == 30


def test_repack_validation(client, dal, admin_headers):
    # Pack must be own-packed and convertible
    bad = {"source_product_id": dal["loose"].id, "items": [{"product_id": dal["loose"].id, "pack_count": 1}]}
    assert client.post(REP, json=bad, headers=admin_headers).status_code == 400
    dup = {"source_product_id": dal["loose"].id, "items": [{"product_id": dal["1kg"].id, "pack_count": 1}] * 2}
    assert client.post(REP, json=dup, headers=admin_headers).status_code == 422
    zero = {"source_product_id": dal["loose"].id, "items": [{"product_id": dal["1kg"].id, "pack_count": 0}]}
    assert client.post(REP, json=zero, headers=admin_headers).status_code == 422
    neg = body(dal, wastage_quantity=-1)
    assert client.post(REP, json=neg, headers=admin_headers).status_code == 422


def test_repack_access(client, dal, cashier_headers, admin_b_headers):
    assert client.post(REP, json=body(dal), headers=cashier_headers).status_code == 403
    assert client.post(REP, json=body(dal), headers=admin_b_headers).status_code == 404
    assert client.get(f"{REP}/sources/{dal['loose'].id}", headers=admin_b_headers).status_code == 404


def test_list_and_get_repack(client, dal, admin_headers, admin_b_headers):
    rid = client.post(REP, json=body(dal), headers=admin_headers).json()["id"]
    listing = client.get(REP, headers=admin_headers).json()
    assert listing["total"] == 1 and len(listing["items"][0]["items"]) == 3
    assert client.get(REP, headers=admin_b_headers).json()["total"] == 0
    assert client.get(f"{REP}/{rid}", headers=admin_headers).json()["source_product_name"] == "Toor Dal Loose"
    assert client.get(f"{REP}/{rid}", headers=admin_b_headers).status_code == 404
