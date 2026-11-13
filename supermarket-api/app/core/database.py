"""
Database connection and session management
"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    connect_args={
        "options": f"-csearch_path={settings.DB_SCHEMA},public"
    }
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


def lock_sequence(db, name: str, tenant_id: int) -> None:
    """Hold a per-store lock until the transaction ends, so two requests working out the next
    number of the same kind (sale, invoice, order, ...) cannot both pick the same one"""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name), :tenant_id)"),
               {"name": name, "tenant_id": tenant_id})


def get_db():
    """
    Dependency function to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

