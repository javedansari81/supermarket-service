"""Product endpoint tests"""
import pytest

from tests.conftest import enable_online

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
    res = client.post(URL, json=payload(is_loose=True, unit_type="ltr"), headers=admin_headers)
    assert res.status_code == 400
    res = client.post(URL, json=payload(is_loose=True, unit_type="kg"), headers=admin_headers)
    assert res.status_code == 201
    res = client.post(URL, json=payload(is_loose=True, product_name="Oil", unit_type="L"),
                      headers=admin_headers)
    assert res.status_code == 201


def test_packed_product_is_sold_per_piece(client, admin_headers):
    res = client.post(URL, json=payload(unit_type="box"), headers=admin_headers)
    assert res.status_code == 201 and res.json()["unit_type"] == "pcs"
    res = client.put(f"{URL}/{res.json()['id']}", json={"unit_type": "dozen"}, headers=admin_headers)
    assert res.status_code == 200 and res.json()["unit_type"] == "pcs"


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
    assert (res.json()["product_name"], res.json()["brand"]) == ("Sugar 1kg Tata", "Tata")
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


def test_display_name_from_item_name(client, admin_headers):
    post = lambda **kw: client.post(URL, json=payload(product_name=None, **kw),
                                    headers=admin_headers).json()
    made = post(product_type="manufacturer", item_name="Salt", brand="Tata",
                barcode="8903333333333", net_quantity=1, net_unit="kg")
    assert (made["item_name"], made["product_name"]) == ("Salt", "Salt 1 kg Tata")
    assert made["name_is_custom"] is False
    own = post(item_name="Toor Dal", net_quantity=500, net_unit="g")
    assert own["product_name"] == "Toor Dal 500 g MF"
    assert post(item_name="Oil", net_quantity=1.5, net_unit="L")["product_name"] == "Oil 1.5 L MF"
    assert post(item_name="Notebook", net_quantity=200, net_unit="pages")["product_name"] == "Notebook 200 pages MF"
    typed = post(item_name="toor dal ORS iPhone", net_quantity=1, net_unit="kg")
    assert (typed["item_name"], typed["product_name"]) == ("Toor Dal ORS iPhone", "Toor Dal ORS iPhone 1 kg MF")
    branded = post(product_type="manufacturer", item_name="ghee", brand="amul ITC",
                   barcode="8904444444444", net_quantity=1, net_unit="L")
    assert (branded["brand"], branded["product_name"]) == ("Amul ITC", "Ghee 1 L Amul ITC")
    assert post(item_name="Bucket", net_quantity=1, net_unit="pcs")["product_name"] == "Bucket MF"
    assert post(item_name="Eggs", net_quantity=6, net_unit="pcs")["product_name"] == "Eggs 6 pcs MF"
    put = lambda body: client.put(f"{URL}/{made['id']}", json=body, headers=admin_headers).json()
    # Size or brand changes regenerate the name
    assert put({"net_quantity": 2})["product_name"] == "Salt 2 kg Tata"
    # A name set by hand is kept until item_name is sent without it
    res = put({"item_name": "Salt", "product_name": "Tata Salt Iodised 2 kg"})
    assert (res["product_name"], res["name_is_custom"]) == ("Tata Salt Iodised 2 kg", True)
    assert put({"brand": "Tata Salt"})["product_name"] == "Tata Salt Iodised 2 kg"
    res = put({"item_name": "Salt"})
    assert (res["product_name"], res["name_is_custom"]) == ("Salt 2 kg Tata Salt", False)


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


