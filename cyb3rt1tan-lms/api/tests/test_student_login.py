from sqlalchemy import select
from test_access import ORIGIN, PASSWORD

from app.models import User


def test_students_authenticate_only_with_assigned_student_code(clients):
    admin, student, factory = clients
    with factory.begin() as db:
        learner = db.scalar(select(User).where(User.username == "student"))
        learner.institutional_id = "2025000001"
    for alias in ("student", "student@example.test"):
        result = student.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": alias, "password": PASSWORD}
        )
        assert result.status_code == 401
        assert result.json()["error"]["code"] == "invalid_credentials"
    result = student.post(
        "/v1/auth/login", headers=ORIGIN, json={"username": "2025000001", "password": PASSWORD}
    )
    assert result.status_code == 200
    assert student.get("/v1/me").json()["username"] == "student"
    assert (
        admin.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": "admin", "password": PASSWORD}
        ).status_code
        == 200
    )


def test_student_code_still_requires_correct_password_and_active_account(clients):
    _, student, factory = clients
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).institutional_id = "2025000001"
    assert (
        student.post(
            "/v1/auth/login",
            headers=ORIGIN,
            json={"username": "2025000001", "password": "incorrect"},
        ).status_code
        == 401
    )
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).status = "disabled"
    assert (
        student.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": "2025000001", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_unassigned_student_code_does_not_fall_back_to_username(clients):
    _, student, factory = clients
    with factory.begin() as db:
        db.scalar(select(User).where(User.username == "student")).institutional_id = None
    assert (
        student.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": "student", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_teacher_username_and_ambiguous_identifiers(clients):
    admin, student, factory = clients
    with factory.begin() as db:
        root = db.scalar(select(User).where(User.username == "admin"))
        learner = db.scalar(select(User).where(User.username == "student"))
        learner.institutional_id = "2025000001"
        db.add(
            User(
                username="teacher",
                email="teacher@example.test",
                official_name="Teacher",
                roles=["teacher"],
                password_hash=root.password_hash,
            )
        )
    assert (
        admin.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": "teacher", "password": PASSWORD}
        ).status_code
        == 200
    )
    with factory.begin() as db:
        root = db.scalar(select(User).where(User.username == "admin"))
        db.add(
            User(
                username="2025000001",
                email="numeric.staff@example.test",
                official_name="Numeric staff",
                roles=["teacher"],
                password_hash=root.password_hash,
            )
        )
    assert (
        student.post(
            "/v1/auth/login", headers=ORIGIN, json={"username": "2025000001", "password": PASSWORD}
        ).status_code
        == 401
    )
