"""Authenticated encryption for bounded PostgreSQL custom-format backup bytes.

Keys are supplied by the caller's secret store, never embedded in an archive.
This envelope uses the maintained cryptography AES-GCM implementation.
"""

import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"CODEMARK-PGDUMP-AES256GCM-v1\x00"
MAX_BYTES = 512 * 1024 * 1024


def encrypt_backup(dump: bytes, key: bytes) -> bytes:
    if len(key) != 32 or not dump.startswith(b"PGDMP") or len(dump) > MAX_BYTES:
        raise ValueError("Invalid backup or encryption key.")
    nonce = secrets.token_bytes(12)
    return MAGIC + nonce + AESGCM(key).encrypt(nonce, dump, MAGIC)


def decrypt_backup(archive: bytes, key: bytes) -> bytes:
    if (
        len(key) != 32
        or not archive.startswith(MAGIC)
        or not len(MAGIC) + 28 < len(archive) <= MAX_BYTES + len(MAGIC) + 28
    ):
        raise ValueError("Invalid encrypted backup.")
    offset = len(MAGIC)
    dump = AESGCM(key).decrypt(archive[offset : offset + 12], archive[offset + 12 :], MAGIC)
    if not dump.startswith(b"PGDMP"):
        raise ValueError("Invalid PostgreSQL backup.")
    return dump