def test_product_gst_item(client, db, seed, category, admin_headers):
    from app.models import GstItem, CategoryGstItem
    rice = GstItem(item_name="Rice", hsn_code="1006", gst_percent_loose=0, gst_percent_packed=5)
    soap = GstItem(item_name="Toilet soap", hsn_code="3401", gst_percent_loose=5, gst_percent_packed=5)
    db.add_all([rice, soap])
    db.flush()
    db.add(CategoryGstItem(tenant_id=seed["tenant_a"].id, category_id=category.id, gst_item_id=rice.id))
    db.commit()

    # HSN and GST % come from the item; loose uses the loose rate
    body = payload(category_id=category.id, gst_item_id=rice.id)
    body.pop("tax_percent")
    res = client.post(URL, json=body, headers=admin_headers).json()
    assert (res["gst_item_id"], res["hsn_code"], float(res["tax_percent"]), res["gst_overridden"]) \
        == (rice.id, "1006", 5, False)
    loose = client.post(URL, json=payload(product_name="Rice", product_type="loose", unit_type="kg",
                                          category_id=category.id, gst_item_id=rice.id, tax_percent=0),
                        headers=admin_headers).json()
    assert float(loose["tax_percent"]) == 0 and loose["gst_overridden"] is False

    # Item must be listed under the category
    res = client.post(URL, json=payload(category_id=category.id, gst_item_id=soap.id), headers=admin_headers)
    assert res.status_code == 400 and res.json()["detail"] == "GST item is not listed under this category"
    assert client.post(URL, json=payload(gst_item_id=99999), headers=admin_headers).status_code == 400

    # Changing HSN or GST % by hand marks the product overridden
    pid = loose["id"]
    upd = client.put(f"{URL}/{pid}", json={"tax_percent": 12}, headers=admin_headers).json()
    assert upd["gst_overridden"] is True
    upd = client.put(f"{URL}/{pid}", json={"tax_percent": 0, "hsn_code": "10063010"},
                     headers=admin_headers).json()
    assert upd["gst_overridden"] is False
    res = client.put(f"{URL}/{pid}", json={"gst_item_id": None}, headers=admin_headers)
    assert res.status_code == 400 and res.json()["detail"] == "GST item cannot be removed"


def test_create_product_forbidden_for_cashier(client, seed, cashier_headers):
    assert client.post(URL, json=payload(), headers=cashier_headers).status_code == 403


def test_update_product(client, product, admin_headers):
    res = client.put(f"{URL}/{product.id}", json={"selling_price": 50}, headers=admin_headers)
    assert res.status_code == 200
    assert float(res.json()["selling_price"]) == 50


def test_supervisor_can_edit_but_not_create_or_delete_product(client, product, supervisor_headers):
    res = client.put(f"{URL}/{product.id}", json={"barcode": "8901234567899"}, headers=supervisor_headers)
    assert res.status_code == 200 and res.json()["barcode"] == "8901234567899"
    assert client.post(URL, json=payload(), headers=supervisor_headers).status_code == 403
    assert client.delete(f"{URL}/{product.id}", headers=supervisor_headers).status_code == 403


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


def test_location_crud_by_supervisor(client, seed, supervisor_headers):
    body = {"location_type": "storage", "floor": "1st", "rack_no": "S05", "shelf_no": "1"}
    res = client.post(LOC, json=body, headers=supervisor_headers)
    assert res.status_code == 201
    loc_id = res.json()["id"]
    res = client.put(f"{LOC}/{loc_id}", json={"shelf_no": "2"}, headers=supervisor_headers)
    assert res.status_code == 200 and res.json()["location_code"] == "S05-2"
    assert client.delete(f"{LOC}/{loc_id}", headers=supervisor_headers).status_code == 204


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


IMPORT_HEADERS = ["Item Name*", "Product Type*", "Brand", "Pack Size", "Pack Unit", "MRP",
                  "Selling Price"]


def xlsx_file(rows, headers=IMPORT_HEADERS):
    import io
    from openpyxl import Workbook
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return {"file": ("products.xlsx", buffer.getvalue(),
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}


def import_file(client, headers, files, dry_run=False):
    return client.post(f"{URL}/import", files=files, params={"dry_run": dry_run}, headers=headers)


def test_import_template(client, admin_headers, cashier_headers):
    res = client.get(f"{URL}/import/template", headers=admin_headers)
    assert res.status_code == 200 and res.content.startswith(b"PK")
    assert client.get(f"{URL}/import/template", headers=cashier_headers).status_code == 403


def test_import_products_excel(client, admin_headers):
    rows = [
        ["Salt", "Manufacturer", "Tata", 1, "kg", 28, 27],
        ["Toor Dal", "Own packed", None, 500, "g", 90, 85],
        ["Sugar", "Loose", None, None, None, None, 45],
        ["Jaggery", "loose", None, None, None, None, 60],
    ]
    res = import_file(client, admin_headers, xlsx_file(rows))
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["total"], body["created"], body["skipped"], body["failed"]) == (4, 4, 0, 0)

    items = {p["product_name"]: p for p in client.get(
        URL, params={"page_size": 50}, headers=admin_headers).json()["items"]}
    # Manufacturer item is imported without a barcode and gets no in-store one
    salt = items["Salt 1 kg Tata"]
    assert salt["barcode"] is None and float(salt["reorder_level"]) == 10
    assert items["Toor Dal 500 g MF"]["barcode"].startswith("20")
    assert (items["Sugar Loose"]["plu_code"], items["Jaggery Loose"]["plu_code"]) == (1, 2)
    assert items["Jaggery Loose"]["unit_type"] == "kg"

    missing = client.get(URL, params={"missing_barcode": True}, headers=admin_headers).json()
    assert [p["product_name"] for p in missing["items"]] == ["Salt 1 kg Tata"]


