"""Authentication endpoint and health check tests"""
import json
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from tests.conftest import PASSWORD, enable_online, make_user


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


def test_refresh_issues_new_token(client, admin_headers):
    res = client.post("/api/v1/auth/refresh", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["access_token"]
    assert body["expires_in"] > 0
    assert body["username"] == "admin_a"
    assert body["tenant_name"] == "Tenant A"
    new_headers = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=new_headers).status_code == 200


def test_refresh_requires_token(client, seed):
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_refresh_rejects_expired_token(client, seed):
    token = create_access_token({"user_id": seed["admin"].id}, expires_delta=timedelta(minutes=-1))
    res = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401


# ---------- Store subdomains ----------

@pytest.fixture()
def subdomains(db, seed, monkeypatch):
    monkeypatch.setattr(settings, "BASE_DOMAIN", "mfmart.co.in")
    seed["tenant_a"].subdomain = "storea"
    seed["tenant_b"].subdomain = "storeb"
    db.commit()
    return seed


STORE_A = {"Host": "storea.mfmart.co.in"}


def test_login_on_own_subdomain(client, subdomains):
    res = client.post("/api/v1/auth/login", data={"username": "admin_a", "password": PASSWORD},
                      headers=STORE_A)
    assert res.status_code == 200
    assert res.json()["tenant_id"] == subdomains["tenant_a"].id


def test_login_on_other_store_subdomain_rejected(client, subdomains):
    res = client.post("/api/v1/auth/login", data={"username": "admin_b", "password": PASSWORD},
                      headers=STORE_A)
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect username or password"


def test_login_same_username_picks_subdomain_store(client, db, subdomains):
    pw_hash = get_password_hash(PASSWORD)
    make_user(db, subdomains["tenant_a"], subdomains["cashier_role"], "shared", pw_hash)
    make_user(db, subdomains["tenant_b"], subdomains["cashier_role"], "shared", pw_hash)
    db.commit()
    res = client.post("/api/v1/auth/login", data={"username": "shared", "password": PASSWORD},
                      headers={"Host": "storeb.mfmart.co.in"})
    assert res.json()["tenant_id"] == subdomains["tenant_b"].id


def test_other_store_token_rejected_on_subdomain(client, subdomains, admin_b_headers):
    res = client.get("/api/v1/auth/me", headers={**admin_b_headers, **STORE_A})
    assert res.status_code == 403
    assert res.json()["detail"] == "This account does not belong to this store"


def test_other_store_data_blocked_on_subdomain(client, subdomains, admin_b_headers):
    res = client.get("/api/v1/products", headers={**admin_b_headers, **STORE_A})
    assert res.status_code == 403


def test_own_token_allowed_on_subdomain(client, subdomains, admin_headers):
    assert client.get("/api/v1/auth/me", headers={**admin_headers, **STORE_A}).status_code == 200


