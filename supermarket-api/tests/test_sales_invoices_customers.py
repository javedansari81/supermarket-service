"""Sale, invoice and customer endpoint tests"""
SALES = "/api/v1/sales"
INV = "/api/v1/invoices"
CUST = "/api/v1/customers"
MOBILE = "9876543210"


def sell(client, product, headers, qty=2, **extra):
    body = {"items": [{"product_id": product.id, "quantity": qty}], **extra}
    return client.post(SALES, json=body, headers=headers)


def stock_of(client, product, headers):
    return float(client.get(f"/api/v1/products/{product.id}", headers=headers).json()["stock_quantity"])


# ---------- Sales ----------

def test_create_sale_computes_totals_and_invoice(client, product, cashier_headers):
    res = sell(client, product, cashier_headers)
    assert res.status_code == 201
    body = res.json()
    assert float(body["total_amount"]) == 110
    assert float(body["tax_amount"]) == 5.24
    assert float(body["cgst_amount"]) + float(body["sgst_amount"]) == 5.24
    assert body["payment_mode"] == "cash"
    assert body["invoice_no"]
    assert stock_of(client, product, cashier_headers) == 98


def test_create_sale_with_discount(client, product, cashier_headers):
    body = {"items": [{"product_id": product.id, "quantity": 2, "discount_percent": 10}]}
    res = client.post(SALES, json=body, headers=cashier_headers)
    assert res.status_code == 201
    assert float(res.json()["discount_amount"]) == 11
    assert float(res.json()["total_amount"]) == 99


def test_create_sale_rejects_bad_input(client, product, cashier_headers):
    assert client.post(SALES, json={"items": []}, headers=cashier_headers).status_code == 400
    assert sell(client, product, cashier_headers, qty=0).status_code == 400
    assert sell(client, product, cashier_headers, qty=1.5).status_code == 400
    assert sell(client, product, cashier_headers, qty=1000).status_code == 400
    assert sell(client, product, cashier_headers, payment_mode="bitcoin").status_code == 422
    assert sell(client, product, cashier_headers, customer_phone="12345").status_code == 422
    assert sell(client, product, cashier_headers, customer_gstin="BAD").status_code == 422
    assert sell(client, product, cashier_headers, place_of_supply_code="99").status_code == 422
    body = {"items": [{"product_id": product.id, "quantity": 1, "discount_percent": 101}]}
    assert client.post(SALES, json=body, headers=cashier_headers).status_code == 422


def test_create_sale_b2b_requires_name(client, product, cashier_headers):
    res = sell(client, product, cashier_headers, customer_gstin="27ABCDE1234F1Z5")
    assert res.status_code == 400


def test_failed_sale_leaves_no_trace(client, product, cashier_headers):
    body = {"items": [{"product_id": product.id, "quantity": 1},
                      {"product_id": 99999, "quantity": 1}]}
    assert client.post(SALES, json=body, headers=cashier_headers).status_code == 400
    assert client.get(SALES, headers=cashier_headers).json()["total"] == 0
    assert stock_of(client, product, cashier_headers) == 100


def test_create_sale_inactive_or_foreign_product(client, db, product, cashier_headers, admin_b_headers):
    assert sell(client, product, admin_b_headers).status_code == 400
    product.status = "inactive"
    db.commit()
    assert sell(client, product, cashier_headers).status_code == 400


def test_create_sale_requires_auth(client, product):
    assert sell(client, product, {}).status_code == 401


def test_list_and_get_sales(client, product, cashier_headers, admin_b_headers):
    sale_id = sell(client, product, cashier_headers).json()["id"]
    assert client.get(SALES, headers=cashier_headers).json()["total"] == 1
    assert client.get(SALES, params={"status": "cancelled"}, headers=cashier_headers).json()["total"] == 0
    assert client.get(SALES, headers=admin_b_headers).json()["total"] == 0
    assert client.get(f"{SALES}/{sale_id}", headers=cashier_headers).status_code == 200
    assert client.get(f"{SALES}/{sale_id}", headers=admin_b_headers).status_code == 404
    assert client.get(SALES, params={"page_size": 500}, headers=cashier_headers).status_code == 422


# ---------- Held bills ----------

HELD = "/api/v1/held-bills"


def hold(client, product, headers, qty=2, **extra):
    item = {"product_id": product.id, "product_name": product.product_name, "quantity": qty,
            "unit_price": 55, "tax_percent": 5, "line_total": 55 * qty}
    return client.post(HELD, json={"items": [item], **extra}, headers=headers)