def test_import_skips_existing_and_reports_failures(client, admin_headers):
    rows = [
        ["Oil", "Manufacturer", "Fortune", 1, "L", 150, 140],
        ["Oil", "Manufacturer", "Fortune", 1, "L", 150, 140],
        ["Bad", "Other", None, None, "box", None, "abc"],
        ["Pricey", "Own packed", None, 1, "kg", 50, 60],
        ["Rice", "Manufacturer", None, 5, "kg", 400, 380],
    ]
    body = import_file(client, admin_headers, xlsx_file(rows)).json()
    assert (body["created"], body["skipped"], body["failed"]) == (2, 1, 2)
    issues = {i["row"]: i for i in body["issues"]}
    assert issues[3]["reason"] == "Duplicate of row 2 (same name and type)"
    bad = issues[4]["reason"]
    assert issues[4]["status"] == "failed"
    for text in ("Product Type 'Other'", "Selling Price must be a number", "Pack Unit 'box'"):
        assert text in bad
    assert "MRP" in issues[5]["reason"]
    assert body["issues"][0]["values"][0] == "Oil"

    # Importing the same file again skips everything that was created
    again = import_file(client, admin_headers, xlsx_file(rows)).json()
    assert (again["created"], again["skipped"], again["failed"]) == (0, 3, 2)
    assert "Product already exists (" in again["issues"][0]["reason"]


def test_import_dry_run_saves_nothing(client, admin_headers):
    rows = [["Salt", "Own packed", None, 1, "kg", 28, 27]]
    body = import_file(client, admin_headers, xlsx_file(rows), dry_run=True).json()
    assert (body["dry_run"], body["created"]) == (True, 1)
    assert client.get(URL, headers=admin_headers).json()["total"] == 0


def test_import_expiry_for_every_type_and_expiry_filter(client, admin_headers):
    from datetime import date, datetime, timedelta
    soon = date.today() + timedelta(days=5)
    headers = ["Item Name", "Product Type", "Brand", "Pack Size", "Pack Unit", "Selling Price",
               "Expiry Date"]
    rows = [
        ["Salt", "Manufacturer", "Tata", 1, "kg", 27, datetime(soon.year, soon.month, soon.day)],
        ["Guava", "Own packed", None, 1, "kg", 80, "30/03/2027"],
        ["Sugar", "Loose", None, None, None, 45, "2020-01-01"],
        ["Rice", "Loose", None, None, None, 60, "31/02/2027"],
    ]
    body = import_file(client, admin_headers, xlsx_file(rows, headers)).json()
    assert (body["created"], body["failed"]) == (3, 1)
    items = {p["item_name"]: p["expiry_date"]
             for p in client.get(URL, headers=admin_headers).json()["items"]}
    assert items == {"Salt": soon.isoformat(), "Guava": "2027-03-30", "Sugar": "2020-01-01"}

    names = lambda expiry: [p["item_name"] for p in client.get(
        URL, params={"expiry": expiry}, headers=admin_headers).json()["items"]]
    assert names("expired") == ["Sugar"]
    assert names("7") == ["Salt"]
    assert names("30") == ["Salt"]
    assert client.get(URL, params={"expiry": "bad"}, headers=admin_headers).status_code == 422