def test_origin_header_used_for_cross_site_ui(client, subdomains, admin_b_headers):
    headers = {**admin_b_headers, "Origin": "https://storea.mfmart.co.in"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 403


def test_unknown_subdomain_not_found(client, subdomains, admin_headers):
    res = client.get("/api/v1/auth/me", headers={**admin_headers, "Host": "nostore.mfmart.co.in"})
    assert res.status_code == 404
    assert res.json()["detail"] == "Store not found"


def test_non_store_host_has_no_restriction(client, subdomains, admin_b_headers):
    headers = {**admin_b_headers, "Host": "warsi-family-mart-lbo9k.ondigitalocean.app"}
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200


# ---------- Customer login (online shop, mobile OTP) ----------

MOBILE = "9876543210"


@pytest.fixture()
def shop(db, seed, monkeypatch):
    """Tenant A sells online (storea); tenant B (storeb) has online ordering off"""
    from app.core import otp
    seed["tenant_a"].subdomain = "storea"
    seed["tenant_b"].subdomain = "storeb"
    enable_online(db, seed["tenant_a"])
    sent = []
    monkeypatch.setattr(settings, "OTP_PROVIDER", "console")
    monkeypatch.setitem(otp.SENDERS, "console", lambda mobile, code: sent.append(code))
    return {**seed, "sent": sent}


def shop_url(path):
    return f"/api/v1/shop/auth{path}"


def customer_login(client, shop, mobile=MOBILE):
    assert client.post(shop_url("/otp/request"), json={"mobile": mobile}).status_code == 200
    res = client.post(shop_url("/otp/verify"), json={"mobile": mobile, "code": shop["sent"][-1]})
    assert res.status_code == 200, res.text
    return res.json()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_first_otp_login_creates_account_but_no_store_record(client, db, shop):
    from app.models import Customer, CustomerAccount
    body = customer_login(client, shop, mobile="+91 98765 43210")
    assert body["needs_name"] is True
    assert body["account"]["mobile"] == MOBILE and body["refresh_token"]
    assert db.query(CustomerAccount).filter(CustomerAccount.mobile == MOBILE).one().last_login
    assert db.query(Customer).filter(Customer.mobile == MOBILE).count() == 0

    headers = bearer(body["access_token"])
    assert client.put(shop_url("/me"), json={"customer_name": "  Asha  "},
                      headers=headers).json()["customer_name"] == "Asha"
    assert client.get(shop_url("/me"), headers=headers).json()["customer_name"] == "Asha"
    assert client.get(shop_url("/my-stores"), headers=headers).json()["items"] == []


def test_login_uses_name_from_stores_and_fills_missing_names(client, db, shop):
    from app.models import Customer
    named = Customer(tenant_id=shop["tenant_a"].id, mobile=MOBILE, customer_name="Ravi")
    unnamed = Customer(tenant_id=shop["tenant_b"].id, mobile=MOBILE)
    db.add_all([named, unnamed])
    db.commit()
    body = customer_login(client, shop)
    assert body["needs_name"] is False
    assert body["account"]["customer_name"] == "Ravi"

    client.put(shop_url("/me"), json={"customer_name": "Ravi Kumar"}, headers=bearer(body["access_token"]))
    db.expire_all()
    assert named.customer_name == "Ravi" and unnamed.customer_name == "Ravi Kumar"


def test_my_stores_lists_own_online_stores_only(client, db, shop):
    from datetime import datetime
    from app.models import Customer, TenantSetting
    db.add_all([
        Customer(tenant_id=shop["tenant_a"].id, mobile=MOBILE, points_balance=120,
                 loyalty_last_activity=datetime.utcnow()),
        Customer(tenant_id=shop["tenant_b"].id, mobile=MOBILE),
        Customer(tenant_id=shop["tenant_b"].id, mobile="9123456780"),
        TenantSetting(tenant_id=shop["tenant_a"].id, setting_key="loyalty_enabled", setting_value="true"),
    ])
    db.commit()
    headers = bearer(customer_login(client, shop)["access_token"])

    stores = client.get(shop_url("/my-stores"), headers=headers).json()["items"]
    assert stores == [{"store": "storea", "store_name": "Tenant A", "points_balance": 120}]

    enable_online(db, shop["tenant_b"])
    stores = client.get(shop_url("/my-stores"), headers=headers).json()["items"]
    assert [(s["store"], s["points_balance"]) for s in stores] == [("storea", 120), ("storeb", 0)]

    db.query(Customer).filter(Customer.tenant_id == shop["tenant_b"].id,
                              Customer.mobile == MOBILE).update({"status": "inactive"})
    db.commit()
    assert [s["store"] for s in client.get(shop_url("/my-stores"), headers=headers).json()["items"]] == ["storea"]


def test_wrong_code_attempts_are_limited(client, shop, monkeypatch):
    monkeypatch.setattr(settings, "OTP_MAX_ATTEMPTS", 2)
    client.post(shop_url("/otp/request"), json={"mobile": MOBILE})
    code = shop["sent"][-1]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(2):
        res = client.post(shop_url("/otp/verify"), json={"mobile": MOBILE, "code": wrong})
        assert res.status_code == 400 and res.json()["detail"] == "Incorrect code"
    res = client.post(shop_url("/otp/verify"), json={"mobile": MOBILE, "code": code})
    assert res.status_code == 429


def test_code_works_once_and_expires(client, db, shop):
    from app.models import CustomerOtp
    customer_login(client, shop)
    res = client.post(shop_url("/otp/verify"), json={"mobile": MOBILE, "code": shop["sent"][-1]})
    assert res.status_code == 400

    record = db.query(CustomerOtp).filter(CustomerOtp.mobile == MOBILE).one()
    record.consumed_at = None
    record.expires_at = record.created_at - timedelta(seconds=1)
    db.commit()
    res = client.post(shop_url("/otp/verify"), json={"mobile": MOBILE, "code": shop["sent"][-1]})
    assert res.status_code == 400 and "expired" in res.json()["detail"]


def test_otp_request_limits(client, shop, monkeypatch):
    def ask(mobile, ip="203.0.113.5"):
        return client.post(shop_url("/otp/request"), json={"mobile": mobile},
                           headers={"X-Forwarded-For": ip})

    assert ask(MOBILE).status_code == 200
    res = ask(MOBILE)
    assert res.status_code == 429 and "Retry-After" in res.headers

    monkeypatch.setattr(settings, "OTP_RESEND_SECONDS", 0)
    monkeypatch.setattr(settings, "OTP_MAX_PER_MOBILE_PER_HOUR", 2)
    assert ask(MOBILE).status_code == 200
    assert ask(MOBILE, "198.51.100.7").status_code == 429

    monkeypatch.setattr(settings, "OTP_MAX_PER_IP_PER_HOUR", 2)
    assert ask("9123456780").status_code == 429
    assert ask("9123456780", "198.51.100.7").status_code == 200


def test_otp_request_rejects_bad_input_and_disabled_login(client, shop, monkeypatch):
    assert client.post(shop_url("/otp/request"), json={"mobile": "12345"}).status_code == 422
    monkeypatch.setattr(settings, "OTP_PROVIDER", "")
    assert client.post(shop_url("/otp/request"), json={"mobile": MOBILE}).status_code == 503
    assert shop["sent"] == []


def test_fixed_provider_accepts_fixed_code_for_any_number(client, shop, monkeypatch):
    monkeypatch.setattr(settings, "OTP_PROVIDER", "fixed")
    monkeypatch.setattr(settings, "OTP_FIXED_CODE", "123456")
    for mobile in (MOBILE, "9123456780"):
        assert client.post(shop_url("/otp/request"), json={"mobile": mobile}).status_code == 200
        res = client.post(shop_url("/otp/verify"), json={"mobile": mobile, "code": "000000"})
        assert res.status_code == 400 and res.json()["detail"] == "Incorrect code"
        res = client.post(shop_url("/otp/verify"), json={"mobile": mobile, "code": "123456"})
        assert res.status_code == 200 and res.json()["account"]["mobile"] == mobile
    assert shop["sent"] == []


class FakeSmsReply:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


@pytest.fixture()
def startmessaging(monkeypatch):
    """OTP_PROVIDER=startmessaging with the HTTP call captured instead of sent"""
    import urllib.request
    calls = []
    monkeypatch.setattr(settings, "OTP_PROVIDER", "startmessaging")
    monkeypatch.setattr(settings, "STARTMESSAGING_API_KEY", "test-key")
    monkeypatch.setattr(settings, "STARTMESSAGING_TEMPLATE_ID", "")
    reply = {"error": None}

    def fake_urlopen(request, timeout):
        calls.append({"url": request.full_url, "headers": dict(request.header_items()),
                      "body": json.loads(request.data), "timeout": timeout})
        if reply["error"]:
            raise reply["error"]
        return FakeSmsReply(b'{"success": true, "data": {"messageId": "m-1", "status": "queued"}}')

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    return {"calls": calls, "reply": reply}


def test_startmessaging_sends_our_code_and_login_works(client, db, shop, startmessaging):
    from app.models import CustomerOtp
    assert client.post(shop_url("/otp/request"), json={"mobile": MOBILE}).status_code == 200
    call = startmessaging["calls"][0]
    assert call["url"] == "https://api.startmessaging.com/otp/send"
    assert call["headers"]["X-api-key"] == "test-key" and call["timeout"] == 10
    code = call["body"]["variables"]["otp"]
    assert call["body"] == {"phoneNumber": f"+91{MOBILE}", "variables": {"otp": code, "appName": "MFMart"}}
    assert len(code) == 6 and code.isdigit()
    assert db.query(CustomerOtp).filter(CustomerOtp.mobile == MOBILE).count() == 1
    res = client.post(shop_url("/otp/verify"), json={"mobile": MOBILE, "code": code})
    assert res.status_code == 200


def test_startmessaging_failure_saves_no_code_and_needs_api_key(client, db, shop, startmessaging, monkeypatch):
    import io
    import urllib.error
    from app.models import CustomerOtp
    url = "https://api.startmessaging.com/otp/send"
    startmessaging["reply"]["error"] = urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(b""))
    res = client.post(shop_url("/otp/request"), json={"mobile": MOBILE})
    assert res.status_code == 503 and "Could not send" in res.json()["detail"]
    assert db.query(CustomerOtp).filter(CustomerOtp.mobile == MOBILE).count() == 0

    startmessaging["reply"]["error"] = urllib.error.HTTPError(url, 429, "Too Many", {}, io.BytesIO(b""))
    assert client.post(shop_url("/otp/request"), json={"mobile": MOBILE}).status_code == 429
    startmessaging["reply"]["error"] = urllib.error.URLError("timed out")
    assert client.post(shop_url("/otp/request"), json={"mobile": MOBILE}).status_code == 503

    monkeypatch.setattr(settings, "STARTMESSAGING_TEMPLATE_ID", "TPL1")
    startmessaging["reply"]["error"] = None
    assert client.post(shop_url("/otp/request"), json={"mobile": MOBILE}).status_code == 200
    assert startmessaging["calls"][-1]["body"]["templateId"] == "TPL1"

    monkeypatch.setattr(settings, "STARTMESSAGING_API_KEY", "")
    count = len(startmessaging["calls"])
    assert client.post(shop_url("/otp/request"), json={"mobile": "9123456780"}).status_code == 503
    assert len(startmessaging["calls"]) == count


