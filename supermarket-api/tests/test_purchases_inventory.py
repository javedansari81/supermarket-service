"""Purchase and inventory endpoint tests"""
import pytest
from app.core import storage

PUR = "/api/v1/purchases"
INV = "/api/v1/inventory"
PDF_BYTES = b"%PDF-1.4 test bill"


def purchase_body(product, supplier=None, qty=10, cost=40):
    return {"supplier_id": supplier.id if supplier else None, "purchase_date": "2026-09-01",
            "items": [{"product_id": product.id, "quantity": qty, "unit_cost": cost}]}


def stock_of(client, product, headers):
    return float(client.get(f"/api/v1/products/{product.id}", headers=headers).json()["stock_quantity"])


# ---------- Purchases ----------

def test_create_purchase_adds_stock(client, product, supplier, admin_headers):
    res = client.post(PUR, json=purchase_body(product, supplier), headers=admin_headers)
    assert res.status_code == 201
    body = res.json()
    assert float(body["total_amount"]) == 400
    assert body["supplier_name"] == "Acme Traders"
    assert stock_of(client, product, admin_headers) == 110


def test_create_purchase_validation(client, product, admin_headers):
    body = purchase_body(product)
    assert client.post(PUR, json={**body, "items": []}, headers=admin_headers).status_code == 422
    bad_qty = purchase_body(product, qty=0)
    assert client.post(PUR, json=bad_qty, headers=admin_headers).status_code == 422
    bad_cost = purchase_body(product, cost=-1)
    assert client.post(PUR, json=bad_cost, headers=admin_headers).status_code == 422
    assert client.post(PUR, json={"items": body["items"]}, headers=admin_headers).status_code == 422


def test_create_purchase_invalid_references(client, db, product, supplier, admin_headers, admin_b_headers):
    res = client.post(PUR, json={**purchase_body(product), "supplier_id": 99999}, headers=admin_headers)
    assert res.status_code == 400
    supplier.status = "inactive"
    db.commit()
    assert client.post(PUR, json=purchase_body(product, supplier), headers=admin_headers).status_code == 400
    # Product belongs to tenant A
    assert client.post(PUR, json=purchase_body(product), headers=admin_b_headers).status_code == 400


def test_create_purchase_forbidden_for_cashier(client, product, cashier_headers):
    assert client.post(PUR, json=purchase_body(product), headers=cashier_headers).status_code == 403


def test_list_and_get_purchase(client, product, supplier, admin_headers, admin_b_headers):
    pid = client.post(PUR, json=purchase_body(product, supplier), headers=admin_headers).json()["id"]
    assert client.get(PUR, headers=admin_headers).json()["total"] == 1
    assert client.get(PUR, headers=admin_b_headers).json()["total"] == 0
    assert client.get(f"{PUR}/{pid}", headers=admin_headers).status_code == 200
    assert client.get(f"{PUR}/{pid}", headers=admin_b_headers).status_code == 404


def test_update_purchase_items_adjusts_stock(client, product, admin_headers):
    pid = client.post(PUR, json=purchase_body(product, qty=10), headers=admin_headers).json()["id"]
    res = client.put(f"{PUR}/{pid}", json={"items": [{"product_id": product.id, "quantity": 4,
                                                      "unit_cost": 40}]}, headers=admin_headers)
    assert res.status_code == 200
    assert float(res.json()["total_amount"]) == 160
    assert stock_of(client, product, admin_headers) == 104


def test_update_purchase_errors(client, product, admin_headers):
    pid = client.post(PUR, json=purchase_body(product), headers=admin_headers).json()["id"]
    assert client.put(f"{PUR}/{pid}", json={"purchase_date": None},
                      headers=admin_headers).status_code == 400
    assert client.put(f"{PUR}/{pid}", json={"supplier_id": 99999},
                      headers=admin_headers).status_code == 400
    assert client.put(f"{PUR}/99999", json={"remarks": "x"}, headers=admin_headers).status_code == 404