def test_import_csv_and_file_errors(client, admin_headers, admin_b_headers, cashier_headers):
    # Columns that are not in the template (e.g. Barcode) are ignored
    csv = "Item Name,Product Type,Barcode,Selling Price\r\nSalt,Manufacturer,8901058000016,27\r\n"
    files = {"file": ("p.csv", csv.encode(), "text/csv")}
    body = import_file(client, admin_headers, files).json()
    assert (body["created"], body["failed"]) == (1, 0)
    assert client.get(URL, headers=admin_headers).json()["items"][0]["barcode"] is None
    # Each store has its own products: the same product is new for tenant B
    assert import_file(client, admin_b_headers, files).json()["created"] == 1
    assert import_file(client, cashier_headers, files).status_code == 403

    bad = lambda name, content: import_file(client, admin_headers, {"file": (name, content, "x")})
    assert bad("p.txt", b"x").status_code == 400
    assert bad("p.xls", b"x").status_code == 400
    assert bad("p.xlsx", b"not excel").status_code == 400
    assert bad("p.csv", b"Item Name\r\nSalt\r\n").json()["detail"].startswith("Missing column(s): Product Type")
    assert bad("p.csv", b"Item Name,Product Type\r\n").status_code == 400


def test_edit_manufacturer_without_barcode(client, admin_headers):
    rows = [["Atta", "Manufacturer", "Aashirvaad", 5, "kg", 300, 290]]
    import_file(client, admin_headers, xlsx_file(rows))
    atta = client.get(URL, headers=admin_headers).json()["items"][0]
    put = lambda body: client.put(f"{URL}/{atta['id']}", json=body, headers=admin_headers)
    res = put({"selling_price": 280})
    assert res.status_code == 200 and res.json()["barcode"] is None
    res = put({"barcode": "8901725000011"})
    assert res.status_code == 200 and res.json()["barcode"] == "8901725000011"
    # Once set, an empty barcode keeps the current one
    assert put({"barcode": ""}).json()["barcode"] == "8901725000011"


# ---------- Online shop catalogue (public) ----------

SHOP = "/api/v1/shop/stores"


@pytest.fixture()
def online(db, seed, product):
    """Tenant A (storea) sells online; tenant B (storeb) does not"""
    seed["tenant_a"].subdomain = "storea"
    seed["tenant_b"].subdomain = "storeb"
    enable_online(db, seed["tenant_a"])
    return seed


def add_product(db, tenant, no, name, **fields):
    from app.models import Product
    data = {"mrp": 50, "selling_price": 45, "tax_percent": 5, "unit_type": "pcs", "stock_quantity": 10}
    data.update(fields)
    prod = Product(tenant_id=tenant.id, product_no=no, product_name=name, **data)
    db.add(prod)
    db.commit()
    return prod


def test_shop_stores_and_store_details(client, db, online):
    res = client.get(SHOP)
    assert res.status_code == 200 and "max-age" in res.headers["Cache-Control"]
    assert res.json()["items"] == [{"store": "storea", "store_name": "Tenant A", "store_address": ""}]
    assert client.get(f"{SHOP}/storea").json()["store_name"] == "Tenant A"
    assert client.get(f"{SHOP}/storeb").status_code == 404
    assert client.get(f"{SHOP}/nostore/products").status_code == 404

    online["tenant_a"].status = "inactive"
    db.commit()
    assert client.get(SHOP).json()["items"] == []
    assert client.get(f"{SHOP}/storea").status_code == 404


def test_shop_catalogue_shows_only_sellable_products_without_costs(client, db, online, product):
    add_product(db, online["tenant_a"], "P0002", "Old Soap", status="inactive")
    add_product(db, online["tenant_a"], "P0003", "Free Sample", mrp=None, selling_price=None)
    other = add_product(db, online["tenant_b"], "P0001", "Other Store Rice")

    cats = client.get(f"{SHOP}/storea/categories").json()["items"]
    assert cats == [{"id": product.category_id, "category_name": "Grocery", "product_count": 1}]

    body = client.get(f"{SHOP}/storea/products").json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["product_name"] == "Rice 1kg" and item["category_name"] == "Grocery"
    assert float(item["price"]) == 55 and float(item["offer_price"]) == 55 and item["in_stock"] is True
    assert not {"purchase_price", "stock_quantity", "barcode"} & set(item)

    assert client.get(f"{SHOP}/storea/products/{product.id}").json()["id"] == product.id
    assert client.get(f"{SHOP}/storea/products/{other.id}").status_code == 404


