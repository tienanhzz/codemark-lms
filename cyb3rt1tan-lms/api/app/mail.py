"""Approved self-hosted STARTTLS SMTP only; no provider API or silent fallback."""

import os
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

from fastapi import HTTPException


def configured() -> bool:
    return os.environ.get("SMTP_APPROVED") == "true" and bool(
        os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM")
    )


def deliver_invitation(recipient: str, token: str) -> None:
    deliver(
        recipient,
        token,
        "Your CodeMark account invitation",
        "/accept-invitation",
        "Create your institutional account using this one-time link:",
        "If you did not expect this invitation, contact your administrator.",
    )


def deliver_password_reset(recipient: str, token: str) -> None:
    deliver(
        recipient,
        token,
        "Reset your CodeMark password",
        "/reset-password",
        "Reset your password using this one-time link. It expires in 30 minutes:",
        "If you did not request this, ignore this message. Your password has not changed.",
    )


def deliver_notification(recipient: str, subject: str, body: str) -> None:
    """Deliver plain-text notice content through the approved STARTTLS relay."""
    if not configured():
        raise HTTPException(503, "smtp_not_configured")
    try:
        context = ssl.create_default_context(cafile=os.environ.get("SMTP_CA_FILE") or None)
        message = EmailMessage()
        message["From"] = os.environ["SMTP_FROM"]
        message["To"] = recipient
        message["Subject"] = subject.replace("\r", " ").replace("\n", " ")
        message.set_content(body)
        with smtplib.SMTP(
            os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=10
        ) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if os.environ.get("SMTP_USERNAME"):
                server.login(os.environ["SMTP_USERNAME"], os.environ.get("SMTP_PASSWORD", ""))
            server.send_message(message)
    except (OSError, smtplib.SMTPException, ValueError):
        raise HTTPException(503, "notification_delivery_failed") from None


def deliver(
    recipient: str, token: str, subject: str, path: str, introduction: str, footer: str
) -> None:
    if not configured():
        raise HTTPException(503, "smtp_not_configured")
    try:
        context = ssl.create_default_context(cafile=os.environ.get("SMTP_CA_FILE") or None)
        message = EmailMessage()
        message["From"] = os.environ["SMTP_FROM"]
        message["To"] = recipient
        message["Subject"] = subject
        origin = os.environ.get("APP_ORIGIN", "http://127.0.0.1:3100")
        message.set_content(
            introduction
            + "\n\n"
            + origin
            + path
            + "#token="
            + quote(token, safe="")
            + "\n\n"
            + footer
        )
        with smtplib.SMTP(
            os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=10
        ) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if os.environ.get("SMTP_USERNAME"):
                server.login(os.environ["SMTP_USERNAME"], os.environ.get("SMTP_PASSWORD", ""))
            server.send_message(message)
    except (OSError, smtplib.SMTPException, ValueError):
        raise HTTPException(503, "invitation_delivery_failed") from None