def test_cancel_purchase_reverses_stock(client, product, admin_headers):
    pid = client.post(PUR, json=purchase_body(product), headers=admin_headers).json()["id"]
    res = client.post(f"{PUR}/{pid}/cancel", json={"reason": "Wrong entry"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert stock_of(client, product, admin_headers) == 100
    again = client.post(f"{PUR}/{pid}/cancel", json={}, headers=admin_headers)
    assert again.status_code == 400
    edit = client.put(f"{PUR}/{pid}", json={"remarks": "x"}, headers=admin_headers)
    assert edit.status_code == 400


def test_cancel_purchase_when_stock_already_sold(client, db, product, admin_headers):
    pid = client.post(PUR, json=purchase_body(product, qty=10), headers=admin_headers).json()["id"]
    product.stock_quantity = 5
    db.commit()
    res = client.post(f"{PUR}/{pid}/cancel", json={}, headers=admin_headers)
    assert res.status_code == 400
    assert stock_of(client, product, admin_headers) == 5


def test_purchase_putaway_list(client, category, product, locations, admin_headers, admin_b_headers):
    shelf, backroom = locations["shelf"], locations["backroom"]
    client.put(f"/api/v1/products/{product.id}", headers=admin_headers, json={"locations": [
        {"location_id": backroom.id}, {"location_id": shelf.id}]})
    other = client.post("/api/v1/products", headers=admin_headers, json={
        "product_name": "Salt 1kg", "mrp": 20, "selling_price": 18, "category_id": category.id}).json()
    body = {"purchase_date": "2026-09-01", "items": [
        {"product_id": other["id"], "quantity": 5, "unit_cost": 10},
        {"product_id": product.id, "quantity": 10, "unit_cost": 40}]}
    pid = client.post(PUR, json=body, headers=admin_headers).json()["id"]

    res = client.get(f"{PUR}/{pid}/putaway", headers=admin_headers)
    assert res.status_code == 200
    rows = res.json()
    assert [r["product_name"] for r in rows] == ["Rice 1kg", "Salt 1kg"]
    assert [l["location_code"] for l in rows[0]["locations"]] == ["D01-4", "S01-1"]
    assert [l["floor"] for l in rows[0]["locations"]] == ["Ground", "1st"]
    assert rows[1]["locations"] == []
    assert client.get(f"{PUR}/{pid}/putaway", headers=admin_b_headers).status_code == 404


# ---------- Supplier bill ----------

@pytest.fixture()
def fake_storage(monkeypatch):
    files = {}
    monkeypatch.setattr(storage, "is_configured", lambda: True)
    monkeypatch.setattr(storage, "upload_file", lambda key, content, ct: files.__setitem__(key, content))
    monkeypatch.setattr(storage, "delete_file", lambda key: files.pop(key, None))
    monkeypatch.setattr(storage, "presigned_url", lambda key, name, ct: f"https://r2.test/{key}")
    return files


def upload_bill(client, pid, headers, content=PDF_BYTES, name="bill.pdf"):
    return client.post(f"{PUR}/{pid}/bill", files={"file": (name, content, "application/pdf")},
                       headers=headers)


def test_bill_upload_view_replace_delete(client, product, admin_headers, fake_storage):
    pid = client.post(PUR, json=purchase_body(product), headers=admin_headers).json()["id"]
    res = upload_bill(client, pid, admin_headers)
    assert res.status_code == 200
    assert res.json()["bill_file_name"] == "bill.pdf"
    assert res.json()["bill_content_type"] == "application/pdf"
    assert len(fake_storage) == 1

    view = client.get(f"{PUR}/{pid}/bill", headers=admin_headers)
    assert view.status_code == 200
    assert view.json()["url"].startswith("https://r2.test/bills/")

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 10
    res = upload_bill(client, pid, admin_headers, content=png, name="bill.png")
    assert res.json()["bill_content_type"] == "image/png"
    assert len(fake_storage) == 1

    res = client.delete(f"{PUR}/{pid}/bill", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["bill_file_name"] is None
    assert fake_storage == {}
    assert client.get(f"{PUR}/{pid}/bill", headers=admin_headers).status_code == 404
    assert client.delete(f"{PUR}/{pid}/bill", headers=admin_headers).status_code == 404


def test_bill_upload_errors(client, product, admin_headers, cashier_headers, admin_b_headers,
                            fake_storage):
    pid = client.post(PUR, json=purchase_body(product), headers=admin_headers).json()["id"]
    assert upload_bill(client, pid, admin_headers, content=b"").status_code == 400
    assert upload_bill(client, pid, admin_headers, content=b"MZ not a bill").status_code == 400
    assert upload_bill(client, pid, cashier_headers).status_code == 403
    assert upload_bill(client, pid, admin_b_headers).status_code == 404
    assert upload_bill(client, 99999, admin_headers).status_code == 404
    assert fake_storage == {}


def test_bill_upload_too_large(client, product, admin_headers, fake_storage, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.BILL_MAX_SIZE_MB", 0)
    pid = client.post(PUR, json=purchase_body(product), headers=admin_headers).json()["id"]
    assert upload_bill(client, pid, admin_headers).status_code == 413


def test_bill_storage_not_configured(client, product, admin_headers, monkeypatch):
    monkeypatch.setattr(storage, "is_configured", lambda: False)
    pid = client.post(PUR, json=purchase_body(product), headers=admin_headers).json()["id"]
    assert upload_bill(client, pid, admin_headers).status_code == 503


# ---------- Inventory ----------

def test_stock_listing(client, product, cashier_headers, admin_b_headers):
    res = client.get(f"{INV}/stock", headers=cashier_headers)
    assert res.status_code == 200
    assert client.get(f"{INV}/stock", headers=admin_b_headers).status_code == 200


def test_adjust_stock_in_and_out(client, product, admin_headers):
    body = {"product_id": product.id, "adjustment_type": "adjustment_in", "quantity": 5}
    res = client.post(f"{INV}/adjust", json=body, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["new_stock"] == 105
    body = {"product_id": product.id, "adjustment_type": "damage_out", "quantity": 15}
    assert client.post(f"{INV}/adjust", json=body, headers=admin_headers).json()["new_stock"] == 90


def test_adjust_stock_errors(client, product, admin_headers, cashier_headers, admin_b_headers):
    def adjust(adj_type="adjustment_out", qty=1, headers=admin_headers, pid=product.id):
        body = {"product_id": pid, "adjustment_type": adj_type, "quantity": qty}
        return client.post(f"{INV}/adjust", json=body, headers=headers)

    assert adjust(adj_type="teleport").status_code == 400
    assert adjust(qty=1000).status_code == 400
    assert adjust(qty=0).status_code == 422
    assert adjust(qty=-3).status_code == 422
    assert adjust(pid=99999).status_code == 404
    assert adjust(headers=admin_b_headers).status_code == 404
    assert adjust(headers=cashier_headers).status_code == 403
    assert stock_of(client, product, admin_headers) == 100


def test_stock_movements(client, product, admin_headers, admin_b_headers):
    body = {"product_id": product.id, "adjustment_type": "adjustment_in", "quantity": 5}
    client.post(f"{INV}/adjust", json=body, headers=admin_headers)
    res = client.get(f"{INV}/movements", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["movement_type"] == "adjustment_in"
    assert client.get(f"{INV}/movements", headers=admin_b_headers).json()["total"] == 0
