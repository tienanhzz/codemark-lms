"""Source-contract validation of actual BUILD-02 responses and database invariants."""

from datetime import timedelta

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from test_access import login
from test_contracts import DOCUMENT
from test_identity import CSV, preview

from app import mail
from app.models import Invitation, User, now


def validate(name, value):
    schema = {"$ref": "#/components/schemas/" + name, "components": DOCUMENT["components"]}
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(value)


def test_admin_and_csv_responses_validate_against_source_contract(clients, monkeypatch):
    admin, _, _ = clients
    headers = login(admin)
    own = admin.get("/v1/me").json()["id"]
    for route, schema in [
        ("/admin/users", "AdminAccountSearchResponse"),
        ("/admin/users/" + own, "AdminAccountDetail"),
        ("/admin/users/" + own + "/sessions", "AdminSessionList"),
        ("/admin/identity/status", "AdminIdentityStatus"),
        ("/admin/security/mfa-policies", "MfaRolePolicyListResponse"),
        ("/me/security/mfa", "MfaStatusResponse"),
    ]:
        response = admin.get("/v1" + route)
        assert response.status_code == 200
        validate(schema, response.json())
    job, result, request_headers = preview(admin, headers)
    validate("CsvImportPreview", result)
    monkeypatch.setattr(mail, "deliver_invitation", lambda email, token: None)
    request_headers.update(
        {
            "X-Preview-Token": result["previewToken"],
            "X-Duplicate-Policy": "upsert",
            "X-Confirm": "true",
        }
    )
    response = admin.post(
        f"/v1/admin/csv-imports/{job}/commit", headers=request_headers, content=CSV
    )
    assert response.status_code == 200
    validate("CsvImportCommit", response.json())


def test_database_rejects_multiple_pending_invites_for_same_email(clients):
    _, _, factory = clients
    with factory() as db:
        admin = db.scalar(select(User).where(User.username == "admin"))
        for index in range(2):
            db.add(
                Invitation(
                    email="same@example.test",
                    role="student",
                    created_by=admin.id,
                    token_digest=str(index) * 64,
                    expires_at=now() + timedelta(days=1),
                    delivered=False,
                )
            )
        with pytest.raises(IntegrityError):
            db.flush()
