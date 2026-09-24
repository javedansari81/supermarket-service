"""Category and supplier endpoint tests"""
CAT = "/api/v1/categories"
SUP = "/api/v1/suppliers"
VALID_GSTIN = "27ABCDE1234F1Z5"


# ---------- Categories ----------

def test_list_categories(client, category, cashier_headers):
    res = client.get(CAT, headers=cashier_headers)
    assert res.status_code == 200
    assert [c["category_name"] for c in res.json()["items"]] == ["Grocery"]


def test_list_categories_isolated_between_tenants(client, category, admin_b_headers):
    assert client.get(CAT, headers=admin_b_headers).json()["total"] == 0


def test_list_active_categories(client, category, cashier_headers):
    res = client.get(f"{CAT}/active", headers=cashier_headers)
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_get_category(client, category, admin_headers, admin_b_headers):
    assert client.get(f"{CAT}/{category.id}", headers=admin_headers).status_code == 200
    assert client.get(f"{CAT}/{category.id}", headers=admin_b_headers).status_code == 404
    assert client.get(f"{CAT}/99999", headers=admin_headers).status_code == 404


def test_create_category(client, admin_headers):
    res = client.post(CAT, json={"category_name": "Dairy"}, headers=admin_headers)
    assert res.status_code == 201
    assert res.json()["status"] == "active"


def test_create_category_duplicate(client, category, admin_headers):
    res = client.post(CAT, json={"category_name": "Grocery"}, headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Category name already exists"


def test_create_category_validation_and_role(client, admin_headers, cashier_headers):
    assert client.post(CAT, json={}, headers=admin_headers).status_code == 422
    assert client.post(CAT, json={"category_name": "X"}, headers=cashier_headers).status_code == 403
    assert client.post(CAT, json={"category_name": "X"}).status_code == 401


def test_update_category(client, category, admin_headers):
    res = client.put(f"{CAT}/{category.id}", json={"description": "Staples"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["description"] == "Staples"


def test_update_category_errors(client, db, seed, category, admin_headers, admin_b_headers):
    from app.models import Category
    db.add(Category(tenant_id=seed["tenant_a"].id, category_name="Dairy"))
    db.commit()
    res = client.put(f"{CAT}/{category.id}", json={"category_name": "Dairy"}, headers=admin_headers)
    assert res.status_code == 400
    assert client.put(f"{CAT}/{category.id}", json={"status": "gone"},
                      headers=admin_headers).status_code == 422
    assert client.put(f"{CAT}/{category.id}", json={"description": "x"},
                      headers=admin_b_headers).status_code == 404


def test_delete_category_soft(client, category, admin_headers, cashier_headers):
    assert client.delete(f"{CAT}/{category.id}", headers=cashier_headers).status_code == 403
    assert client.delete(f"{CAT}/{category.id}", headers=admin_headers).status_code == 204
    assert client.get(f"{CAT}/{category.id}", headers=admin_headers).json()["status"] == "inactive"
    assert client.get(f"{CAT}/active", headers=admin_headers).json() == []
    assert client.delete(f"{CAT}/99999", headers=admin_headers).status_code == 404


# ---------- Suppliers ----------

def test_create_supplier_auto_code(client, admin_headers):
    res = client.post(SUP, json={"supplier_name": "Fresh Farms"}, headers=admin_headers)
    assert res.status_code == 201
    assert res.json()["supplier_code"] == "SUP0001"


def test_create_supplier_duplicate_code(client, supplier, admin_headers):
    res = client.post(SUP, json={"supplier_code": "sup001", "supplier_name": "Dup"},
                      headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Supplier code already exists"


def test_create_supplier_gstin_rules(client, admin_headers):
    bad = client.post(SUP, json={"supplier_name": "A", "gst_no": "INVALID"}, headers=admin_headers)
    assert bad.status_code == 422
    ok = client.post(SUP, json={"supplier_name": "A", "gst_no": VALID_GSTIN.lower()},
                     headers=admin_headers)
    assert ok.status_code == 201
    assert ok.json()["gst_no"] == VALID_GSTIN
    dup = client.post(SUP, json={"supplier_name": "B", "gst_no": VALID_GSTIN}, headers=admin_headers)
    assert dup.status_code == 400


def test_create_supplier_validation_and_role(client, admin_headers, cashier_headers):
    assert client.post(SUP, json={"supplier_name": ""}, headers=admin_headers).status_code == 422
    assert client.post(SUP, json={"supplier_name": "A", "status": "x"},
                       headers=admin_headers).status_code == 422
    assert client.post(SUP, json={"supplier_name": "A"}, headers=cashier_headers).status_code == 403


def test_list_and_get_suppliers(client, supplier, cashier_headers, admin_b_headers):
    res = client.get(SUP, params={"search": "acme"}, headers=cashier_headers)
    assert res.status_code == 200 and res.json()["total"] == 1
    assert len(client.get(f"{SUP}/active", headers=cashier_headers).json()) == 1
    assert client.get(f"{SUP}/{supplier.id}", headers=cashier_headers).status_code == 200
    assert client.get(f"{SUP}/{supplier.id}", headers=admin_b_headers).status_code == 404


def test_update_supplier(client, supplier, admin_headers, admin_b_headers):
    res = client.put(f"{SUP}/{supplier.id}", json={"contact_person": "Ravi"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["contact_person"] == "Ravi"
    assert client.put(f"{SUP}/{supplier.id}", json={"contact_person": "x"},
                      headers=admin_b_headers).status_code == 404
    assert client.put(f"{SUP}/{supplier.id}", json={"gst_no": "BAD"},
                      headers=admin_headers).status_code == 422


def test_delete_supplier(client, supplier, admin_headers, cashier_headers):
    assert client.delete(f"{SUP}/{supplier.id}", headers=cashier_headers).status_code == 403
    assert client.delete(f"{SUP}/{supplier.id}", headers=admin_headers).status_code == 204
    assert client.get(f"{SUP}/active", headers=admin_headers).json() == []
    assert client.delete(f"{SUP}/99999", headers=admin_headers).status_code == 404
