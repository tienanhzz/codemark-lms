"""Isolated in-memory database fixtures; never connect to the local application DB."""

import base64
import os
from collections.abc import Iterator

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["APP_ENV"] = "test"
os.environ["LOGIN_HMAC_KEY"] = "test-only-key-with-at-least-32-characters"
os.environ["MFA_ENCRYPTION_KEY"] = base64.b64encode(b"t" * 32).decode()
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import database
from app.main import app
from app.models import Base, MarketplacePolicy, ShopRefundPolicy, User
from app.security import passwords

PASSWORD = "A test password for fixtures only!"


@pytest.fixture()
def clients() -> Iterator[tuple[TestClient, TestClient, sessionmaker[Session]]]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        for name, roles in [("admin", ["admin"]), ("student", ["student"])]:
            db.add(
                User(
                    username=name,
                    official_name=name.title(),
                    email=name + "@example.test",
                    roles=roles,
                    password_hash=passwords.hash(PASSWORD),
                )
            )
        db.flush()
        admin_id = db.query(User).filter_by(username="admin").one().id
        db.add(
            MarketplacePolicy(
                id="00000000-0000-4000-8000-000000000045",
                version=1,
                status="active",
                listing_fee_percent=0,
                offer_fee_percent=0,
                min_price_coin=1,
                max_price_coin=2_000_000_000,
                max_offer_coin=2_000_000_000,
                listing_expiry_hours=168,
                offer_expiry_hours=168,
                max_active_listings=100,
                max_pending_offers=100,
                updated_by=admin_id,
            )
        )
        db.add(
            ShopRefundPolicy(
                id="00000000-0000-4000-8000-000000000046",
                version=1,
                status="active",
                enabled=False,
                refund_window_hours=24,
                unused_only=True,
                updated_by=admin_id,
            )
        )

    def override() -> Iterator[Session]:
        with factory() as db:
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise

    app.dependency_overrides[database] = override
    with TestClient(app) as admin, TestClient(app) as student:
        yield admin, student, factory
    app.dependency_overrides.clear()
    engine.dispose()