def test_customer_and_staff_tokens_are_separate(client, shop, admin_headers):
    customer_headers = bearer(customer_login(client, shop)["access_token"])
    assert client.get("/api/v1/auth/me", headers=customer_headers).status_code == 401
    assert client.get("/api/v1/products", headers=customer_headers).status_code == 401
    assert client.get(shop_url("/me"), headers=admin_headers).status_code == 401
    assert client.get(shop_url("/me")).status_code == 401


def test_refresh_rotates_and_detects_reuse(client, shop):
    first = customer_login(client, shop)
    res = client.post(shop_url("/refresh"), json={"refresh_token": first["refresh_token"]})
    assert res.status_code == 200
    second = res.json()
    assert client.get(shop_url("/me"), headers=bearer(second["access_token"])).status_code == 200

    # The old token coming back ends every session, including the new one
    assert client.post(shop_url("/refresh"), json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.post(shop_url("/refresh"), json={"refresh_token": second["refresh_token"]}).status_code == 401


def test_logout_revokes_refresh_token(client, shop):
    body = customer_login(client, shop)
    assert client.post(shop_url("/logout"), json={"refresh_token": body["refresh_token"]}).status_code == 200
    assert client.post(shop_url("/refresh"), json={"refresh_token": body["refresh_token"]}).status_code == 401


def test_disabled_account_cannot_log_in(client, db, shop, monkeypatch):
    from app.models import CustomerAccount
    body = customer_login(client, shop)
    db.query(CustomerAccount).filter(CustomerAccount.mobile == MOBILE).update({"status": "inactive"})
    db.commit()
    assert client.get(shop_url("/me"), headers=bearer(body["access_token"])).status_code == 403
    assert client.post(shop_url("/refresh"), json={"refresh_token": body["refresh_token"]}).status_code == 403

    monkeypatch.setattr(settings, "OTP_RESEND_SECONDS", 0)
    client.post(shop_url("/otp/request"), json={"mobile": MOBILE})
    res = client.post(shop_url("/otp/verify"), json={"mobile": MOBILE, "code": shop["sent"][-1]})
    assert res.status_code == 403
