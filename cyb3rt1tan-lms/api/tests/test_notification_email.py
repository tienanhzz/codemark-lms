"""Notification SMTP worker, local STARTTLS transport, and bounded retry tests."""

import ipaddress
import socketserver
import ssl
import threading
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.mail import deliver_notification
from app.models import Notification, NotificationRecipient, User, now
from app.notification_cli import dispatch_once


class _SMTPHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        self.wfile.write(b"220 local test relay\r\n")
        self.wfile.flush()
        while raw := self.rfile.readline():
            command = raw.decode("ascii", errors="replace").strip()
            verb = command.split(" ", 1)[0].upper()
            if verb in {"EHLO", "HELO"}:
                self.wfile.write(b"250-local test relay\r\n250-STARTTLS\r\n250 SIZE 1000000\r\n")
            elif verb == "STARTTLS":
                self.wfile.write(b"220 begin TLS\r\n")
                self.wfile.flush()
                self.rfile.close()
                self.wfile.close()
                self.connection = self.server.tls_context.wrap_socket(  # type: ignore[attr-defined]
                    self.connection, server_side=True
                )
                self.server.tls_established = True  # type: ignore[attr-defined]
                self.rfile = self.connection.makefile("rb")
                self.wfile = self.connection.makefile("wb")
                continue
            elif verb in {"MAIL", "RCPT"}:
                self.wfile.write(b"250 accepted\r\n")
            elif verb == "DATA":
                self.wfile.write(b"354 end with dot\r\n")
                self.wfile.flush()
                message = bytearray()
                while line := self.rfile.readline():
                    if line in {b".\r\n", b".\n"}:
                        break
                    message.extend(line)
                self.server.messages.append(bytes(message))  # type: ignore[attr-defined]
                self.wfile.write(b"250 queued locally\r\n")
            elif verb == "RSET":
                self.wfile.write(b"250 reset\r\n")
            elif verb == "NOOP":
                self.wfile.write(b"250 ok\r\n")
            elif verb == "QUIT":
                self.wfile.write(b"221 closing\r\n")
                self.wfile.flush()
                return
            else:
                self.wfile.write(b"500 unsupported command\r\n")
            self.wfile.flush()


class _SMTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, tls_context: ssl.SSLContext) -> None:
        self.tls_context = tls_context
        self.tls_established = False
        self.messages: list[bytes] = []
        super().__init__(("127.0.0.1", 0), _SMTPHandler)


def _local_relay_certificate(directory: Path) -> tuple[Path, Path]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "127.0.0.1")])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(UTC) - timedelta(minutes=1))
        .not_valid_after(datetime.now(UTC) + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    certificate_path = directory / "local-smtp-ca.pem"
    key_path = directory / "local-smtp-key.pem"
    certificate_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    return certificate_path, key_path


def test_notification_mail_uses_verified_starttls_to_local_only_relay(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ca_path, key_path = _local_relay_certificate(tmp_path)
    tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls_context.load_cert_chain(str(ca_path), str(key_path))
    relay = _SMTPServer(tls_context)
    thread = threading.Thread(target=relay.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("SMTP_APPROVED", "true")
    monkeypatch.setenv("SMTP_HOST", "127.0.0.1")
    monkeypatch.setenv("SMTP_PORT", str(relay.server_address[1]))
    monkeypatch.setenv("SMTP_FROM", "notices@codemark.invalid")
    monkeypatch.setenv("SMTP_CA_FILE", str(ca_path))
    monkeypatch.delenv("SMTP_USERNAME", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    try:
        deliver_notification(
            "student@codemark.invalid", "Room changed", "Review the updated room assignment."
        )
    finally:
        relay.shutdown()
        relay.server_close()
        thread.join(timeout=2)

    assert relay.tls_established is True
    assert len(relay.messages) == 1
    message = relay.messages[0].decode("utf-8")
    assert "To: student@codemark.invalid" in message
    assert "Subject: Room changed" in message
    assert "Review the updated room assignment." in message


def _queued_email(factory: sessionmaker[Session]) -> str:
    with factory.begin() as db:
        admin = db.scalar(select(User).where(User.username == "admin"))
        student = db.scalar(select(User).where(User.username == "student"))
        assert admin is not None and student is not None
        notice = Notification(
            id=str(uuid.uuid4()),
            event_key="course.schedule_changed",
            template_id="schedule-update",
            severity="ordinary",
            mandatory=False,
            require_acknowledgement=False,
            channels=["inApp", "email"],
            audience_scope="system",
            course_id=None,
            sender_id=admin.id,
            idempotency_key="smtp-worker-test-" + str(uuid.uuid4()),
            request_digest="a" * 64,
            created_at=now(),
        )
        db.add(notice)
        db.flush()
        recipient = NotificationRecipient(
            notification_id=notice.id,
            user_id=student.id,
            template_version=1,
            locale="en",
            subject="Schedule update",
            body="The class time changed.",
            email_status="queued",
            created_at=now(),
        )
        db.add(recipient)
        db.flush()
        return recipient.id


def test_notification_worker_persists_delivery_and_bounded_retry(clients) -> None:
    _admin, _student, factory = clients
    recipient_id = _queued_email(factory)
    failures: list[tuple[str, str, str]] = []

    def fail_delivery(address: str, subject: str, body: str) -> None:
        failures.append((address, subject, body))
        raise HTTPException(503, "notification_delivery_failed")

    for attempt in range(1, 6):
        assert dispatch_once(session_factory=factory, delivery=fail_delivery) == 1
        with factory.begin() as db:
            recipient = db.get(NotificationRecipient, recipient_id)
            assert recipient is not None
            assert recipient.email_attempts == attempt
            if attempt < 5:
                assert recipient.email_status == "queued"
                recipient.email_next_attempt_at = now() - timedelta(seconds=1)
            else:
                assert recipient.email_status == "failed"
                assert recipient.email_last_error == "notification_delivery_failed"
    assert len(failures) == 5

    delivered_id = _queued_email(factory)
    delivered: list[tuple[str, str, str]] = []
    assert (
        dispatch_once(
            session_factory=factory,
            delivery=lambda address, subject, body: delivered.append((address, subject, body)),
        )
        == 1
    )
    with factory() as db:
        recipient = db.get(NotificationRecipient, delivered_id)
        assert recipient is not None
        assert recipient.email_status == "delivered"
        assert recipient.email_attempts == 1
        assert recipient.email_last_error is None
    assert delivered == [("student@example.test", "Schedule update", "The class time changed.")]


def test_notification_worker_batch_limit_is_bounded() -> None:
    with pytest.raises(ValueError, match="batch_size"):
        dispatch_once(batch_size=101)