def test_hold_and_recall_bill_keeps_stock(client, product, cashier_headers):
    res = hold(client, product, cashier_headers, label="Blue shirt", customer_phone="+91 98765 43210")
    assert res.status_code == 201
    body = res.json()
    assert body["item_count"] == 1
    assert float(body["total_amount"]) == 110
    assert body["customer_phone"] == MOBILE
    assert body["cashier_name"] == "Cashier_A"
    assert stock_of(client, product, cashier_headers) == 100

    recalled = client.get(f"{HELD}/{body['id']}", headers=cashier_headers).json()
    assert recalled["label"] == "Blue shirt"
    assert float(recalled["items"][0]["quantity"]) == 2
    assert client.get(HELD, headers=cashier_headers).json()["total"] == 1


def test_hold_bill_rejects_bad_input(client, product, cashier_headers):
    assert client.post(HELD, json={"items": []}, headers=cashier_headers).status_code == 422
    assert hold(client, product, cashier_headers, qty=0).status_code == 422
    assert hold(client, product, cashier_headers, customer_phone="12345").status_code == 422
    assert hold(client, product, {}).status_code == 401


def test_update_held_bill(client, product, cashier_headers):
    held_id = hold(client, product, cashier_headers).json()["id"]
    item = {"product_id": product.id, "product_name": product.product_name, "quantity": 3,
            "unit_price": 55, "line_total": 165}
    res = client.put(f"{HELD}/{held_id}", json={"items": [item]}, headers=cashier_headers)
    assert res.status_code == 200
    assert float(res.json()["total_amount"]) == 165
    assert client.get(HELD, headers=cashier_headers).json()["total"] == 1


def test_held_bill_visibility(client, product, cashier_headers, supervisor_headers,
                              admin_headers, admin_b_headers):
    held_id = hold(client, product, supervisor_headers).json()["id"]
    assert client.get(HELD, headers=cashier_headers).json()["total"] == 0
    assert client.get(f"{HELD}/{held_id}", headers=cashier_headers).status_code == 404
    assert client.delete(f"{HELD}/{held_id}", headers=cashier_headers).status_code == 404
    assert client.get(HELD, headers=admin_headers).json()["total"] == 1
    assert client.get(HELD, headers=admin_b_headers).json()["total"] == 0
    assert client.get(f"{HELD}/{held_id}", headers=admin_b_headers).status_code == 404


def test_held_bill_limit_per_cashier(client, product, cashier_headers, supervisor_headers):
    for _ in range(10):
        assert hold(client, product, cashier_headers).status_code == 201
    assert hold(client, product, cashier_headers).status_code == 400
    assert hold(client, product, supervisor_headers).status_code == 201


def test_discard_held_bill_is_audited(client, product, cashier_headers, admin_headers):
    held_id = hold(client, product, cashier_headers).json()["id"]
    assert client.delete(f"{HELD}/{held_id}", headers=cashier_headers).status_code == 204
    assert client.get(HELD, headers=cashier_headers).json()["total"] == 0
    logs = client.get("/api/v1/audit", params={"entity_type": "held_bill"}, headers=admin_headers).json()["items"]
    assert any(log["action"] == "delete" and log["entity_id"] == held_id
               and log["summary"].startswith("Discarded held bill") for log in logs)


def test_sale_from_held_bill_removes_it(client, product, cashier_headers):
    held_id = hold(client, product, cashier_headers).json()["id"]
    res = sell(client, product, cashier_headers, held_bill_id=held_id)
    assert res.status_code == 201
    assert client.get(HELD, headers=cashier_headers).json()["total"] == 0
    assert stock_of(client, product, cashier_headers) == 98


def test_failed_sale_keeps_held_bill(client, product, cashier_headers):
    held_id = hold(client, product, cashier_headers).json()["id"]
    assert sell(client, product, cashier_headers, qty=1000, held_bill_id=held_id).status_code == 400
    assert client.get(HELD, headers=cashier_headers).json()["total"] == 1


def test_sale_ignores_missing_held_bill(client, product, cashier_headers):
    assert sell(client, product, cashier_headers, held_bill_id=99999).status_code == 201


# ---------- Invoices ----------