def test_shop_prices_follow_batches_clearance_and_offers(client, db, online, product):
    from datetime import timedelta
    from app.core.clearance import today_ist
    from app.models import Offer, OfferItem, ProductBatch, TenantSetting
    today = today_ist()
    tenant_id = online["tenant_a"].id

    def batch(mrp, price, days, qty):
        db.add(ProductBatch(tenant_id=tenant_id, product_id=product.id, mrp=mrp, selling_price=price,
                            expiry_date=today + timedelta(days=days), quantity_received=qty,
                            quantity_left=qty))

    batch(60, 30, -1, 4)   # expired: never priced or sold online
    batch(60, 52, 3, 5)    # sold first
    batch(62, 58, 90, 10)
    db.commit()
    detail = lambda: client.get(f"{SHOP}/storea/products/{product.id}").json()
    item = detail()
    assert (float(item["mrp"]), float(item["price"]), item["discount_source"]) == (60, 52, None)

    db.add(TenantSetting(tenant_id=tenant_id, setting_key="clearance_enabled", setting_value="true"))
    db.commit()
    item = detail()
    assert (float(item["offer_price"]), float(item["discount_percent"]), item["discount_source"]) \
        == (36.40, 30, "clearance")

    offer = Offer(tenant_id=tenant_id, name="Diwali Sale", start_date=today, end_date=today)
    db.add(offer)
    db.flush()
    db.add(OfferItem(offer_id=offer.id, product_id=product.id, discount_type="percent", discount_value=50))
    db.commit()
    item = detail()
    assert (float(item["offer_price"]), item["discount_source"], item["offer_name"]) \
        == (26, "offer", "Diwali Sale")

    db.query(ProductBatch).filter(ProductBatch.expiry_date >= today).update({"quantity_left": 0})
    db.commit()
    assert detail()["in_stock"] is False


def test_shop_loose_markdown_search_sort_and_paging(client, db, online, product):
    from datetime import datetime, timedelta
    tenant = online["tenant_a"]
    add_product(db, tenant, "P0002", "Tomato Loose", product_type="loose", is_loose=True, unit_type="kg",
                mrp=40, selling_price=40, markdown_percent=25,
                markdown_until=datetime.utcnow() + timedelta(hours=2))
    add_product(db, tenant, "P0003", "Sugar 1kg", brand="Tata", selling_price=45)
    add_product(db, tenant, "P0004", "Salt 1kg", brand="Tata", selling_price=20, stock_quantity=0)
    products = lambda **p: client.get(f"{SHOP}/storea/products", params=p).json()

    tomato = products(search="tomato")["items"][0]
    assert tomato["is_loose"] and tomato["unit_type"] == "kg"
    assert (float(tomato["offer_price"]), tomato["discount_source"]) == (30, "clearance")

    assert [i["product_name"] for i in products(search="tata")["items"]] == ["Sugar 1kg", "Salt 1kg"]
    # In-stock first, then by price
    assert [i["product_name"] for i in products(sort="price_asc")["items"]] \
        == ["Tomato Loose", "Sugar 1kg", "Rice 1kg", "Salt 1kg"]
    assert [i["product_name"] for i in products(sort="price_desc")["items"]][0] == "Rice 1kg"
    assert products(category_id=product.category_id)["total"] == 1
    page = products(page=2, page_size=3)
    assert page["total"] == 4 and len(page["items"]) == 1
    assert client.get(f"{SHOP}/storea/products", params={"sort": "cost"}).status_code == 422


def test_shop_products_on_offer_and_by_ids(client, db, online, product):
    from datetime import datetime, timedelta
    from app.core.clearance import today_ist
    from app.models import Offer, OfferItem
    tenant = online["tenant_a"]
    tomato = add_product(db, tenant, "P0002", "Tomato Loose", product_type="loose", is_loose=True,
                         unit_type="kg", markdown_percent=20,
                         markdown_until=datetime.utcnow() + timedelta(hours=2))
    add_product(db, tenant, "P0003", "Onion Loose", product_type="loose", is_loose=True, unit_type="kg",
                markdown_percent=20, markdown_until=datetime.utcnow() - timedelta(hours=1))
    sugar = add_product(db, tenant, "P0004", "Sugar 1kg")
    today = today_ist()
    offer = Offer(tenant_id=tenant.id, name="Diwali Sale", start_date=today, end_date=today)
    ended = Offer(tenant_id=tenant.id, name="Old Sale", start_date=today - timedelta(days=9),
                  end_date=today - timedelta(days=1))
    db.add_all([offer, ended])
    db.flush()
    db.add_all([OfferItem(offer_id=offer.id, product_id=sugar.id, discount_type="percent", discount_value=10),
                OfferItem(offer_id=ended.id, product_id=product.id, discount_type="percent", discount_value=10)])
    db.commit()
    names = lambda **p: sorted(i["product_name"] for i in
                               client.get(f"{SHOP}/storea/products", params=p).json()["items"])

    # Running offer or a markdown still valid; ended offers and lapsed markdowns are not offers
    assert names(on_offer=True) == ["Sugar 1kg", "Tomato Loose"]
    assert names(ids=f"{tomato.id},{product.id}") == ["Rice 1kg", "Tomato Loose"]
    assert names(ids="999999") == []
    assert client.get(f"{SHOP}/storea/products", params={"ids": "1,abc"}).status_code == 422


