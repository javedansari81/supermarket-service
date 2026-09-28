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
    assert client.get(URL, params={"is_loose": True}, headers=admin_headers).json()["total"] == 0
    assert client.get(URL, params={"is_loose": False}, headers=admin_headers).json()["total"] == 1
    by_type = lambda t: client.get(URL, params={"product_type": t}, headers=admin_headers)
    assert by_type("own_packed").json()["total"] == 1
    assert by_type("loose").json()["total"] == 0
    assert by_type("other").status_code == 422


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


def test_create_loose_product_gets_plu_and_scale_barcode(client, admin_headers):
    from app.core.batches import scale_barcode
    body = payload(product_type="loose", product_name="Toor Dal (loose)", brand="Tata",
                   unit_type="kg", barcode="8900000000001", mrp=None, selling_price=140)
    first = client.post(URL, json=body, headers=admin_headers).json()
    assert (first["product_type"], first["is_loose"], first["plu_code"]) == ("loose", True, 1)
    assert first["product_name"] == "Toor Dal Loose" and first["brand"] is None
    assert first["barcode"] == scale_barcode(1) and first["barcode"].startswith("2100001")
    second = client.post(URL, json={**body, "product_name": "Sugar"}, headers=admin_headers).json()
    assert (second["product_name"], second["plu_code"]) == ("Sugar Loose", 2)


def test_product_type_rules(client, admin_headers):
    post = lambda **kw: client.post(URL, json=payload(**kw), headers=admin_headers)
    assert post(product_type="manufacturer").status_code == 400
    assert post(product_type="own_packed", barcode="2100001012508").status_code == 400
    res = post(product_type="manufacturer", barcode="8901111111111", brand="Tata")
    assert res.status_code == 201 and res.json()["plu_code"] is None
    assert (res.json()["product_name"], res.json()["brand"]) == ("Sugar 1kg", "Tata")
    own = post().json()
    assert own["product_type"] == "own_packed" and own["barcode"].startswith("20")
    # Switching an own-packed item to manufacturer needs the maker's barcode
    put = lambda body: client.put(f"{URL}/{own['id']}", json=body, headers=admin_headers)
    assert put({"product_type": "manufacturer"}).status_code == 400
    res = put({"product_type": "manufacturer", "barcode": "8902222222222"})
    assert res.status_code == 200
    assert (res.json()["product_name"], res.json()["brand"]) == ("Sugar 1kg", None)


def test_own_packed_naming(client, admin_headers):
    post = lambda **kw: client.post(URL, json=payload(product_type="own_packed", **kw),
                                    headers=admin_headers).json()
    own = post(product_name="Toor Dal 1 kg", brand="Tata")
    assert (own["product_name"], own["brand"]) == ("Toor Dal 1 kg MF", "MF")
    assert post(product_name="MF Moong Dal 500 g (MF)")["product_name"] == "Moong Dal 500 g MF"
    # Switching to loose swaps the suffix and clears the brand
    res = client.put(f"{URL}/{own['id']}", json={"product_type": "loose", "unit_type": "kg"},
                     headers=admin_headers).json()
    assert (res["product_name"], res["brand"]) == ("Toor Dal 1 kg Loose", None)
    res = client.put(f"{URL}/{own['id']}", json={"product_type": "own_packed", "unit_type": "pcs"},
                     headers=admin_headers).json()
    assert (res["product_name"], res["brand"]) == ("Toor Dal 1 kg MF", "MF")


