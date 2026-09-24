"""Tenant endpoint tests"""
URL = "/api/v1/tenants"


def test_list_tenants_only_own(client, seed, admin_headers):
    res = client.get(URL, headers=admin_headers)
    assert res.status_code == 200
    assert [t["tenant_code"] for t in res.json()["items"]] == ["TA"]
    assert res.json()["total"] == 1


def test_list_tenants_forbidden_for_cashier(client, cashier_headers):
    assert client.get(URL, headers=cashier_headers).status_code == 403


def test_current_tenant(client, seed, cashier_headers):
    res = client.get(f"{URL}/current", headers=cashier_headers)
    assert res.status_code == 200
    assert res.json()["tenant_code"] == "TA"


def test_current_tenant_requires_auth(client, seed):
    assert client.get(f"{URL}/current").status_code == 401


def test_get_own_tenant(client, seed, admin_headers):
    res = client.get(f"{URL}/{seed['tenant_a'].id}", headers=admin_headers)
    assert res.status_code == 200


def test_get_other_tenant_not_found(client, seed, admin_headers):
    assert client.get(f"{URL}/{seed['tenant_b'].id}", headers=admin_headers).status_code == 404


def test_create_tenant(client, seed, admin_headers):
    res = client.post(URL, json={"tenant_code": "TC", "tenant_name": "Tenant C"},
                      headers=admin_headers)
    assert res.status_code == 201
    assert res.json()["status"] == "active"


def test_create_tenant_duplicate_code(client, seed, admin_headers):
    res = client.post(URL, json={"tenant_code": "TB", "tenant_name": "Dup"}, headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Tenant code already exists"


def test_create_tenant_validation(client, seed, admin_headers):
    assert client.post(URL, json={"tenant_name": "No code"}, headers=admin_headers).status_code == 422


def test_create_tenant_forbidden_for_cashier(client, seed, cashier_headers):
    res = client.post(URL, json={"tenant_code": "TC", "tenant_name": "C"}, headers=cashier_headers)
    assert res.status_code == 403


def test_update_own_tenant(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['tenant_a'].id}", json={"tenant_name": "Renamed A"},
                     headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["tenant_name"] == "Renamed A"


def test_update_other_tenant_not_found(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['tenant_b'].id}", json={"tenant_name": "Hijack"},
                     headers=admin_headers)
    assert res.status_code == 404


def test_deactivate_own_tenant_rejected(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['tenant_a'].id}", json={"status": "inactive"},
                     headers=admin_headers)
    assert res.status_code == 400


def test_update_tenant_invalid_status(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['tenant_a'].id}", json={"status": "bogus"}, headers=admin_headers)
    assert res.status_code == 422
