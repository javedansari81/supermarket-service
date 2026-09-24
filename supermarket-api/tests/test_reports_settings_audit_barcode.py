"""Report, settings, audit and barcode endpoint tests"""
REP = "/api/v1/reports"
SET = "/api/v1/settings"
AUD = "/api/v1/audit"
BAR = "/api/v1/barcode"
WIDE = {"from_date": "2000-01-01", "to_date": "2100-01-01"}
PAST = {"from_date": "2000-01-01", "to_date": "2000-01-31"}


def sell(client, product, headers, qty=2):
    body = {"items": [{"product_id": product.id, "quantity": qty}]}
    return client.post("/api/v1/sales", json=body, headers=headers)


# ---------- Reports ----------

def test_dashboard(client, product, cashier_headers):
    assert client.get(f"{REP}/dashboard", headers=cashier_headers).status_code == 200


def test_dashboard_uses_ist_day(client, db, product, cashier_headers):
    from datetime import datetime, timedelta
    from app.api.v1.endpoints.reports import IST, ist_day_start_utc
    from app.models import Sale
    today_start = ist_day_start_utc(datetime.now(IST).date())
    early_today = sell(client, product, cashier_headers).json()["id"]
    late_yesterday = sell(client, product, cashier_headers).json()["id"]
    db.get(Sale, early_today).sale_date = today_start + timedelta(minutes=1)
    db.get(Sale, late_yesterday).sale_date = today_start - timedelta(minutes=1)
    db.commit()
    res = client.get(f"{REP}/dashboard", headers=cashier_headers).json()
    assert res["today_transactions"] == 1
    assert res["today_sales"] == 110


