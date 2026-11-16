"""BUILD-031 PostgreSQL stress check for duplicate concurrent Clan result submissions."""

import os
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import func, select
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
load_dotenv(root / ".env")
target = os.environ["TEST_DATABASE_URL"]
if (
    make_url(target).database != "codemark_lms_test"
    or target == os.environ["DATABASE_URL"]
):
    raise SystemExit(
        "Clan concurrency verification is restricted to codemark_lms_test."
    )
os.environ.update({"DATABASE_URL": target, "MIGRATION_DATABASE_URL": target})
sys.path.insert(0, str(root / "api"))

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import SessionLocal, engine
from app.main import app
from app.models import (
    Clan,
    ClanCompetitionAward,
    ClanExpLedger,
    ClanMembership,
    ClanWar,
    EconomyLedger,
    InventoryItem,
    ShopItem,
    User,
    now,
)
from app.security import passwords

with engine.connect() as connection:
    assert connection.scalar(text("SELECT version_num FROM alembic_version"))
with SessionLocal() as db:
    admin = db.scalar(select(User).where(User.username == "qa.admin"))
    assert admin is not None
    admin_id = admin.id

war_id = str(uuid.uuid4())
item_id = str(uuid.uuid4())
clan_a_id, clan_b_id = str(uuid.uuid4()), str(uuid.uuid4())
suffix = uuid.uuid4().hex[:10]
student_id = str(uuid.uuid4())
with SessionLocal.begin() as db:
    db.add(
        User(
            id=student_id,
            username=f"stress-{suffix}",
            email=f"stress-{suffix}@example.invalid",
            official_name="Concurrency Test Participant",
            roles=["student"],
            status="active",
            password_hash=passwords.hash("Local concurrency test only!"),
        )
    )
    db.flush()
    db.add(
        ShopItem(
            id=item_id,
            item_key=f"clan-stress-{suffix}",
            name="Clan stress prize",
            price_coin=0,
            stock=2,
            purchase_limit=1,
            eligible_roles=[],
            effect_type="cosmetic",
            effect_config={},
            tradeable=False,
            status="active",
            author_id=admin_id,
        )
    )
    db.flush()
    db.add_all(
        [
            Clan(
                id=clan_a_id,
                name=f"Stress A {suffix}",
                name_key=f"stress-a-{suffix}",
                owner_id=student_id,
            ),
            Clan(
                id=clan_b_id,
                name=f"Stress B {suffix}",
                name_key=f"stress-b-{suffix}",
                owner_id=admin_id,
            ),
            ClanMembership(
                clan_id=clan_a_id, user_id=student_id, status="active", role_key="owner"
            ),
            ClanWar(
                id=war_id,
                title=f"Concurrency verification {suffix}",
                clan_a_id=clan_a_id,
                clan_b_id=clan_b_id,
                starts_at=now() - timedelta(minutes=1),
                competition_type="code",
                status="scheduled",
                exp_reward=25,
                reward_exp=7,
                reward_coin=3,
                reward_item_id=item_id,
                reward_item_quantity=1,
                created_by_id=admin_id,
            ),
        ]
    )

with TestClient(app) as login_client:
    response = login_client.post(
        "/v1/auth/login",
        headers={"Origin": "http://127.0.0.1:3100"},
        json={"username": "qa.admin", "password": "Build01-test-workspace-only!"},
    )
    assert response.status_code == 200, response.text
    session_cookie = login_client.cookies["lms_session"]
    csrf = login_client.cookies["lms_csrf"]

barrier = threading.Barrier(2)


def submit_result() -> tuple[int, int]:
    with TestClient(app) as client:
        client.cookies.set("lms_session", session_cookie)
        client.cookies.set("lms_csrf", csrf)
        barrier.wait(timeout=10)
        response = client.post(
            f"/v1/admin/clan-wars/{war_id}/results",
            headers={"Origin": "http://127.0.0.1:3100", "X-CSRF-Token": csrf},
            json={"outcome": "clan_a", "participantIds": [student_id]},
        )
        return response.status_code, response.json().get("participantsAwarded", -1)


with ThreadPoolExecutor(max_workers=2) as pool:
    futures = [pool.submit(submit_result) for _ in range(2)]
    responses = [future.result(timeout=30) for future in futures]
assert responses == [(200, 1), (200, 1)] or sorted(responses) == [(200, 1), (200, 1)]

with SessionLocal() as db:
    assert (
        db.scalar(
            select(func.count(ClanCompetitionAward.id)).where(
                ClanCompetitionAward.war_id == war_id
            )
        )
        == 1
    )
    assert (
        db.scalar(
            select(func.count(ClanExpLedger.id)).where(
                ClanExpLedger.idempotency_key == f"clan-war:{war_id}:winner"
            )
        )
        == 1
    )
    assert (
        db.scalar(
            select(func.count(EconomyLedger.id)).where(
                EconomyLedger.idempotency_key
                == f"clan-war:{war_id}:participant:{student_id}:exp",
                EconomyLedger.currency == "exp",
            )
        )
        == 1
    )
    assert (
        db.scalar(
            select(func.count(EconomyLedger.id)).where(
                EconomyLedger.idempotency_key
                == f"clan-war:{war_id}:participant:{student_id}:coin"
            )
        )
        == 1
    )
    assert (
        db.scalar(
            select(func.count(InventoryItem.id)).where(
                InventoryItem.purchase_id
                == str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"clan-competition:{war_id}:{student_id}",
                    )
                )
            )
        )
        == 1
    )
    item = db.get(ShopItem, item_id)
    assert item is not None and item.stock == 1

print(
    "PASS: two concurrent identical finalizations returned 200 and produced one EXP, Coin, item, and Clan reward set."
)
print(
    "Only disposable codemark_lms_test received new fixture rows; no existing records were edited or deleted."
)
