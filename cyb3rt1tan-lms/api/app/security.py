"""Authentication primitives; credentials and identifiers are never logged."""

import base64
import hashlib
import os
import secrets
from datetime import UTC, datetime

from argon2 import PasswordHasher
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

passwords = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
dummy_hash = passwords.hash(secrets.token_urlsafe(32))
ROLES = {
    "student",
    "teacher",
    "teachingAssistant",
    "admin",
    "administrativeAssistant",
    "researchAssistant",
}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class ResourceReferenceCodec:
    """Context-bound authenticated references for explicitly selected resources."""

    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("AES-256-GCM requires a 32-byte key.")
        self.cipher = AESGCM(key)

    def encode(self, resource_type: str, internal_id: str, context: str) -> str:
        nonce = os.urandom(12)
        payload = nonce + self.cipher.encrypt(
            nonce, internal_id.encode(), f"v1:local:{resource_type}:{context}".encode()
        )
        return "v1.local." + base64.urlsafe_b64encode(payload).decode().rstrip("=")

    def decode(self, resource_type: str, token: str, context: str) -> str:
        if not token.startswith("v1.local."):
            raise ValueError("Invalid resource reference.")
        encoded = token.removeprefix("v1.local.")
        payload = base64.b64decode(
            encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True
        )
        if base64.urlsafe_b64encode(payload).decode().rstrip("=") != encoded:
            raise ValueError("Invalid resource reference.")
        if len(payload) < 29:
            raise ValueError("Invalid resource reference.")
        return self.cipher.decrypt(
            payload[:12], payload[12:], f"v1:local:{resource_type}:{context}".encode()
        ).decode()