def test_invoice_list_get_and_print(client, product, cashier_headers, admin_b_headers):
    sale = sell(client, product, cashier_headers).json()
    res = client.get(INV, headers=cashier_headers)
    assert res.status_code == 200 and res.json()["total"] == 1
    assert client.get(INV, headers=admin_b_headers).json()["total"] == 0
    invoice_id = sale["invoice_id"]
    assert client.get(f"{INV}/{invoice_id}", headers=cashier_headers).json()["invoice_no"] == sale["invoice_no"]
    assert client.get(f"{INV}/{invoice_id}", headers=admin_b_headers).status_code == 404
    printed = client.get(f"{INV}/{invoice_id}/print", headers=cashier_headers)
    assert printed.status_code == 200
    assert printed.json()["total_amount"] == 110
    assert client.get(f"{INV}/99999/print", headers=cashier_headers).status_code == 404


def test_invoice_from_sale_is_idempotent(client, product, cashier_headers, admin_b_headers):
    sale = sell(client, product, cashier_headers).json()
    res = client.post(f"{INV}/from-sale/{sale['id']}", headers=cashier_headers)
    assert res.status_code == 201
    assert res.json()["invoice_no"] == sale["invoice_no"]
    assert client.get(INV, headers=cashier_headers).json()["total"] == 1
    assert client.post(f"{INV}/from-sale/{sale['id']}", headers=admin_b_headers).status_code == 404


# ---------- Customers ----------

def test_sale_creates_customer(client, product, cashier_headers, admin_b_headers):
    sell(client, product, cashier_headers, customer_phone="+91 98765 43210", customer_name="Asha")
    res = client.get(CUST, headers=cashier_headers)
    assert res.status_code == 200 and res.json()["total"] == 1
    customer = res.json()["items"][0]
    assert customer["mobile"] == MOBILE
    assert customer["visits"] == 1
    assert client.get(CUST, headers=admin_b_headers).json()["total"] == 0


def test_customer_lookup(client, product, cashier_headers, admin_b_headers):
    sell(client, product, cashier_headers, customer_phone=MOBILE)
    assert client.get(f"{CUST}/lookup", params={"mobile": MOBILE}, headers=cashier_headers).status_code == 200
    assert client.get(f"{CUST}/lookup", params={"mobile": "123"}, headers=cashier_headers).status_code == 400
    assert client.get(f"{CUST}/lookup", params={"mobile": "9000000000"},
                      headers=cashier_headers).status_code == 404
    assert client.get(f"{CUST}/lookup", params={"mobile": MOBILE}, headers=admin_b_headers).status_code == 404


def test_customer_get_update_and_sales(client, product, cashier_headers, admin_b_headers):
    sell(client, product, cashier_headers, customer_phone=MOBILE)
    cid = client.get(CUST, headers=cashier_headers).json()["items"][0]["id"]
    assert client.get(f"{CUST}/{cid}", headers=cashier_headers).status_code == 200
    assert client.get(f"{CUST}/{cid}", headers=admin_b_headers).status_code == 404
    assert client.get(f"{CUST}/{cid}/sales", headers=cashier_headers).json()["total"] == 1
    res = client.put(f"{CUST}/{cid}", json={"customer_name": "Asha"}, headers=cashier_headers)
    assert res.status_code == 200 and res.json()["customer_name"] == "Asha"
    assert client.put(f"{CUST}/{cid}", json={"status": "x"}, headers=cashier_headers).status_code == 422
    assert client.put(f"{CUST}/{cid}", json={"customer_gstin": "BAD"},
                      headers=cashier_headers).status_code == 422
    assert client.put(f"{CUST}/{cid}", json={"customer_name": "X"},
                      headers=admin_b_headers).status_code == 404


# ---------- Returns and void ----------

RETURNS = "/api/v1/sale-returns"


def return_items(client, sale, headers, qty=1, restock=True, reason="Damaged pack"):
    body = {"items": [{"sale_item_id": sale["items"][0]["id"], "quantity": qty, "restock": restock}],
            "reason": reason}
    return client.post(f"{SALES}/{sale['id']}/returns", json=body, headers=headers)


def backdate(db, sale, days):
    from datetime import datetime, timedelta
    from app.models import Sale
    db.query(Sale).filter(Sale.id == sale["id"]).update(
        {Sale.sale_date: datetime.utcnow() - timedelta(days=days)})
    db.commit()