# ---------- Online orders (home delivery) ----------

ORDERS = "/api/v1/shop"
ADDRESS = {"contact_name": "Asha", "contact_mobile": "9876543210", "address_line": "12 MG Road",
           "area": "Indiranagar", "city": "Bengaluru", "pincode": "560038"}


def customer_headers(db, mobile="9876543210"):
    from app.core.security import create_access_token
    from app.models import CustomerAccount
    account = CustomerAccount(mobile=mobile, customer_name="Asha")
    db.add(account)
    db.commit()
    token = create_access_token({"type": "customer", "account_id": account.id})
    return {"Authorization": f"Bearer {token}"}


def place(client, headers, address_id, items, expected_total, **extra):
    return client.post(f"{ORDERS}/stores/storea/orders", headers=headers, json={
        "items": items, "address_id": address_id, "payment_method": "cod",
        "expected_total": expected_total, **extra})


def test_delivery_addresses_belong_to_the_login(client, db, online):
    asha = customer_headers(db)
    ravi = customer_headers(db, mobile="9123456780")
    url = f"{ORDERS}/addresses"
    assert client.get(url).status_code == 401

    first = client.post(url, json=ADDRESS, headers=asha).json()
    assert first["is_default"] is True
    second = client.post(url, json={**ADDRESS, "label": "Office", "is_default": True}, headers=asha).json()
    items = client.get(url, headers=asha).json()["items"]
    assert [(a["id"], a["is_default"]) for a in items] == [(second["id"], True), (first["id"], False)]
    assert client.post(url, json={**ADDRESS, "pincode": "012345"}, headers=asha).status_code == 422

    assert client.get(url, headers=ravi).json()["items"] == []
    assert client.delete(f"{url}/{first['id']}", headers=ravi).status_code == 404
    assert client.delete(f"{url}/{second['id']}", headers=asha).status_code == 200
    assert client.get(url, headers=asha).json()["items"][0]["is_default"] is True


def test_checkout_quote_prices_cart_and_delivery(client, db, online, product):
    tenant = online["tenant_a"]
    tomato = add_product(db, tenant, "P0002", "Tomato Loose", product_type="loose", is_loose=True,
                         unit_type="kg", mrp=40, selling_price=40, stock_quantity=5)
    gone = add_product(db, tenant, "P0003", "Old Soap", status="inactive")
    quote = lambda items: client.post(f"{ORDERS}/stores/storea/checkout/quote", json={"items": items})

    body = quote([{"product_id": product.id, "quantity": 2}, {"product_id": tomato.id, "quantity": 1.5}]).json()
    assert [float(i["line_total"]) for i in body["items"]] == [110, 60]
    assert (float(body["mrp_total"]), float(body["items_total"]), float(body["discount_amount"])) == (180, 170, 10)
    assert (float(body["delivery_charge"]), float(body["total_amount"])) == (30, 200)

    body = quote([{"product_id": product.id, "quantity": 6}]).json()
    assert (float(body["delivery_charge"]), float(body["total_amount"])) == (0, 330)

    problems = quote([{"product_id": tomato.id, "quantity": 9}, {"product_id": gone.id, "quantity": 1}]).json()
    assert problems["items"] == [] and float(problems["total_amount"]) == 0
    assert [(p["reason"], p["available"]) for p in problems["problems"]] == [("short", "5.000"), ("unavailable", None)]

    assert quote([{"product_id": product.id, "quantity": 1.5}]).status_code == 400
    assert quote([{"product_id": product.id, "quantity": 1}, {"product_id": product.id, "quantity": 2}]).status_code == 422


