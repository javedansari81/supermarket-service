"""User management endpoint tests"""
from tests.test_auth import login

URL = "/api/v1/users"


def new_user(seed, **overrides):
    data = {"username": "newcashier", "password": "pass1234",
            "role_id": seed["cashier_role"].id, "full_name": "New Cashier"}
    data.update(overrides)
    return data


def test_list_users_scoped_to_tenant(client, admin_headers):
    res = client.get(URL, headers=admin_headers)
    assert res.status_code == 200
    names = {u["username"] for u in res.json()["items"]}
    assert names == {"admin_a", "cashier_a"}


def test_list_users_forbidden_for_cashier(client, cashier_headers):
    res = client.get(URL, headers=cashier_headers)
    assert res.status_code == 403
    assert res.json()["detail"] == "Admin access required"


def test_list_users_requires_auth(client, seed):
    assert client.get(URL).status_code == 401


def test_list_users_invalid_pagination(client, admin_headers):
    assert client.get(URL, params={"page": 0}, headers=admin_headers).status_code == 422
    assert client.get(URL, params={"page_size": 101}, headers=admin_headers).status_code == 422


def test_list_roles(client, admin_headers, cashier_headers):
    res = client.get(f"{URL}/roles", headers=admin_headers)
    assert res.status_code == 200
    assert {r["role_name"] for r in res.json()} >= {"admin", "cashier"}
    assert client.get(f"{URL}/roles", headers=cashier_headers).status_code == 403


def test_get_user(client, seed, admin_headers):
    res = client.get(f"{URL}/{seed['cashier'].id}", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["username"] == "cashier_a"
    assert "password_hash" not in res.json()


def test_get_user_other_tenant_not_found(client, seed, admin_headers):
    assert client.get(f"{URL}/{seed['admin_b'].id}", headers=admin_headers).status_code == 404


def test_create_user_and_login(client, seed, admin_headers):
    res = client.post(URL, json=new_user(seed), headers=admin_headers)
    assert res.status_code == 201
    assert res.json()["tenant_id"] == seed["tenant_a"].id
    assert login(client, "newcashier", "pass1234").status_code == 200


def test_create_user_duplicate_username(client, seed, admin_headers):
    res = client.post(URL, json=new_user(seed, username="cashier_a"), headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Username already exists"


def test_create_user_same_username_other_tenant_allowed(client, seed, admin_b_headers):
    res = client.post(URL, json=new_user(seed, username="cashier_a"), headers=admin_b_headers)
    assert res.status_code == 201


def test_create_user_invalid_role(client, seed, admin_headers):
    res = client.post(URL, json=new_user(seed, role_id=99999), headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid role"


def test_create_user_validation(client, seed, admin_headers):
    assert client.post(URL, json=new_user(seed, password="123"), headers=admin_headers).status_code == 422
    assert client.post(URL, json=new_user(seed, username="ab"), headers=admin_headers).status_code == 422
    assert client.post(URL, json={"username": "x"}, headers=admin_headers).status_code == 422


def test_create_user_forbidden_for_cashier(client, seed, cashier_headers):
    assert client.post(URL, json=new_user(seed), headers=cashier_headers).status_code == 403


def test_update_user(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['cashier'].id}", json={"full_name": "Renamed"},
                     headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["full_name"] == "Renamed"


def test_update_user_invalid_status(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['cashier'].id}", json={"status": "deleted"}, headers=admin_headers)
    assert res.status_code == 422


def test_update_user_invalid_role(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['cashier'].id}", json={"role_id": 99999}, headers=admin_headers)
    assert res.status_code == 400


def test_update_own_role_rejected(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['admin'].id}", json={"role_id": seed["cashier_role"].id},
                     headers=admin_headers)
    assert res.status_code == 400
    assert res.json()["detail"] == "You cannot change your own role"


def test_deactivate_self_via_update_rejected(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['admin'].id}", json={"status": "inactive"}, headers=admin_headers)
    assert res.status_code == 400


def test_update_user_other_tenant_not_found(client, seed, admin_headers):
    res = client.put(f"{URL}/{seed['admin_b'].id}", json={"full_name": "x"}, headers=admin_headers)
    assert res.status_code == 404


def test_reset_password(client, seed, admin_headers):
    res = client.post(f"{URL}/{seed['cashier'].id}/reset-password",
                      json={"new_password": "brandnew1"}, headers=admin_headers)
    assert res.status_code == 200
    assert login(client, "cashier_a", "brandnew1").status_code == 200


def test_reset_password_too_short(client, seed, admin_headers):
    res = client.post(f"{URL}/{seed['cashier'].id}/reset-password",
                      json={"new_password": "123"}, headers=admin_headers)
    assert res.status_code == 422


def test_reset_password_other_tenant_not_found(client, seed, admin_headers):
    res = client.post(f"{URL}/{seed['admin_b'].id}/reset-password",
                      json={"new_password": "brandnew1"}, headers=admin_headers)
    assert res.status_code == 404


def test_delete_user_soft_deletes(client, seed, admin_headers):
    res = client.delete(f"{URL}/{seed['cashier'].id}", headers=admin_headers)
    assert res.status_code == 204
    assert client.get(f"{URL}/{seed['cashier'].id}", headers=admin_headers).json()["status"] == "inactive"
    assert login(client, "cashier_a").status_code == 403


def test_delete_self_rejected(client, seed, admin_headers):
    assert client.delete(f"{URL}/{seed['admin'].id}", headers=admin_headers).status_code == 400


def test_delete_user_not_found(client, seed, admin_headers):
    assert client.delete(f"{URL}/{seed['admin_b'].id}", headers=admin_headers).status_code == 404
    assert client.delete(f"{URL}/99999", headers=admin_headers).status_code == 404
