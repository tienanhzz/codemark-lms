"""Explicit worker for queued plain-text notification email delivery."""

import argparse
import time
from collections.abc import Callable
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from .database import SessionLocal
from .mail import deliver_notification
from .models import NotificationRecipient, User, now


def dispatch_once(
    batch_size: int = 50,
    *,
    session_factory: sessionmaker[Session] = SessionLocal,
    delivery: Callable[[str, str, str], None] = deliver_notification,
) -> int:
    if not 1 <= batch_size <= 100:
        raise ValueError("batch_size must be between 1 and 100")
    with session_factory.begin() as db:
        rows = list(
            db.execute(
                select(NotificationRecipient, User.email)
                .join(User, User.id == NotificationRecipient.user_id)
                .where(
                    or_(
                        NotificationRecipient.email_status == "queued",
                        NotificationRecipient.email_status == "sending",
                    ),
                    or_(
                        NotificationRecipient.email_next_attempt_at.is_(None),
                        NotificationRecipient.email_next_attempt_at <= now(),
                    ),
                )
                .order_by(NotificationRecipient.created_at, NotificationRecipient.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        )
        jobs = []
        for recipient, email in rows:
            recipient.email_status = "sending"
            recipient.email_attempts += 1
            recipient.email_next_attempt_at = now() + timedelta(minutes=2)
            jobs.append(
                (recipient.id, email, recipient.subject, recipient.body, recipient.email_attempts)
            )
    for recipient_id, email, subject, body, attempt in jobs:
        error_code = None
        try:
            delivery(email, subject, body)
        except HTTPException as exc:
            error_code = (
                str(exc.detail) if isinstance(exc.detail, str) else "notification_delivery_failed"
            )
        except (OSError, ValueError):
            error_code = "notification_delivery_failed"
        with session_factory.begin() as db:
            candidate = db.get(NotificationRecipient, recipient_id, with_for_update=True)
            if candidate is None or candidate.email_status != "sending":
                continue
            candidate.email_last_error = error_code
            if error_code is None:
                candidate.email_status = "delivered"
            elif attempt >= 5:
                candidate.email_status = "failed"
            else:
                candidate.email_status = "queued"
                candidate.email_next_attempt_at = now() + timedelta(
                    seconds=min(3600, 30 * 2 ** (attempt - 1))
                )
    return len(jobs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    while True:
        count = dispatch_once()
        if count:
            print(f"Processed {count} notification email job(s).")
        if args.once:
            break
        time.sleep(2 if count else 10)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
