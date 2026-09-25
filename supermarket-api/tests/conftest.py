"""
Shared test fixtures.

Tests run against an isolated PostgreSQL schema (TEST_DB_SCHEMA, default "mart_test")
in the database configured by DATABASE_URL. Every test runs inside a transaction that
is rolled back afterwards, so tests never see each other's data.
"""
import os

os.environ["DEBUG"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, get_password_hash
import app.models  # noqa: F401  (register all models on Base.metadata)
from app.models import Role, Tenant, User, Category, Product, Supplier, StoreLocation
from main import app

TEST_SCHEMA = os.environ.get("TEST_DB_SCHEMA", "mart_test")
PASSWORD = "secret123"


@pytest.fixture(scope="session")
def engine():
    admin_engine = create_engine(settings.DATABASE_URL)
    with admin_engine.begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
        conn.execute(text(f'CREATE SCHEMA "{TEST_SCHEMA}"'))
    admin_engine.dispose()

    test_engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"options": f"-csearch_path={TEST_SCHEMA}"},
    )
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()
    with create_engine(settings.DATABASE_URL).begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))


@pytest.fixture(scope="session")
def password_hash():
    return get_password_hash(PASSWORD)


@pytest.fixture()
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False,
                      join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        except Exception:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_user(db, tenant, role, username, password_hash, status="active"):
    user = User(tenant_id=tenant.id, role_id=role.id, username=username,
                password_hash=password_hash, full_name=username.title(), status=status)
    db.add(user)
    db.flush()
    return user


def auth_headers(user):
    token = create_access_token({"user_id": user.id, "username": user.username,
                                 "tenant_id": user.tenant_id, "role": user.role.role_name})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def seed(db, password_hash):
    """Two tenants: tenant A (admin + cashier) and tenant B (admin)"""
    admin_role = Role(role_name="admin", description="Administrator")
    cashier_role = Role(role_name="cashier", description="Cashier")
    db.add_all([admin_role, cashier_role])
    db.flush()

    tenant_a = Tenant(tenant_code="TA", tenant_name="Tenant A")
    tenant_b = Tenant(tenant_code="TB", tenant_name="Tenant B")
    db.add_all([tenant_a, tenant_b])
    db.flush()

    data = {
        "admin_role": admin_role,
        "cashier_role": cashier_role,
        "tenant_a": tenant_a,
        "tenant_b": tenant_b,
        "admin": make_user(db, tenant_a, admin_role, "admin_a", password_hash),
        "cashier": make_user(db, tenant_a, cashier_role, "cashier_a", password_hash),
        "admin_b": make_user(db, tenant_b, admin_role, "admin_b", password_hash),
    }
    db.commit()
    return data


@pytest.fixture()
def admin_headers(seed):
    return auth_headers(seed["admin"])


@pytest.fixture()
def cashier_headers(seed):
    return auth_headers(seed["cashier"])


@pytest.fixture()
def admin_b_headers(seed):
    return auth_headers(seed["admin_b"])


@pytest.fixture()
def category(db, seed):
    cat = Category(tenant_id=seed["tenant_a"].id, category_name="Grocery")
    db.add(cat)
    db.commit()
    return cat


@pytest.fixture()
def product(db, seed, category):
    prod = Product(tenant_id=seed["tenant_a"].id, category_id=category.id,
                   product_no="P0001", product_name="Rice 1kg", barcode="8901234567890",
                   purchase_price=40, mrp=60, selling_price=55, tax_percent=5,
                   unit_type="pcs", is_loose=False, stock_quantity=100, reorder_level=10)
    db.add(prod)
    db.commit()
    return prod


@pytest.fixture()
def locations(db, seed):
    """A display shelf and a storage shelf for tenant A"""
    shelf = StoreLocation(tenant_id=seed["tenant_a"].id, location_code="D01-4", location_type="display",
                          floor="Ground", rack_no="D01", shelf_no="4")
    backroom = StoreLocation(tenant_id=seed["tenant_a"].id, location_code="S01-1", location_type="storage",
                             floor="1st", rack_no="S01", shelf_no="1")
    db.add_all([shelf, backroom])
    db.commit()
    return {"shelf": shelf, "backroom": backroom}


@pytest.fixture()
def supplier(db, seed):
    sup = Supplier(tenant_id=seed["tenant_a"].id, supplier_code="SUP001",
                   supplier_name="Acme Traders")
    db.add(sup)
    db.commit()
    return sup