def test_place_order_holds_stock_until_cancelled(client, db, online, product):
    from app.models import AuditLog, Customer, Order
    headers = customer_headers(db)
    address = client.post(f"{ORDERS}/addresses", json=ADDRESS, headers=headers).json()
    product.stock_quantity = 3
    db.commit()
    items = [{"product_id": product.id, "quantity": 3}]

    assert place(client, {}, address["id"], items, 195).status_code == 401
    assert place(client, headers, address["id"], items, 190).status_code == 409
    assert place(client, headers, address["id"], items, 195, payment_method="online").status_code == 503

    res = place(client, headers, address["id"], items, 195, notes="Ring the bell")
    assert res.status_code == 201, res.text
    order = res.json()
    assert order["order_no"].startswith("ON") and order["status"] == "placed" and order["can_cancel"]
    assert order["store"] == "storea" and float(order["total_amount"]) == 195
    assert order["delivery_address"] == "12 MG Road, Indiranagar, Bengaluru - 560038"
    assert db.query(Customer).filter(Customer.tenant_id == online["tenant_a"].id,
                                     Customer.mobile == "9876543210").one().customer_name == "Asha"
    assert db.query(AuditLog).filter(AuditLog.entity_type == "order").count() == 1
    # In-store stock is untouched; online it is held by the order
    db.refresh(product)
    assert float(product.stock_quantity) == 3
    assert client.get(f"{SHOP}/storea/products/{product.id}").json()["in_stock"] is False
    assert place(client, headers, address["id"], [{"product_id": product.id, "quantity": 1}], 85).status_code == 409

    listing = client.get(f"{ORDERS}/orders", headers=headers).json()
    assert listing["total"] == 1 and listing["items"][0]["item_count"] == 1
    other = customer_headers(db, mobile="9123456780")
    assert client.get(f"{ORDERS}/orders/{order['id']}", headers=other).status_code == 404
    assert client.post(f"{ORDERS}/orders/{order['id']}/cancel", json={}, headers=other).status_code == 404

    cancelled = client.post(f"{ORDERS}/orders/{order['id']}/cancel", json={"reason": "Ordered by mistake"},
                            headers=headers).json()
    assert (cancelled["status"], cancelled["cancelled_by"], cancelled["can_cancel"]) == ("cancelled", "customer", False)
    assert client.get(f"{SHOP}/storea/products/{product.id}").json()["in_stock"] is True
    assert client.post(f"{ORDERS}/orders/{order['id']}/cancel", json={}, headers=headers).status_code == 400

    again = place(client, headers, address["id"], items, 195).json()
    db.query(Order).filter(Order.id == again["id"]).update({"status": "packed"})
    db.commit()
    assert client.post(f"{ORDERS}/orders/{again['id']}/cancel", json={}, headers=headers).status_code == 400


def test_store_can_block_a_customer_from_ordering(client, db, online, product):
    from app.models import Customer
    headers = customer_headers(db)
    address = client.post(f"{ORDERS}/addresses", json=ADDRESS, headers=headers).json()
    db.add(Customer(tenant_id=online["tenant_a"].id, mobile="9876543210", status="inactive"))
    db.commit()
    res = place(client, headers, address["id"], [{"product_id": product.id, "quantity": 1}], 85)
    assert res.status_code == 403


# ---------- Online orders handled by store staff ----------

STAFF = "/api/v1/online-orders"


def placed_order(client, db, online, product):
    """Rice x3 (Rs 55) and 1 kg loose tomato (Rs 40): 205 + Rs 30 delivery"""
    tomato = add_product(db, online["tenant_a"], "P0002", "Tomato Loose", product_type="loose",
                         is_loose=True, unit_type="kg", mrp=40, selling_price=40, stock_quantity=5)
    headers = customer_headers(db)
    address = client.post(f"{ORDERS}/addresses", json=ADDRESS, headers=headers).json()
    items = [{"product_id": product.id, "quantity": 3}, {"product_id": tomato.id, "quantity": 1}]
    order = place(client, headers, address["id"], items, 235)
    assert order.status_code == 201, order.text
    return order.json(), tomato, headers


