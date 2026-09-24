"""Product endpoint tests"""
URL = "/api/v1/products"


def payload(**overrides):
    data = {"product_name": "Sugar 1kg", "mrp": 50, "selling_price": 45,
            "tax_percent": 5, "unit_type": "pcs", "stock_quantity": 20}
    data.update(overrides)
    return data


def test_list_products(client, product, cashier_headers):
    res = client.get(URL, headers=cashier_headers)
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["category"]["category_name"] == "Grocery"


def test_list_products_filters(client, product, admin_headers):
    assert client.get(URL, params={"search": "rice"}, headers=admin_headers).json()["total"] == 1
    assert client.get(URL, params={"search": "zzz"}, headers=admin_headers).json()["total"] == 0
    assert client.get(URL, params={"low_stock": True}, headers=admin_headers).json()["total"] == 0


def test_list_products_isolated(client, product, admin_b_headers):
    assert client.get(URL, headers=admin_b_headers).json()["total"] == 0


def test_search_by_barcode_and_product_no(client, product, cashier_headers):
    res = client.get(f"{URL}/search", params={"barcode": "8901234567890"}, headers=cashier_headers)
    assert res.status_code == 200
    assert res.json()["product_name"] == "Rice 1kg"
    res = client.get(f"{URL}/search", params={"product_no": "P0001"}, headers=cashier_headers)
    assert res.status_code == 200


def test_search_errors(client, product, cashier_headers, admin_b_headers):
    assert client.get(f"{URL}/search", headers=cashier_headers).status_code == 400
    assert client.get(f"{URL}/search", params={"barcode": "000"},
                      headers=cashier_headers).status_code == 404
    assert client.get(f"{URL}/search", params={"barcode": "8901234567890"},
                      headers=admin_b_headers).status_code == 404


def test_get_product(client, product, admin_headers, admin_b_headers):
    assert client.get(f"{URL}/{product.id}", headers=admin_headers).status_code == 200
    assert client.get(f"{URL}/{product.id}", headers=admin_b_headers).status_code == 404


def test_create_product_generates_codes(client, category, admin_headers):
    res = client.post(URL, json=payload(category_id=category.id), headers=admin_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["product_no"]
    assert body["barcode"]


def test_create_product_duplicates(client, product, admin_headers):
    res = client.post(URL, json=payload(product_no="P0001"), headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Product number already exists"
    res = client.post(URL, json=payload(barcode="8901234567890"), headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Barcode already exists"


def test_create_product_price_rules(client, admin_headers):
    assert client.post(URL, json=payload(selling_price=60), headers=admin_headers).status_code == 422
    assert client.post(URL, json=payload(mrp=-1), headers=admin_headers).status_code == 422
    assert client.post(URL, json=payload(tax_percent=150), headers=admin_headers).status_code == 422
    assert client.post(URL, json=payload(stock_quantity=-5), headers=admin_headers).status_code == 422
    assert client.post(URL, json=payload(product_name=""), headers=admin_headers).status_code == 422


def test_create_loose_product_requires_weight_unit(client, admin_headers):
    res = client.post(URL, json=payload(is_loose=True, unit_type="pcs"), headers=admin_headers)
    assert res.status_code == 400
    res = client.post(URL, json=payload(is_loose=True, unit_type="kg"), headers=admin_headers)
    assert res.status_code == 201


def test_create_product_category_from_other_tenant(client, category, admin_b_headers):
    res = client.post(URL, json=payload(category_id=category.id), headers=admin_b_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid category"


def test_create_product_forbidden_for_cashier(client, seed, cashier_headers):
    assert client.post(URL, json=payload(), headers=cashier_headers).status_code == 403


def test_update_product(client, product, admin_headers):
    res = client.put(f"{URL}/{product.id}", json={"selling_price": 50}, headers=admin_headers)
    assert res.status_code == 200
    assert float(res.json()["selling_price"]) == 50


def test_update_product_errors(client, db, seed, product, admin_headers, admin_b_headers):
    from app.models import Category
    other_cat = Category(tenant_id=seed["tenant_b"].id, category_name="B-cat")
    db.add(other_cat)
    db.commit()
    put = lambda body, h=admin_headers: client.put(f"{URL}/{product.id}", json=body, headers=h)
    assert put({"selling_price": 70}).status_code == 400
    assert put({"is_loose": True}).status_code == 400
    assert put({"category_id": other_cat.id}).status_code == 400
    assert put({"tax_percent": -1}).status_code == 422
    assert put({"selling_price": 50}, admin_b_headers).status_code == 404


def test_update_product_duplicate_barcode(client, db, seed, product, admin_headers):
    res = client.post(URL, json=payload(barcode="1111111111111"), headers=admin_headers)
    other_id = res.json()["id"]
    res = client.put(f"{URL}/{other_id}", json={"barcode": "8901234567890"}, headers=admin_headers)
    assert res.status_code == 400


def test_delete_product_soft(client, product, admin_headers, cashier_headers):
    assert client.delete(f"{URL}/{product.id}", headers=cashier_headers).status_code == 403
    assert client.delete(f"{URL}/{product.id}", headers=admin_headers).status_code == 204
    assert client.get(f"{URL}/{product.id}", headers=admin_headers).json()["status"] == "inactive"
    assert client.get(f"{URL}/search", params={"product_no": "P0001"},
                      headers=admin_headers).status_code == 404
    assert client.delete(f"{URL}/99999", headers=admin_headers).status_code == 404
