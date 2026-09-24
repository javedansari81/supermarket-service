"""Authentication endpoint and health check tests"""
from datetime import timedelta

from app.core.security import create_access_token
from tests.conftest import PASSWORD, make_user


def login(client, username, password=PASSWORD):
    return client.post("/api/v1/auth/login", data={"username": username, "password": password})


def test_root_and_health(client):
    assert client.get("/").status_code == 200
    assert client.get("/health").json() == {"status": "healthy"}


def test_login_success(client, seed):
    res = login(client, "admin_a")
    assert res.status_code == 200
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["role"] == "admin"
    assert body["tenant_name"] == "Tenant A"
    assert body["access_token"]


def test_login_wrong_password(client, seed):
    res = login(client, "admin_a", "wrong-password")
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect username or password"


def test_login_unknown_user(client, seed):
    assert login(client, "nobody").status_code == 401


def test_login_missing_fields(client, seed):
    assert client.post("/api/v1/auth/login", data={}).status_code == 422


def test_login_inactive_user(client, db, seed, password_hash):
    make_user(db, seed["tenant_a"], seed["cashier_role"], "inactive_a", password_hash, "inactive")
    db.commit()
    res = login(client, "inactive_a")
    assert res.status_code == 403
    assert res.json()["detail"] == "User account is inactive"


def test_login_inactive_tenant(client, db, seed):
    seed["tenant_b"].status = "inactive"
    db.commit()
    res = login(client, "admin_b")
    assert res.status_code == 403
    assert res.json()["detail"] == "Tenant account is inactive"


def test_login_same_username_in_two_tenants(client, db, seed):
    from app.core.security import get_password_hash
    make_user(db, seed["tenant_a"], seed["cashier_role"], "shared", get_password_hash("first-pass"))
    make_user(db, seed["tenant_b"], seed["cashier_role"], "shared", get_password_hash("second-pass"))
    db.commit()
    assert login(client, "shared", "first-pass").json()["tenant_id"] == seed["tenant_a"].id
    assert login(client, "shared", "second-pass").json()["tenant_id"] == seed["tenant_b"].id


def test_me(client, admin_headers):
    res = client.get("/api/v1/auth/me", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["username"] == "admin_a"
    assert res.json()["tenant_name"] == "Tenant A"


def test_me_requires_token(client, seed):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_invalid_token(client, seed):
    res = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401


def test_me_expired_token(client, seed):
    user = seed["admin"]
    token = create_access_token({"user_id": user.id}, expires_delta=timedelta(minutes=-1))
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_token_without_user_id(client, seed):
    token = create_access_token({"username": "admin_a"})
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


def test_token_rejected_after_user_deactivated(client, db, seed, cashier_headers):
    seed["cashier"].status = "inactive"
    db.commit()
    assert client.get("/api/v1/auth/me", headers=cashier_headers).status_code == 403


def test_token_rejected_after_tenant_deactivated(client, db, seed, admin_b_headers):
    seed["tenant_b"].status = "inactive"
    db.commit()
    res = client.get("/api/v1/auth/me", headers=admin_b_headers)
    assert res.status_code == 403
    assert res.json()["detail"] == "Tenant account is inactive"


def test_logout(client, admin_headers):
    res = client.post("/api/v1/auth/logout", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["message"] == "Successfully logged out"


def test_logout_requires_token(client, seed):
    assert client.post("/api/v1/auth/logout").status_code == 401
