"""Explicit, local-only canonical catalog install; never creates or changes accounts."""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import make_url, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        raise SystemExit("No changes made. Use --apply for the local installation.")
    load_dotenv(ROOT / ".env")
    url = make_url(os.environ.get("DATABASE_URL", ""))
    if (
        url.database != "codemark_lms"
        or url.host not in {"127.0.0.1", "localhost"}
        or not url.drivername.startswith("postgresql")
        or os.environ.get("APP_ENV") == "production"
    ):
        raise SystemExit("Refusing an unexpected database; only local codemark_lms is supported.")
    from app.database import SessionLocal
    from app.models import User
    from app.taxonomy_starter import install_starter

    with SessionLocal.begin() as db:
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
            raise SystemExit("An existing active administrator is required.")
        result = install_starter(db, actor)
        print(result)


if __name__ == "__main__":
    main()