def test_sales_summary(client, product, admin_headers, admin_b_headers):
    sell(client, product, admin_headers)
    res = client.get(f"{REP}/sales-summary", params=WIDE, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["summary"]["total_sales"] == 110
    assert res.json()["summary"]["total_transactions"] == 1
    other = client.get(f"{REP}/sales-summary", params=WIDE, headers=admin_b_headers)
    assert other.json()["summary"]["total_sales"] == 0


def test_top_products(client, product, admin_headers):
    sell(client, product, admin_headers)
    res = client.get(f"{REP}/top-products", params=WIDE, headers=admin_headers)
    assert res.json()["products"][0]["total_quantity"] == 2


def test_category_sales_respects_date_range(client, product, admin_headers):
    sell(client, product, admin_headers)
    wide = client.get(f"{REP}/category-sales", params=WIDE, headers=admin_headers).json()
    assert wide["categories"][0]["total_sales"] == 110
    past = client.get(f"{REP}/category-sales", params=PAST, headers=admin_headers).json()
    assert past["categories"][0]["total_sales"] == 0
    assert past["categories"][0]["total_quantity"] == 0


def test_cashier_performance_and_stock_report(client, product, admin_headers):
    sell(client, product, admin_headers)
    assert client.get(f"{REP}/cashier-performance", params=WIDE, headers=admin_headers).status_code == 200
    assert client.get(f"{REP}/stock-report", headers=admin_headers).status_code == 200


def test_reports_validation_and_role(client, seed, admin_headers, cashier_headers):
    for path in ("sales-summary", "top-products", "category-sales", "cashier-performance"):
        assert client.get(f"{REP}/{path}", headers=admin_headers).status_code == 422
        reversed_range = {"from_date": "2026-02-01", "to_date": "2026-01-01"}
        assert client.get(f"{REP}/{path}", params=reversed_range, headers=admin_headers).status_code == 400
        assert client.get(f"{REP}/{path}", params=WIDE, headers=cashier_headers).status_code == 403
    assert client.get(f"{REP}/stock-report", headers=cashier_headers).status_code == 403
    assert client.get(f"{REP}/dashboard").status_code == 401


# ---------- Settings ----------

def test_store_settings_roundtrip(client, seed, admin_headers, cashier_headers, admin_b_headers):
    body = {"store_name": "Mart A", "store_address": "MG Road", "gstin": "27abcde1234f1z5"}
    res = client.put(f"{SET}/store", json=body, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["gstin"] == "27ABCDE1234F1Z5"
    assert res.json()["store_state_code"] == "27"
    assert client.get(f"{SET}/store", headers=cashier_headers).json()["store_name"] == "Mart A"
    assert client.get(f"{SET}/store", headers=admin_b_headers).json()["store_name"] != "Mart A"


def test_store_settings_validation_and_role(client, seed, admin_headers, cashier_headers):
    assert client.put(f"{SET}/store", json={"gstin": "BAD"}, headers=admin_headers).status_code == 422
    assert client.put(f"{SET}/store", json={"fssai_license": "123"}, headers=admin_headers).status_code == 422
    assert client.put(f"{SET}/store", json={"store_name": "X"}, headers=cashier_headers).status_code == 403


def test_billing_settings(client, seed, admin_headers, cashier_headers):
    body = {"tax_inclusive_pricing": False, "default_tax_percent": 12, "invoice_prefix": "BL"}
    assert client.put(f"{SET}/billing", json=body, headers=admin_headers).status_code == 200
    res = client.get(f"{SET}/billing", headers=cashier_headers).json()
    assert res["tax_inclusive_pricing"] is False and res["invoice_prefix"] == "BL"
    assert client.put(f"{SET}/billing", json={"default_tax_percent": 150},
                      headers=admin_headers).status_code == 422
    assert client.put(f"{SET}/billing", json=body, headers=cashier_headers).status_code == 403
    assert client.get(SET, headers=admin_headers).status_code == 200


def test_tax_exclusive_pricing_applied_to_sale(client, product, admin_headers):
    client.put(f"{SET}/billing", json={"tax_inclusive_pricing": False}, headers=admin_headers)
    assert float(sell(client, product, admin_headers).json()["total_amount"]) == 115.5


# ---------- Audit ----------

def test_audit_logs(client, product, admin_headers, cashier_headers, admin_b_headers):
    sell(client, product, cashier_headers)
    res = client.get(AUD, params={"entity_type": "sale"}, headers=admin_headers)
    assert res.status_code == 200 and res.json()["total"] == 1
    audit_id = res.json()["items"][0]["id"]
    assert client.get(f"{AUD}/{audit_id}", headers=admin_headers).status_code == 200
    assert client.get(f"{AUD}/{audit_id}", headers=admin_b_headers).status_code == 404
    assert client.get(AUD, headers=admin_b_headers).json()["total"] == 0


def test_audit_access_control(client, seed, admin_headers, cashier_headers):
    for path in ("", "/actions", "/entity-types"):
        assert client.get(f"{AUD}{path}", headers=cashier_headers).status_code == 403
        assert client.get(f"{AUD}{path}").status_code == 401
    assert client.get(f"{AUD}/actions", headers=admin_headers).status_code == 200
    assert client.get(f"{AUD}/entity-types", headers=admin_headers).status_code == 200


# ---------- Barcode ----------

def test_barcode_label(client, db, seed, product, cashier_headers, admin_b_headers):
    res = client.get(f"{BAR}/generate/{product.id}", headers=cashier_headers)
    assert res.status_code == 200 and res.json()["barcode_image"]
    assert client.get(f"{BAR}/generate/{product.id}", headers=admin_b_headers).status_code == 404


def test_barcode_print(client, product, cashier_headers):
    body = {"product_ids": [product.id, 99999], "copies": 2}
    assert client.post(f"{BAR}/print", json=body, headers=cashier_headers).json()["count"] == 2
    assert client.post(f"{BAR}/print", json={"product_ids": []}, headers=cashier_headers).status_code == 422
    assert client.post(f"{BAR}/print", json={"product_ids": [product.id], "copies": 0},
                       headers=cashier_headers).status_code == 422


def test_generate_barcode_code(client, db, seed, product, admin_headers, cashier_headers):
    from app.models import Product
    bare = Product(tenant_id=seed["tenant_a"].id, product_no="P0002", product_name="Salt",
                   mrp=20, selling_price=20, unit_type="pcs", stock_quantity=5)
    db.add(bare)
    db.commit()
    assert client.get(f"{BAR}/generate/{bare.id}", headers=admin_headers).status_code == 400
    assert client.post(f"{BAR}/generate-code", params={"product_id": bare.id},
                       headers=cashier_headers).status_code == 403
    res = client.post(f"{BAR}/generate-code", params={"product_id": bare.id}, headers=admin_headers)
    assert res.status_code == 200 and res.json()["barcode"]
    again = client.post(f"{BAR}/generate-code", params={"product_id": product.id}, headers=admin_headers)
    assert again.json()["message"] == "Product already has a barcode"


def test_packed_labels(client, product, admin_headers):
    body = {"product_id": product.id, "net_quantity": 1, "net_unit": "kg",
            "packed_date": "2026-09-01", "copies": 3}
    assert client.post(f"{BAR}/packed-labels", json=body, headers=admin_headers).status_code == 400
    client.put(f"{SET}/store", json={"store_name": "Mart A", "store_address": "MG Road"}, headers=admin_headers)
    res = client.post(f"{BAR}/packed-labels", json=body, headers=admin_headers)
    assert res.status_code == 200 and res.json()["count"] == 3
    bad_dates = {**body, "best_before_date": "2026-08-01"}
    assert client.post(f"{BAR}/packed-labels", json=bad_dates, headers=admin_headers).status_code == 422
    assert client.post(f"{BAR}/packed-labels", json={**body, "net_unit": "ton"},
                       headers=admin_headers).status_code == 422


def test_barcode_configs(client, seed, admin_headers, cashier_headers):
    body = {"config_name": "Default", "is_default": True}
    assert client.post(f"{BAR}/configs", json=body, headers=admin_headers).status_code == 201
    assert client.post(f"{BAR}/configs", json=body, headers=admin_headers).status_code == 400
    assert client.post(f"{BAR}/configs", json=body, headers=cashier_headers).status_code == 403
    assert len(client.get(f"{BAR}/configs", headers=cashier_headers).json()["items"]) == 1
