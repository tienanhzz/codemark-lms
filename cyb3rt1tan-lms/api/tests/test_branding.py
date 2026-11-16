"""Platform branding upload, activation, same-origin delivery, and access controls."""

import io
import random

from PIL import Image
from sqlalchemy import select
from test_access import login

from app.models import AuditEvent


def logo_bytes(size: tuple[int, int] = (1024, 1024)) -> bytes:
    image = Image.new("RGBA", size, (22, 107, 135, 255))
    if size == (1024, 1024):
        texture = Image.new("RGB", (256, 256))
        values = random.Random(7).randbytes(256 * 256 * 3)
        texture.frombytes(values)
        image.paste(texture.resize(size, Image.Resampling.NEAREST).convert("RGBA"))
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def test_admin_logo_upload_history_and_rollback(clients):
    admin, student, factory = clients
    admin_headers = login(admin)
    student_headers = login(student, "student")

    assert student.get("/v1/admin/branding/logos", headers=student_headers).status_code == 403
    assert admin.get("/v1/branding/logo").status_code == 404
    invalid = admin.post(
        "/v1/admin/branding/logos",
        headers=admin_headers | {"Content-Type": "image/png"},
        content=logo_bytes((512, 512)),
    )
    assert invalid.status_code == 422

    first = admin.post(
        "/v1/admin/branding/logos",
        headers=admin_headers | {"Content-Type": "image/png"},
        content=logo_bytes(),
    )
    assert first.status_code == 201, first.text
    active = admin.get("/v1/branding/logo")
    assert active.status_code == 200
    assert active.headers["content-type"] == "image/png"
    assert active.headers["cache-control"] == "no-store"
    with Image.open(io.BytesIO(active.content)) as image:
        assert image.size == (1024, 1024) and not image.info

    second = admin.post(
        "/v1/admin/branding/logos",
        headers=admin_headers | {"Content-Type": "image/png"},
        content=logo_bytes(),
    )
    assert second.status_code == 201
    history = admin.get("/v1/admin/branding/logos", headers=admin_headers).json()["items"]
    assert [item["version"] for item in history[:2]] == [2, 1]
    assert [item["isActive"] for item in history[:2]] == [True, False]

    restored = admin.post(
        f"/v1/admin/branding/logos/{first.json()['id']}/activation", headers=admin_headers
    )
    assert restored.status_code == 200 and restored.json()["isActive"] is True
    assert admin.get("/v1/branding/logo").content == active.content
    assert admin.get(second.json()["url"]).headers["cache-control"] == "no-store"
    with factory() as db:
        actions = list(
            db.scalars(
                select(AuditEvent.action).where(AuditEvent.action == "platform_logo_activated")
            )
        )
        assert actions.count("platform_logo_activated") == 3