def test_partial_then_full_return(client, product, cashier_headers):
    sale = sell(client, product, cashier_headers).json()
    res = return_items(client, sale, cashier_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["return_no"].startswith("CN")
    assert float(body["total_amount"]) == 55
    assert float(body["tax_amount"]) == 2.62
    assert body["refund_mode"] == "cash" and body["window_override"] is False
    assert stock_of(client, product, cashier_headers) == 99
    assert client.get(f"{SALES}/{sale['id']}", headers=cashier_headers).json()["status"] == "completed"

    info = client.get(f"{SALES}/{sale['id']}/returnable", headers=cashier_headers).json()
    assert float(info["items"][0]["returnable_quantity"]) == 1
    assert float(info["returned_amount"]) == 55
    assert info["can_void"] is False

    assert return_items(client, sale, cashier_headers, qty=2).status_code == 400
    res = return_items(client, sale, cashier_headers)
    assert res.status_code == 201 and float(res.json()["tax_amount"]) == 2.62
    assert client.get(f"{SALES}/{sale['id']}", headers=cashier_headers).json()["status"] == "refunded"
    assert return_items(client, sale, cashier_headers).status_code == 400
    assert client.get(RETURNS, headers=cashier_headers).json()["total"] == 2


def test_return_without_restock(client, product, cashier_headers):
    sale = sell(client, product, cashier_headers).json()
    assert return_items(client, sale, cashier_headers, restock=False).status_code == 201
    assert stock_of(client, product, cashier_headers) == 98


def test_return_rejects_bad_input(client, product, cashier_headers, admin_b_headers):
    sale = sell(client, product, cashier_headers).json()
    assert return_items(client, sale, cashier_headers, qty=0.5).status_code == 400
    assert return_items(client, sale, cashier_headers, qty=0).status_code == 422
    assert return_items(client, sale, cashier_headers, reason=" ").status_code == 422
    assert return_items(client, sale, admin_b_headers).status_code == 404
    body = {"items": [{"sale_item_id": 99999, "quantity": 1}], "reason": "x"}
    assert client.post(f"{SALES}/{sale['id']}/returns", json=body, headers=cashier_headers).status_code == 400


def test_return_window_cashier_vs_admin(client, db, product, cashier_headers, admin_headers):
    sale = sell(client, product, cashier_headers).json()
    backdate(db, sale, 7)
    assert return_items(client, sale, cashier_headers).status_code == 201
    backdate(db, sale, 8)
    info = client.get(f"{SALES}/{sale['id']}/returnable", headers=cashier_headers).json()
    assert info["within_window"] is False and info["can_return"] is False
    assert return_items(client, sale, cashier_headers).status_code == 403
    res = return_items(client, sale, admin_headers)
    assert res.status_code == 201 and res.json()["window_override"] is True


def test_return_window_supervisor(client, db, product, cashier_headers, supervisor_headers, admin_headers):
    sale = sell(client, product, cashier_headers, qty=3).json()
    backdate(db, sale, 15)
    info = client.get(f"{SALES}/{sale['id']}/returnable", headers=supervisor_headers).json()
    assert info["within_window"] is False and info["can_return"] is True
    res = return_items(client, sale, supervisor_headers)
    assert res.status_code == 201 and res.json()["window_override"] is True
    backdate(db, sale, 16)
    assert return_items(client, sale, supervisor_headers).status_code == 403
    assert return_items(client, sale, admin_headers).status_code == 201


def test_void_rules_supervisor(client, db, product, cashier_headers, supervisor_headers, admin_headers):
    void = {"reason": "Mistake"}
    sale = sell(client, product, cashier_headers).json()
    backdate(db, sale, 7)
    assert client.post(f"{SALES}/{sale['id']}/void", json=void, headers=cashier_headers).status_code == 403
    assert client.post(f"{SALES}/{sale['id']}/void", json=void, headers=supervisor_headers).status_code == 200

    admin_sale = sell(client, product, admin_headers).json()
    assert client.post(f"{SALES}/{admin_sale['id']}/void", json=void,
                       headers=supervisor_headers).status_code == 200

    old_sale = sell(client, product, cashier_headers).json()
    backdate(db, old_sale, 8)
    info = client.get(f"{SALES}/{old_sale['id']}/returnable", headers=supervisor_headers).json()
    assert info["can_void"] is False
    assert client.post(f"{SALES}/{old_sale['id']}/void", json=void, headers=supervisor_headers).status_code == 403
    assert client.post(f"{SALES}/{old_sale['id']}/void", json=void, headers=admin_headers).status_code == 200


def test_void_sale_restores_stock(client, product, cashier_headers):
    sale = sell(client, product, cashier_headers).json()
    res = client.post(f"{SALES}/{sale['id']}/void", json={"reason": "Wrong item billed"},
                      headers=cashier_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled" and res.json()["void_reason"] == "Wrong item billed"
    assert stock_of(client, product, cashier_headers) == 100
    assert client.post(f"{SALES}/{sale['id']}/void", json={"reason": "again"},
                       headers=cashier_headers).status_code == 400
    assert return_items(client, sale, cashier_headers).status_code == 400


def test_void_rules(client, db, product, cashier_headers, admin_headers, admin_b_headers):
    void = {"reason": "Mistake"}
    admin_sale = sell(client, product, admin_headers).json()
    assert client.post(f"{SALES}/{admin_sale['id']}/void", json=void, headers=cashier_headers).status_code == 403
    assert client.post(f"{SALES}/{admin_sale['id']}/void", json=void, headers=admin_b_headers).status_code == 404
    assert client.post(f"{SALES}/{admin_sale['id']}/void", json={"reason": ""},
                       headers=admin_headers).status_code == 422

    old_sale = sell(client, product, cashier_headers).json()
    backdate(db, old_sale, 1)
    assert client.post(f"{SALES}/{old_sale['id']}/void", json=void, headers=cashier_headers).status_code == 403
    assert client.post(f"{SALES}/{old_sale['id']}/void", json=void, headers=admin_headers).status_code == 200

    returned_sale = sell(client, product, cashier_headers).json()
    return_items(client, returned_sale, cashier_headers)
    assert client.post(f"{SALES}/{returned_sale['id']}/void", json=void,
                       headers=admin_headers).status_code == 400


def test_reports_customers_and_audit_use_net_sales(client, product, cashier_headers, admin_headers):
    from datetime import date
    sale = sell(client, product, cashier_headers, customer_phone=MOBILE).json()
    voided = sell(client, product, cashier_headers).json()
    client.post(f"{SALES}/{voided['id']}/void", json={"reason": "Mistake"}, headers=cashier_headers)
    return_items(client, sale, cashier_headers)

    dash = client.get("/api/v1/reports/dashboard", headers=cashier_headers).json()
    assert dash["today_sales"] == 55 and dash["today_transactions"] == 1
    assert dash["returns_today"] == {"count": 1, "amount": 55}
    assert dash["cancelled_today"]["count"] == 1

    today = str(date.today())
    params = {"from_date": today, "to_date": today}
    summary = client.get("/api/v1/reports/sales-summary", params=params,
                         headers=admin_headers).json()["summary"]
    assert summary["gross_sales"] == 110 and summary["total_returns"] == 55
    assert summary["total_sales"] == 55
    top = client.get("/api/v1/reports/top-products", params=params, headers=admin_headers).json()
    assert top["products"][0]["total_quantity"] == 1

    customer = client.get(CUST, headers=cashier_headers).json()["items"][0]
    assert float(customer["total_spent"]) == 55

    logs = client.get("/api/v1/audit", params={"entity_type": "sale_return"},
                      headers=admin_headers).json()["items"]
    assert logs and logs[0]["reference"].startswith("CN")
    logs = client.get("/api/v1/audit", params={"entity_type": "sale", "entity_id": voided["id"]},
                      headers=admin_headers).json()["items"]
    assert any(log["summary"].startswith("Voided") for log in logs)


# ---------- Batches ----------

def buy_batch(client, product, headers, qty=10, **line):
    body = {"purchase_date": "2026-09-01",
            "items": [{"product_id": product.id, "quantity": qty, "unit_cost": 45, **line}]}
    return client.post("/api/v1/purchases", json=body, headers=headers).json()["items"][0]["batch_id"]


def batch_left(client, product, headers):
    batches = client.get(f"/api/v1/products/{product.id}/batches", params={"in_stock": False},
                         headers=headers).json()
    return {b["id"]: float(b["quantity_left"]) for b in batches}


def test_sale_with_different_mrps_needs_batch(client, product, admin_headers, cashier_headers):
    new_id = buy_batch(client, product, admin_headers, mrp=65, selling_price=62)
    res = sell(client, product, cashier_headers)
    assert res.status_code == 409
    assert "different MRPs" in res.json()["detail"]

    body = {"items": [{"product_id": product.id, "quantity": 2, "batch_id": new_id}]}
    res = client.post(SALES, json=body, headers=cashier_headers)
    assert res.status_code == 201
    item = res.json()["items"][0]
    assert item["batch_id"] == new_id
    assert float(item["mrp"]) == 65 and float(item["unit_price"]) == 62
    assert batch_left(client, product, cashier_headers)[new_id] == 8
    assert stock_of(client, product, cashier_headers) == 108

    body["items"][0]["quantity"] = 9
    assert client.post(SALES, json=body, headers=cashier_headers).status_code == 400


def test_sale_same_mrp_takes_first_expiry_first(client, product, admin_headers, cashier_headers):
    early = buy_batch(client, product, admin_headers, qty=5, mrp=60, selling_price=55,
                      expiry_date="2026-10-15")
    res = sell(client, product, cashier_headers, qty=7)
    assert res.status_code == 201
    items = res.json()["items"]
    assert [(i["batch_id"], float(i["quantity"])) for i in items][0] == (early, 5)
    assert sum(float(i["quantity"]) for i in items) == 7
    assert float(res.json()["total_amount"]) == 385
    left = batch_left(client, product, cashier_headers)
    assert left[early] == 0 and sum(left.values()) == 98


def test_return_and_void_restock_the_sold_batch(client, product, admin_headers, cashier_headers):
    new_id = buy_batch(client, product, admin_headers, mrp=65, selling_price=62)
    body = {"items": [{"product_id": product.id, "quantity": 3, "batch_id": new_id}]}
    sale = client.post(SALES, json=body, headers=cashier_headers).json()
    assert return_items(client, sale, cashier_headers).status_code == 201
    assert batch_left(client, product, cashier_headers)[new_id] == 8
    res = client.post(f"{SALES}/{sale['id']}/void", json={"reason": "Mistake"}, headers=admin_headers)
    assert res.status_code == 400  # partly returned sales cannot be voided

    sale = client.post(SALES, json=body, headers=cashier_headers).json()
    assert batch_left(client, product, cashier_headers)[new_id] == 5
    res = client.post(f"{SALES}/{sale['id']}/void", json={"reason": "Mistake"}, headers=cashier_headers)
    assert res.status_code == 200
    assert batch_left(client, product, cashier_headers)[new_id] == 8
    assert stock_of(client, product, cashier_headers) == 108


def test_scan_batch_barcode_identifies_batch(client, db, product, admin_headers, cashier_headers):
    from app.models.product_batch import ProductBatch
    from app.core.batches import ensure_batch_barcode
    new_id = buy_batch(client, product, admin_headers, mrp=65, selling_price=62)
    res = client.get("/api/v1/products/search", params={"barcode": product.barcode}, headers=cashier_headers)
    assert res.status_code == 200
    assert res.json()["batch_id"] is None and len(res.json()["batches"]) == 2

    code = ensure_batch_barcode(db, db.get(ProductBatch, new_id))
    db.commit()
    assert code.startswith("29") and len(code) == 13 and code != product.barcode

    res = client.get("/api/v1/products/search", params={"barcode": code}, headers=cashier_headers)
    assert res.status_code == 200
    assert res.json()["batch_id"] == new_id
    assert float(res.json()["mrp"]) == 65 and float(res.json()["selling_price"]) == 62


# ---------- Near-expiry (clearance) discounts ----------

CLEAR = "/api/v1/clearance"


def expiring_in(days):
    from datetime import timedelta
    from app.core.clearance import today_ist
    return (today_ist() + timedelta(days=days)).isoformat()


def sell_line(client, headers, **line):
    return client.post(SALES, json={"items": [line]}, headers=headers)


def test_clearance_tiers_apply_to_near_expiry_batch(client, product, category, admin_headers,
                                                    cashier_headers):
    early = buy_batch(client, product, admin_headers, qty=20, mrp=60, selling_price=55,
                      expiry_date=expiring_in(5))
    line = {"product_id": product.id, "quantity": 2}
    # Off until switched on
    item = sell_line(client, cashier_headers, **line).json()["items"][0]
    assert item["batch_id"] == early and float(item["discount_amount"]) == 0
    assert item["discount_source"] is None

    assert client.put(f"{CLEAR}/settings", json={"enabled": True}, headers=cashier_headers).status_code == 403
    assert client.put(f"{CLEAR}/settings", json={"enabled": True}, headers=admin_headers).status_code == 200
    res = client.get("/api/v1/products/search", params={"barcode": product.barcode}, headers=cashier_headers)
    assert {b["id"]: float(b["clearance_percent"]) for b in res.json()["batches"]}[early] == 30

    # Default tiers: 5 days left -> 30%
    sale = sell_line(client, cashier_headers, **line).json()
    assert float(sale["items"][0]["discount_percent"]) == 30
    assert sale["items"][0]["discount_source"] == "clearance"
    assert float(sale["total_amount"]) == 77

    # Cashier removes it; a higher manual discount wins
    item = sell_line(client, cashier_headers, **line, skip_clearance=True).json()["items"][0]
    assert float(item["discount_amount"]) == 0
    item = sell_line(client, cashier_headers, **line, discount_percent=40).json()["items"][0]
    assert float(item["discount_percent"]) == 40 and item["discount_source"] == "manual"

    # Category rule overrides the default; product rule overrides the category
    tiers = {"tiers": [{"days_left": 10, "percent": 15}]}
    assert client.put(f"{CLEAR}/rules/category/{category.id}", json=tiers, headers=admin_headers).status_code == 200
    item = sell_line(client, cashier_headers, **line).json()["items"][0]
    assert float(item["discount_percent"]) == 15
    url = f"{CLEAR}/rules/product/{product.id}"
    assert client.put(url, json={"tiers": []}, headers=admin_headers).status_code == 200
    item = sell_line(client, cashier_headers, **line).json()["items"][0]
    assert item["discount_source"] is None

    rules = client.get(f"{CLEAR}/rules", headers=admin_headers).json()
    assert rules["enabled"] and len(rules["default"]["tiers"]) == 3
    assert rules["categories"][0]["category_name"] == "Grocery"
    assert client.delete(url, headers=admin_headers).status_code == 204
    assert client.delete(url, headers=admin_headers).status_code == 404

    bad = {"tiers": [{"days_left": 5, "percent": 10}, {"days_left": 5, "percent": 20}]}
    assert client.put(f"{CLEAR}/rules/default", json=bad, headers=admin_headers).status_code == 422
    near = client.get(f"{CLEAR}/near-expiry", params={"days": 7}, headers=admin_headers).json()
    assert [(b["batch_id"], b["days_left"], float(b["clearance_percent"])) for b in near["batches"]] \
        == [(early, 5, 15)]


def test_loose_markdown_applies_until_removed(client, db, seed, product, admin_headers, cashier_headers):
    from app.models import Product
    tomato = Product(tenant_id=seed["tenant_a"].id, product_no="P0002", product_name="Tomato Loose",
                     product_type="loose", is_loose=True, unit_type="kg", mrp=40, selling_price=40,
                     tax_percent=0, stock_quantity=50)
    db.add(tomato)
    db.commit()
    url = f"{CLEAR}/markdown/{tomato.id}"
    assert client.put(url, json={"percent": 25}, headers=cashier_headers).status_code == 403
    assert client.put(f"{CLEAR}/markdown/{product.id}", json={"percent": 25},
                      headers=admin_headers).status_code == 400
    res = client.put(url, json={"percent": 25}, headers=admin_headers)
    assert res.status_code == 200 and float(res.json()["markdown_percent"]) == 25

    sale = sell_line(client, cashier_headers, product_id=tomato.id, quantity=1.5).json()
    assert sale["items"][0]["discount_source"] == "clearance"
    assert float(sale["total_amount"]) == 45

    assert client.put(url, json={"percent": 0}, headers=admin_headers).status_code == 200
    sale = sell_line(client, cashier_headers, product_id=tomato.id, quantity=1.5).json()
    assert float(sale["total_amount"]) == 60


# ---------- Festival offers ----------

OFFERS = "/api/v1/offers"


def offer_body(product, name="Diwali Sale", start=0, end=5, **item):
    return {"name": name, "start_date": expiring_in(start), "end_date": expiring_in(end),
            "items": [{"product_id": product.id, "discount_type": "percent", "discount_value": 10,
                       **item}]}


def test_offer_crud_and_best_offer_applies(client, product, admin_headers, cashier_headers):
    assert client.post(OFFERS, json=offer_body(product), headers=cashier_headers).status_code == 403
    res = client.post(OFFERS, json=offer_body(product), headers=admin_headers)
    assert res.status_code == 201
    diwali = res.json()
    assert diwali["status"] == "running"
    assert float(diwali["items"][0]["offer_price"]) == 49.5 and not diwali["items"][0]["below_cost"]

    res = client.get("/api/v1/products/search", params={"barcode": product.barcode}, headers=cashier_headers)
    assert res.json()["offer_name"] == "Diwali Sale" and res.json()["offer_type"] == "percent"

    # 2 x 55 = 110; 10% off; cashier can't remove it; a higher manual discount wins
    sale = sell_line(client, cashier_headers, product_id=product.id, quantity=2, skip_clearance=True).json()
    item = sale["items"][0]
    assert item["discount_source"] == "offer" and item["offer_name"] == "Diwali Sale"
    assert float(sale["total_amount"]) == 99
    item = sell_line(client, cashier_headers, product_id=product.id, quantity=2,
                     discount_percent=20).json()["items"][0]
    assert item["discount_source"] == "manual" and float(item["discount_amount"]) == 22

    # Rs 20 off per unit saves more than 10%; below the purchase cost of 40 only warns
    flash = client.post(OFFERS, json=offer_body(product, "Flash", discount_type="amount",
                                                discount_value=20), headers=admin_headers).json()
    assert flash["items"][0]["below_cost"]
    sale = sell_line(client, cashier_headers, product_id=product.id, quantity=2).json()
    assert sale["items"][0]["offer_id"] == flash["id"] and float(sale["total_amount"]) == 70
    assert float(sale["items"][0]["discount_percent"]) == 36.36

    # Inactive and upcoming offers don't apply; deleting keeps the name on old bills
    body = {**offer_body(product, "Flash", discount_type="amount", discount_value=20), "is_active": False}
    assert client.put(f"{OFFERS}/{flash['id']}", json=body, headers=admin_headers).json()["status"] == "inactive"
    upcoming = client.post(OFFERS, json=offer_body(product, "Xmas", 3, 9, discount_value=50),
                           headers=admin_headers).json()
    assert upcoming["status"] == "upcoming"
    names = [o["name"] for o in client.get(OFFERS, params={"status": "running"}, headers=admin_headers).json()["items"]]
    assert names == ["Diwali Sale"]
    item = sell_line(client, cashier_headers, product_id=product.id, quantity=2).json()["items"][0]
    assert item["offer_id"] == diwali["id"]
    assert client.delete(f"{OFFERS}/{diwali['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"{OFFERS}/{diwali['id']}", headers=admin_headers).status_code == 404
    old = client.get(f"{SALES}/{sale['id']}", headers=admin_headers).json()
    assert old["items"][0]["offer_name"] == "Flash"
    item = sell_line(client, cashier_headers, product_id=product.id, quantity=2).json()["items"][0]
    assert item["discount_source"] is None


def test_offer_validation(client, product, admin_headers):
    bad = [offer_body(product, start=5, end=1), offer_body(product, discount_value=150),
           {**offer_body(product), "items": offer_body(product)["items"] * 2},
           {**offer_body(product), "name": "  "}, {**offer_body(product), "items": []}]
    for body in bad:
        assert client.post(OFFERS, json=body, headers=admin_headers).status_code == 422
    body = offer_body(product)
    body["items"][0]["product_id"] = 99999
    assert client.post(OFFERS, json=body, headers=admin_headers).status_code == 404


def test_higher_of_offer_and_clearance_wins(client, product, admin_headers, cashier_headers):
    buy_batch(client, product, admin_headers, qty=20, mrp=60, selling_price=55, expiry_date=expiring_in(5))
    assert client.put(f"{CLEAR}/settings", json={"enabled": True}, headers=admin_headers).status_code == 200
    offer = client.post(OFFERS, json=offer_body(product), headers=admin_headers).json()
    item = sell_line(client, cashier_headers, product_id=product.id, quantity=2).json()["items"][0]
    assert item["discount_source"] == "clearance" and float(item["discount_percent"]) == 30
    body = offer_body(product, discount_value=40)
    assert client.put(f"{OFFERS}/{offer['id']}", json=body, headers=admin_headers).status_code == 200
    item = sell_line(client, cashier_headers, product_id=product.id, quantity=2,
                     skip_clearance=True).json()["items"][0]
    assert item["discount_source"] == "offer" and float(item["discount_percent"]) == 40
    item = sell_line(client, cashier_headers, product_id=product.id, quantity=2).json()["items"][0]
    assert item["discount_source"] == "offer"
