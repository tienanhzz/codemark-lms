"""Install the exact 24-row workbook catalog, preserving administrator edits."""

import json
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from .quest_models import QuestDefinition


def install_catalog(db: Session) -> int:
    rows = json.loads(Path(__file__).with_name("workbook_quests.json").read_text(encoding="utf-8"))
    inserted = 0
    for row in rows:
        if db.get(QuestDefinition, row["quest_code"]) is None:
            db.add(QuestDefinition(**row, reward_exp=0, reward_coin=0))
            inserted += 1
    db.flush()
    return inserted


if __name__ == "__main__":
    from sqlalchemy import select

    from .auth import lock_identity
    from .database import SessionLocal, settings
    from .models import User
    from .outbox import record_audit

    if (
        settings.environment == "production"
        or settings.url.host not in {"localhost", "127.0.0.1", "::1"}
        or settings.url.database != "codemark_lms"
    ):
        raise SystemExit("Quest installer only supports the local codemark_lms database.")
    with SessionLocal.begin() as db:
        lock_identity(db)
        actor = next(
            (
                user
                for user in db.scalars(
                    select(User).where(User.status == "active").order_by(User.created_at)
                )
                if "admin" in user.roles
            ),
            None,
        )
        if actor is None:
            raise SystemExit(
                "An existing active administrator is required for catalog installation."
            )
        inserted = install_catalog(db)
        record_audit(
            db,
            str(uuid.uuid4()),
            "workbook_quest_catalog_installed",
            actor.id,
            {
                "inserted": inserted,
                "source": "Danh_Sach_Nhiem_Vu_LMS.xlsx",
                "rewardPolicy": "Unspecified workbook rewards default to zero.",
            },
        )
        print(f"Installed {inserted} missing workbook quests; existing configuration preserved.")
