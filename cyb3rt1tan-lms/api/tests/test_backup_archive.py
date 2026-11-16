import secrets

import pytest
from cryptography.exceptions import InvalidTag

from app.backup_archive import decrypt_backup, encrypt_backup


def test_backup_round_trip_and_nonce_uniqueness():
    key = secrets.token_bytes(32)
    dump = b"PGDMP" + secrets.token_bytes(1000)
    one, two = encrypt_backup(dump, key), encrypt_backup(dump, key)
    assert one != two
    assert dump not in one
    assert decrypt_backup(one, key) == dump


def test_backup_rejects_tampering_wrong_key_and_truncation():
    key = secrets.token_bytes(32)
    archive = encrypt_backup(b"PGDMP" + secrets.token_bytes(100), key)
    with pytest.raises(InvalidTag):
        decrypt_backup(archive, secrets.token_bytes(32))
    corrupted = archive[:-1] + bytes([archive[-1] ^ 1])
    with pytest.raises(InvalidTag):
        decrypt_backup(corrupted, key)
    with pytest.raises(ValueError):
        decrypt_backup(archive[:20], key)
    with pytest.raises(ValueError):
        encrypt_backup(b"not a dump", key)