def test_staff_confirm_pack_and_deliver_bills_a_sale(client, db, online, product, cashier_headers):
    from app.core.online_orders import new_order_signal, reserved_quantities
    from app.models import Sale
    order, tomato, customer = placed_order(client, db, online, product)
    url = f"{STAFF}/{order['id']}"
    assert new_order_signal(db, online["tenant_a"].id) == {"latest_id": order["id"], "waiting": 1}
    listing = client.get(STAFF, headers=cashier_headers).json()
    assert listing["counts"] == {"placed": 1} and listing["items"][0]["customer_mobile"] == "9876543210"
    assert client.get(STAFF, params={"search": "98765"}, headers=cashier_headers).json()["total"] == 1

    rice_item, tomato_item = client.get(url, headers=cashier_headers).json()["items"]
    pack = lambda rice, tom: client.post(f"{url}/pack", headers=cashier_headers, json={"items": [
        {"item_id": rice_item["id"], "packed_quantity": rice},
        {"item_id": tomato_item["id"], "packed_quantity": tom}]})
    assert pack(2, 1.05).status_code == 400  # not confirmed yet
    assert client.post(f"{url}/confirm", headers=cashier_headers).json()["status"] == "confirmed"
    assert client.get(f"{ORDERS}/orders/{order['id']}", headers=customer).json()["status"] == "confirmed"

    assert pack(4, 1).status_code == 400  # more than ordered
    assert pack(2, 1.2).status_code == 400  # loose more than 10% over
    assert client.post(f"{url}/pack", headers=cashier_headers,
                       json={"items": [{"item_id": rice_item["id"], "packed_quantity": 2}]}).status_code == 400
    packed = pack(2, 1.05).json()
    assert packed["status"] == "packed"
    assert (float(packed["items_total"]), float(packed["total_amount"])) == (152, 182)
    assert reserved_quantities(db, online["tenant_a"].id, [product.id]) == {product.id: 2}

    # The customer pays the order price even after the shelf price went up
    product.selling_price = 70
    db.commit()
    assert client.post(f"{url}/dispatch", headers=cashier_headers).json()["status"] == "out_for_delivery"
    res = client.post(f"{url}/deliver", headers=cashier_headers, json={"payment_mode": "cash"})
    assert res.status_code == 200, res.text
    delivered = res.json()
    assert delivered["status"] == "delivered" and delivered["invoice_no"] and delivered["sale_no"]
    sale = db.query(Sale).filter(Sale.id == delivered["sale_id"]).one()
    assert float(sale.total_amount) == 182 and sale.payments[0].mode == "cash"
    lines = {i.product_name: i for i in sale.items}
    assert (float(lines["Rice 1kg"].line_total), lines["Rice 1kg"].discount_source) == (110, "online")
    assert float(lines["Tomato Loose"].quantity) == 1.05
    delivery = lines["Delivery charge (online order)"]
    assert (float(delivery.line_total), delivery.hsn_code, float(delivery.tax_percent)) == (30, "996813", 18)
    db.refresh(product)
    db.refresh(tomato)
    assert (float(product.stock_quantity), float(tomato.stock_quantity)) == (98, 3.95)
    assert reserved_quantities(db, online["tenant_a"].id, [product.id]) == {}
    mine = client.get(f"{ORDERS}/orders/{order['id']}", headers=customer).json()
    assert mine["status"] == "delivered" and mine["items"][0]["packed_quantity"] == "2.000"
    assert client.post(f"{url}/deliver", headers=cashier_headers, json={}).status_code == 400


def test_only_supervisors_cancel_and_stores_see_their_own_orders(client, db, online, product, cashier_headers,
                                                                 supervisor_headers, admin_b_headers):
    order, _, customer = placed_order(client, db, online, product)
    url = f"{STAFF}/{order['id']}"
    assert client.get(url, headers=admin_b_headers).status_code == 404
    assert client.get(STAFF, headers=admin_b_headers).json()["total"] == 0
    assert client.post(f"{url}/cancel", json={"reason": "Out of stock"}, headers=cashier_headers).status_code == 403
    assert client.post(f"{url}/cancel", json={"reason": " "}, headers=supervisor_headers).status_code == 422

    res = client.post(f"{url}/cancel", json={"reason": "Shop closed today"}, headers=supervisor_headers).json()
    assert (res["status"], res["cancelled_by"], res["cancel_reason"]) == ("cancelled", "store", "Shop closed today")
    mine = client.get(f"{ORDERS}/orders/{order['id']}", headers=customer).json()
    assert (mine["status"], mine["cancelled_by"]) == ("cancelled", "store")
    assert client.post(f"{url}/confirm", headers=cashier_headers).status_code == 400
