"""Seed local-only, clearly labeled leaderboard test accounts without changing real users."""

import argparse
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path

from sqlalchemy import make_url, select, text
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app.models import EconomyLedger, User
from app.outbox import record_audit
from app.security import passwords

SOURCE = "rank-demo"
TEST_PASSWORD = "CodeMarkTest@2026!"


def seed_accounts(db: Session, actor: User) -> dict[str, int]:
    """Append demo accounts and EXP once; never reset passwords or rewrite ledger rows."""
    if actor.status != "active" or "admin" not in actor.roles:
        raise ValueError("An existing active administrator is required.")
    plan = [
        (role, index)
        for role, count in (("student", 30), ("teacher", 10))
        for index in range(1, count + 1)
    ]
    # Validate every collision before adding any accounts.
    existing: dict[str, User] = {}
    for role, index in plan:
        username = f"test.{role}{index:02d}"
        account = db.scalar(select(User).where(User.username == username))
        if role == "student":
            student_code = f"2025{index:06d}"
            owner = db.scalar(select(User).where(User.institutional_id == student_code))
            if owner is not None and (account is None or owner.id != account.id):
                raise ValueError("A demo student code is already assigned to another account.")
            if account is not None and account.institutional_id not in (None, student_code):
                raise ValueError("Refusing to replace an existing student code.")
        if account:
            if (
                account.provisioning_source != SOURCE
                or account.roles != [role]
                or account.email != username + "@example.test"
            ):
                raise ValueError(f"{username} is not a leaderboard demo account; refusing changes.")
            existing[username] = account
    created = entries = 0
    for role, index in plan:
        username = f"test.{role}{index:02d}"
        account = existing.get(username)
        if account is None:
            nickname = f"Test {role.title()} {index:02d}"
            account = User(
                username=username,
                institutional_id=f"2025{index:06d}" if role == "student" else None,
                email=username + "@example.test",
                official_name=nickname,
                nickname=nickname,
                nickname_key=nickname.casefold(),
                roles=[role],
                status="active",
                provisioning_source=SOURCE,
                password_hash=passwords.hash(TEST_PASSWORD),
            )
            db.add(account)
            db.flush()
            created += 1
        if role == "student" and account.institutional_id is None:
            account.institutional_id = f"2025{index:06d}"
        # Ties and a zero-score participant in each cohort exercise real rank behavior.
        count = 30 if role == "student" else 10
        score = 0 if index == count else (count - (index + 1) // 2) * 125
        key = f"leaderboard-demo:v1:{username}:exp"
        prior = db.scalar(select(EconomyLedger).where(EconomyLedger.idempotency_key == key))
        if prior is not None:
            if (prior.user_id, prior.currency, prior.delta, prior.source) != (
                account.id,
                "exp",
                score,
                SOURCE,
            ):
                raise ValueError("Demo ledger idempotency key conflicts with another entry.")
        elif score:
            db.add(
                EconomyLedger(
                    user_id=account.id,
                    currency="exp",
                    delta=score,
                    source=SOURCE,
                    actor_id=actor.id,
                    idempotency_key=key,
                    reason="Local leaderboard test fixture; not earned course credit.",
                    detail={"fixture": "leaderboard-demo-v1", "role": role},
                )
            )
            entries += 1
    record_audit(
        db,
        str(uuid.uuid4()),
        "leaderboard_demo_seeded",
        actor.id,
        {"created": created, "ledgerEntries": entries, "source": SOURCE},
    )
    db.flush()
    return {"created": created, "ledgerEntries": entries}


def write_credentials(path: Path) -> None:
    """Create a private local credential reference, retaining it on idempotent reruns."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    complete = False
    try:
        if os.name == "nt":
            identity_output = subprocess.run(
                ["whoami", "/user", "/fo", "csv", "/nh"], capture_output=True, check=True
            ).stdout
            # SID is ASCII even when the Windows account name uses another encoding.
            identity = re.search(rb"S-1-\d+(?:-\d+)+", identity_output)
            if identity is None:
                raise RuntimeError("Could not identify the current Windows account SID.")
            subprocess.run(
                [
                    "icacls",
                    str(path),
                    "/inheritance:r",
                    "/grant:r",
                    f"*{identity.group().decode('ascii')}:(F)",
                ],
                capture_output=True,
                check=True,
            )
        content = (
            "CodeMark LOCAL TEST accounts. Never use on a public deployment.\n"
            "Existing passwords are never reset by the seed script.\n"
            f"Initial test password: {TEST_PASSWORD}\n\n"
            + "\n".join(
                (f"2025{index:06d} (test.student{index:02d})" if role == "student" else f"test.teacher{index:02d}")
                for role, count in (("student", 30), ("teacher", 10))
                for index in range(1, count + 1)
            )
            + "\n"
        )
        os.write(descriptor, content.encode("utf-8"))
        complete = True
    finally:
        os.close(descriptor)
        if not complete:
            path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Apply to the configured local database"
    )
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit("No changes made. Pass --apply after creating a local database backup.")
    # Read the explicit environment only; do not fall back to any other application database.
    target = os.environ.get("DATABASE_URL", "")
    if not target:
        raise SystemExit("DATABASE_URL must be explicitly set in the environment.")
    url = make_url(target)
    if (
        url.database != "codemark_lms"
        or url.host not in {"127.0.0.1", "localhost"}
        or not url.drivername.startswith("postgresql")
        or os.environ.get("APP_ENV", "local") == "production"
    ):
        raise SystemExit("Refusing an unexpected database; only local codemark_lms is supported.")
    from app.database import SessionLocal

    with SessionLocal.begin() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(124091074)"))
        actor = next(
            (
                user
                for user in db.scalars(
                    select(User).where(User.status == "active").order_by(User.created_at, User.id)
                )
                if "admin" in user.roles
            ),
            None,
        )
        if actor is None:
            raise SystemExit("An existing active administrator is required.")
        result = seed_accounts(db, actor)
        write_credentials(ROOT / ".local/leaderboard-test-accounts.txt")
    print(
        f"Created {result['created']} test accounts; appended {result['ledgerEntries']} EXP entries."
    )
    print("Private credential reference: .local/leaderboard-test-accounts.txt")


if __name__ == "__main__":
    main()
