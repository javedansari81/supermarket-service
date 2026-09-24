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
