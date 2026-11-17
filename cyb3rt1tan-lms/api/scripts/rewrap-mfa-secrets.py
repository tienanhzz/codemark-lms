"""Re-encrypt MFA secrets with the configured active key after a verified backup."""

from __future__ import annotations

import argparse
import sys
import uuid

from app.database import SessionLocal, engine, settings
from app.mfa import key_settings
from app.mfa_rewrap import inspect_mfa_methods, rewrap_mfa_methods
from app.outbox import record_audit


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes; default is dry-run")
    parser.add_argument(
        "--confirm",
        help="must equal APPLY-MFA-KEY-REWRAP when --apply is set",
    )
    parser.add_argument(
        "--backup-verified",
        action="store_true",
        help="confirm a restorable database backup was verified immediately before apply",
    )
    return parser.parse_args()


def main() -> int:
    options = arguments()
    try:
        keys = key_settings()
        if settings.environment != "production":
            raise ValueError("MFA rewrap is restricted to APP_ENV=production.")
        if keys.active_id is None:
            raise ValueError("A versioned MFA keyring and active key ID are required.")
        if options.apply and (
            options.confirm != "APPLY-MFA-KEY-REWRAP" or not options.backup_verified
        ):
            raise ValueError("Apply requires the confirmation phrase and --backup-verified.")

        with SessionLocal() as db:
            if not options.apply:
                total, changed = inspect_mfa_methods(db, keys.active_id)
                print(f"Dry run complete: {total} MFA records readable; {changed} need rewrap.")
                print("No database changes were made.")
                return 0

            with db.begin():
                changed = rewrap_mfa_methods(db, keys.active_id)
                record_audit(
                    db,
                    str(uuid.uuid4()),
                    "mfa_secrets_rewrapped",
                    None,
                    {"updatedCount": changed, "activeKeyId": keys.active_id},
                )
            print(f"MFA rewrap committed: {changed} records updated and round-trip verified.")
        return 0
    except Exception as error:  # noqa: BLE001 - CLI boundary must not print secret-bearing errors.
        # Deliberately avoid printing exception details that could include environment data.
        print(f"MFA rewrap stopped: {type(error).__name__}.", file=sys.stderr)
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
