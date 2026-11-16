"""Controlled one-time administrator bootstrap; no default account exists."""

import argparse
import getpass
import re
import sys
import uuid

from sqlalchemy import select, text

from .database import SessionLocal
from .models import User
from .outbox import record_audit
from .security import passwords


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["bootstrap-admin"])
    parser.parse_args()
    if not sys.stdin.isatty():
        raise SystemExit("Bootstrap requires an interactive terminal.")
    with SessionLocal.begin() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(124091071)"))
        if any("admin" in user.roles for user in db.scalars(select(User))):
            raise SystemExit("An administrator already exists. Bootstrap was not repeated.")
        username = input("Admin username: ").strip().lower()
        email = input("Institutional email: ").strip().lower()
        name = input("Official name: ").strip()
        password = getpass.getpass("Password (12–128 characters): ")
        confirmation = getpass.getpass("Confirm password: ")
        if (
            not re.fullmatch(r"[a-z0-9._-]{3,128}", username)
            or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)
            or not 1 <= len(name) <= 200
        ):
            raise SystemExit("Invalid account details.")
        if not 12 <= len(password) <= 128 or password != confirmation:
            raise SystemExit("Passwords do not match or length is invalid.")
        user = User(
            provisioning_source="bootstrap",
            username=username,
            email=email,
            official_name=name,
            roles=["admin"],
            password_hash=passwords.hash(password),
        )
        db.add(user)
        db.flush()
        record_audit(db, str(uuid.uuid4()), "admin_bootstrapped", user.id)
    print("Administrator created. Sign in at http://127.0.0.1:3100.")


if __name__ == "__main__":
    main()