def test_switch_product_to_loose_and_back(client, product, admin_headers):
    put = lambda body: client.put(f"{URL}/{product.id}", json=body, headers=admin_headers)
    res = put({"product_type": "loose", "unit_type": "kg", "product_name": "Rice"})
    assert res.status_code == 200
    body = res.json()
    assert (body["is_loose"], body["plu_code"], body["product_name"]) == (True, 1, "Rice Loose")
    assert body["barcode"].startswith("2100001")
    res = put({"is_loose": False, "unit_type": "pcs"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["product_type"], body["plu_code"]) == ("own_packed", None)
    assert (body["product_name"], body["brand"]) == ("Rice MF", "MF")
    assert body["barcode"].startswith("20")


def test_scan_scale_label(client, admin_headers, cashier_headers):
    from app.core.batches import scale_barcode
    loose = client.post(URL, json=payload(product_type="loose", product_name="Onion", unit_type="kg",
                                          mrp=None, selling_price=40), headers=admin_headers).json()
    search = lambda code: client.get(f"{URL}/search", params={"barcode": code}, headers=cashier_headers)
    res = search(scale_barcode(loose["plu_code"], 1250))
    assert res.status_code == 200
    assert res.json()["id"] == loose["id"] and float(res.json()["scanned_quantity"]) == 1.25
    # Reference barcode (weight 0): cashier enters the weight
    assert search(loose["barcode"]).json()["scanned_quantity"] is None
    code = scale_barcode(loose["plu_code"], 1250)
    assert search(code[:12] + str((int(code[12]) + 1) % 10)).status_code == 400
    assert search(scale_barcode(999, 500)).status_code == 404


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


# ---------- Store locations ----------

LOC = "/api/v1/locations"


def test_location_crud(client, seed, admin_headers, cashier_headers, admin_b_headers):
    body = {"location_type": "display", "floor": "Ground", "rack_no": " d03 ", "shelf_no": "2"}
    assert client.post(LOC, json=body, headers=cashier_headers).status_code == 403
    res = client.post(LOC, json=body, headers=admin_headers)
    assert res.status_code == 201
    loc = res.json()
    assert (loc["location_code"], loc["rack_no"], loc["shelf_no"]) == ("D03-2", "D03", "2")
    assert client.post(LOC, json=body, headers=admin_headers).status_code == 400
    assert client.post(LOC, json={**body, "location_type": "roof"}, headers=admin_headers).status_code == 422

    assert client.get(LOC, headers=cashier_headers).json()["total"] == 1
    assert client.get(LOC, headers=admin_b_headers).json()["total"] == 0
    assert client.get(f"{LOC}/{loc['id']}", headers=admin_b_headers).status_code == 404

    res = client.put(f"{LOC}/{loc['id']}", json={"shelf_no": "3", "description": "Top"},
                     headers=admin_headers)
    assert res.status_code == 200
    assert (res.json()["location_code"], res.json()["description"]) == ("D03-3", "Top")

    assert client.delete(f"{LOC}/{loc['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"{LOC}/{loc['id']}", headers=admin_headers).json()["status"] == "inactive"
    assert client.get(f"{LOC}/active", headers=admin_headers).json() == []


def test_location_rack_rules(client, locations, admin_headers):
    post = lambda body: client.post(LOC, json=body, headers=admin_headers)
    # Rack prefix must match the type
    assert post({"location_type": "storage", "rack_no": "D05", "shelf_no": "1"}).status_code == 400
    assert post({"location_type": "display", "rack_no": "D0-5"}).status_code == 400
    # A rack stays on one floor
    res = post({"location_type": "display", "floor": "1st", "rack_no": "D01", "shelf_no": "5"})
    assert res.status_code == 400
    assert res.json()["detail"] == "Rack D01 is on floor Ground"
    assert post({"location_type": "display", "floor": "Ground", "rack_no": "D01",
                 "shelf_no": "5"}).status_code == 201
    # Moving a rack moves all its shelves
    shelf = locations["shelf"]
    res = client.put(f"{LOC}/{shelf.id}", json={"floor": "1st"}, headers=admin_headers)
    assert res.status_code == 200
    floors = {l["location_code"]: l["floor"] for l in client.get(LOC, headers=admin_headers).json()["items"]}
    assert floors["D01-4"] == floors["D01-5"] == "1st"


def test_location_suggest(client, locations, admin_headers):
    sug = lambda **p: client.get(f"{LOC}/suggest", params=p, headers=admin_headers).json()
    res = sug(location_type="display")
    assert (res["rack_no"], res["shelf_no"], res["existing_racks"]) == ("D02", "1", ["D01"])
    res = sug(location_type="display", rack_no="d01")
    assert (res["rack_no"], res["shelf_no"], res["floor"]) == ("D01", "5", "Ground")
    assert sug(location_type="promo")["rack_no"] == "P01"
    assert client.get(f"{LOC}/suggest", params={"location_type": "roof"},
                      headers=admin_headers).status_code == 422


def test_location_type_change_updates_roles(client, product, locations, admin_headers):
    shelf, backroom = locations["shelf"], locations["backroom"]
    client.put(f"{URL}/{product.id}", json={"locations": [{"location_id": shelf.id},
                                                          {"location_id": backroom.id}]},
               headers=admin_headers)
    res = client.put(f"{LOC}/{shelf.id}", json={"location_type": "storage", "rack_no": "S02"},
                     headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["location_code"] == "S02-4"
    locs = client.get(f"{URL}/{product.id}", headers=admin_headers).json()["locations"]
    assert {l["role"] for l in locs} == {"storage"}
    assert sum(l["is_primary"] for l in locs) == 1


def test_product_with_display_and_storage_locations(client, category, locations, admin_headers):
    shelf, backroom = locations["shelf"], locations["backroom"]
    body = payload(category_id=category.id, locations=[
        {"location_id": shelf.id},
        {"location_id": backroom.id},
    ])
    res = client.post(URL, json=body, headers=admin_headers)
    assert res.status_code == 201
    locs = {l["role"]: l for l in res.json()["locations"]}
    assert locs["display"]["location_code"] == "D01-4"
    assert locs["display"]["floor"] == "Ground"
    assert locs["display"]["is_primary"] is True
    assert locs["storage"]["location_code"] == "S01-1"
    assert locs["storage"]["is_primary"] is True
    product_id = res.json()["id"]

    res = client.get(URL, params={"location_id": backroom.id}, headers=admin_headers)
    assert res.json()["total"] == 1
    res = client.get(f"{LOC}/{shelf.id}/products", headers=admin_headers)
    assert [p["product_id"] for p in res.json()] == [product_id]

    res = client.put(f"{URL}/{product_id}", json={"locations": [{"location_id": backroom.id}]},
                     headers=admin_headers)
    assert res.status_code == 200
    assert [l["location_id"] for l in res.json()["locations"]] == [backroom.id]
    assert client.get(URL, params={"location_id": shelf.id}, headers=admin_headers).json()["total"] == 0


def test_product_location_validation(client, db, product, locations, admin_headers, admin_b_headers):
    shelf = locations["shelf"]
    put = lambda body, h=admin_headers: client.put(f"{URL}/{product.id}", json=body, headers=h)
    dup = [{"location_id": shelf.id}, {"location_id": shelf.id}]
    assert put({"locations": dup}).status_code == 400
    other_display = client.post(LOC, json={"location_type": "display", "rack_no": "D02"},
                                headers=admin_headers).json()
    two_primary = [{"location_id": shelf.id, "is_primary": True},
                   {"location_id": other_display["id"], "is_primary": True}]
    assert put({"locations": two_primary}).status_code == 400
    one_each = [{"location_id": shelf.id, "is_primary": True},
                {"location_id": locations["backroom"].id, "is_primary": True}]
    assert put({"locations": one_each}).status_code == 200
    assert put({"locations": []}).status_code == 200
    assert put({"locations": [{"location_id": 99999}]}).status_code == 400
    shelf.status = "inactive"
    db.commit()
    assert put({"locations": [{"location_id": shelf.id}]}).status_code == 400
    res = client.post(URL, json=payload(locations=[{"location_id": locations["backroom"].id}]),
                      headers=admin_b_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid location"


def test_list_unassigned_products(client, product, locations, admin_headers):
    assert client.get(URL, params={"unassigned": True}, headers=admin_headers).json()["total"] == 1
    client.put(f"{URL}/{product.id}", json={"locations": [{"location_id": locations["shelf"].id}]},
               headers=admin_headers)
    assert client.get(URL, params={"unassigned": True}, headers=admin_headers).json()["total"] == 0
    res = client.get(f"{URL}/search", params={"barcode": "8901234567890"}, headers=admin_headers)
    assert res.json()["locations"][0]["location_code"] == "D01-4"
