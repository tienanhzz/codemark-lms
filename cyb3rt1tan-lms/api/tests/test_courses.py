"""Course boundaries, live permissions, archive retention and planning conflicts."""

from datetime import timedelta

from fastapi.testclient import TestClient
from test_access import PASSWORD, login
from test_identity_contracts import validate

from app.main import app
from app.models import CourseMembership, CoursePermission, User, now
from app.security import passwords


def setup_course(admin):
    headers = login(admin)
    assert (
        admin.post(
            "/v1/admin/faculties",
            headers=headers,
            json={
                "facultyId": "cs",
                "names": {"vi": "Công nghệ thông tin", "en": "Computer Science"},
            },
        ).status_code
        == 201
    )
    assert (
        admin.post(
            "/v1/admin/academic-terms",
            headers=headers,
            json={
                "termCode": "2026-1",
                "name": "Term 1",
                "startsAt": "2026-01-01T00:00:00+07:00",
                "endsAt": "2026-06-01T00:00:00+07:00",
                "timezone": "Asia/Bangkok",
            },
        ).status_code
        == 201
    )
    body = {
        "courseCode": "CS101",
        "title": "Introduction",
        "termId": "2026-1",
        "facultyId": "cs",
        "timezone": "Asia/Bangkok",
        "module": {"moduleCode": "CS1", "objectives": ["Understand fundamentals"]},
    }
    response = admin.post("/v1/courses", headers=headers, json=body)
    assert response.status_code == 201, response.text
    return headers, response.json(), body


def staff_user(factory, name="ta", role="teachingAssistant"):
    with factory.begin() as db:
        user = User(
            username=name,
            official_name=name.title(),
            email=name + "@example.test",
            roles=[role],
            password_hash=passwords.hash(PASSWORD),
        )
        db.add(user)
        db.flush()
        return user.id


def test_course_visibility_etag_lifecycle_archive_retention(clients):
    admin, student, factory = clients
    headers, course, body = setup_course(admin)
    login(student, "student")
    course_id = course["id"]
    endpoint = "/v1/courses/" + course_id
    assert student.get(endpoint).status_code == 404
    assert student.get("/v1/courses").json()["items"] == []
    assert (
        student.post(
            "/v1/courses",
            headers={**headers, "X-CSRF-Token": student.cookies["lms_csrf"]},
            json=body,
        ).status_code
        == 403
    )
    assert admin.patch(endpoint, headers=headers, json={"title": "Changed"}).status_code == 428
    assert (
        admin.patch(
            endpoint, headers={**headers, "If-Match": '"999"'}, json={"title": "Changed"}
        ).status_code
        == 409
    )
    changed = admin.patch(
        endpoint, headers={**headers, "If-Match": '"1"'}, json={"title": "Changed"}
    )
    assert changed.status_code == 200 and changed.headers["etag"] == '"2"'
    student_id = student.get("/v1/me").json()["id"]
    assert (
        admin.post(
            endpoint + "/enrollments", headers=headers, json={"userId": student_id}
        ).status_code
        == 201
    )
    assert student.get(endpoint).status_code == 404  # draft is private even for enrolled students
    assert (
        admin.post(endpoint + "/activate", headers=headers, json={"reason": "Ready"}).status_code
        == 200
    )
    assert student.get(endpoint).status_code == 200
    assert len(student.get("/v1/courses").json()["items"]) == 1
    assert student.get(endpoint + "/enrollments").status_code == 403
    assert admin.get("/v1/admin/users?courseId=" + course_id).json()["items"][0]["id"] == student_id
    assert student.get("/v1/workspace/summary").json()["metrics"]["courses"] == 1
    assert (
        admin.post(
            endpoint + "/complete", headers=headers, json={"reason": "Term ended"}
        ).status_code
        == 200
    )
    assert (
        admin.post(
            endpoint + "/archive", headers=headers, json={"reason": "Retain history"}
        ).status_code
        == 200
    )
    assert student.get(endpoint + "/lesson-plan").status_code == 200
    assert (
        admin.patch(
            endpoint, headers={**headers, "If-Match": '"5"'}, json={"title": "No"}
        ).status_code
        == 409
    )
    assert (
        admin.post(
            "/v1/admin/courses/" + course_id + "/restore",
            headers=headers,
            json={"reason": "Review"},
        ).json()["status"]
        == "completed"
    )
    with factory() as db:
        assert db.get(CourseMembership, (course_id, student_id)).status == "active"


def test_staff_grants_live_role_expiry_and_removal(clients):
    admin, _, factory = clients
    headers, course, _ = setup_course(admin)
    user_id = staff_user(factory)
    endpoint = "/v1/courses/" + course["id"]
    assert (
        admin.post(
            endpoint + "/staff",
            headers=headers,
            json={"userId": user_id, "staffRole": "teachingAssistant"},
        ).status_code
        == 201
    )
    with TestClient(app) as ta:
        ta_headers = login(ta, "ta")
        assert ta.get(endpoint + "/lesson-plan").status_code == 200
        plan = {"entries": [{"week": "1", "topic": "Intro", "position": 1}]}
        version = ta.get(endpoint).json()["revision"]
        assert (
            ta.put(
                endpoint + "/lesson-plan",
                headers={**ta_headers, "If-Match": f'"{version}"'},
                json=plan,
            ).status_code
            == 403
        )
        grant = admin.post(
            endpoint + "/permission-grants",
            headers=headers,
            json={
                "userId": user_id,
                "permissionKey": "content.author",
                "reason": "Prepare lessons",
            },
        )
        assert grant.status_code == 201
        version = ta.get(endpoint).json()["revision"]
        assert (
            ta.put(
                endpoint + "/lesson-plan",
                headers={**ta_headers, "If-Match": f'"{version}"'},
                json=plan,
            ).status_code
            == 200
        )
        with factory.begin() as db:
            db.get(CoursePermission, grant.json()["id"]).expires_at = now() - timedelta(seconds=1)
        version = ta.get(endpoint).json()["revision"]
        assert (
            ta.put(
                endpoint + "/lesson-plan",
                headers={**ta_headers, "If-Match": f'"{version}"'},
                json=plan,
            ).status_code
            == 403
        )
        assert (
            admin.request(
                "DELETE",
                endpoint + "/staff/" + user_id,
                headers=headers,
                json={"reason": "Assignment ended"},
            ).status_code
            == 204
        )
        assert ta.get(endpoint).status_code == 404
        # Re-adding a membership does not reactivate the old grant.
        assert (
            admin.post(
                endpoint + "/staff",
                headers=headers,
                json={"userId": user_id, "staffRole": "teachingAssistant"},
            ).status_code
            == 201
        )
        assert "content.author" not in ta.get(endpoint).json()["permissions"]
        with factory.begin() as db:
            db.get(User, user_id).roles = ["student"]
        assert ta.get(endpoint).status_code == 404
        assert ta.get("/v1/courses").json()["items"] == []


def test_owner_transfer_revokes_previous_owner_and_protects_new_owner(clients):
    admin, _, factory = clients
    headers, course, _ = setup_course(admin)
    first = staff_user(factory, "teacher1", "teacher")
    second = staff_user(factory, "teacher2", "teacher")
    endpoint = "/v1/courses/" + course["id"]
    for user_id in [first, second]:
        assert (
            admin.post(
                endpoint + "/staff",
                headers=headers,
                json={
                    "userId": user_id,
                    "staffRole": "teacher",
                    "ownerTransfer": True,
                    "reason": "Appoint owner",
                },
            ).status_code
            == 201
        )
    with TestClient(app) as old, TestClient(app) as new:
        login(old, "teacher1")
        new_headers = login(new, "teacher2")
        assert old.get(endpoint).status_code == 404
        assert new.get(endpoint).json()["ownerId"] == second
        assert (
            new.request(
                "DELETE",
                endpoint + "/staff/" + second,
                headers=new_headers,
                json={"reason": "Test"},
            ).status_code
            == 409
        )
    assert (
        admin.post(
            endpoint + "/staff",
            headers=headers,
            json={"userId": first, "staffRole": "teacher", "ownerTransfer": True},
        ).status_code
        == 422
    )


def test_lesson_plan_session_timezone_retention_and_ranges(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"]
    plan = {"entries": [{"week": "1", "topic": "Basics", "position": 1}]}
    saved = admin.put(endpoint + "/lesson-plan", headers={**headers, "If-Match": '"1"'}, json=plan)
    assert saved.status_code == 200
    entry = saved.json()["entries"][0]["entryId"]
    body = {
        "startsAt": "2026-02-01T09:00:00+07:00",
        "endsAt": "2026-02-01T10:00:00+07:00",
        "timezone": "Asia/Bangkok",
        "lessonPlanEntryId": entry,
        "onlineUrl": "https://meet.example.test/lesson",
    }
    assert (
        admin.post(
            endpoint + "/sessions",
            headers=headers,
            json={**body, "startsAt": "2026-02-01T09:00:00Z"},
        ).status_code
        == 422
    )
    assert (
        admin.post(
            endpoint + "/sessions",
            headers=headers,
            json={**body, "onlineUrl": "javascript:alert(1)"},
        ).status_code
        == 422
    )
    assert (
        admin.post(
            endpoint + "/sessions",
            headers=headers,
            json={**body, "startsAt": "2026-02-01T09:00:00"},
        ).status_code
        == 422
    )
    saved = admin.post(endpoint + "/sessions", headers=headers, json=body)
    assert saved.status_code == 201 and saved.json()["startsAt"] == "2026-02-01T02:00:00+00:00"
    version = admin.get(endpoint).json()["revision"]
    assert (
        admin.put(
            endpoint + "/lesson-plan",
            headers={**headers, "If-Match": f'"{version}"'},
            json={"entries": []},
        ).status_code
        == 409
    )
    assert (
        admin.put(
            endpoint + "/lesson-plan",
            headers={**headers, "If-Match": f'"{version}"'},
            json={
                "entries": [{"entryId": "not-issued", "week": "1", "topic": "No", "position": 1}]
            },
        ).status_code
        == 422
    )
    assert (
        admin.get(
            endpoint + "/sessions",
            params={"from": "2026-02-01T02:00:00Z", "to": "2026-02-01T03:00:00Z"},
        ).json()["items"][0]["id"]
        == saved.json()["id"]
    )
    assert (
        admin.get(endpoint + "/sessions", params={"to": "2026-02-01T02:00:00Z"}).json()["items"]
        == []
    )


def test_shared_rules_overrides_version_orphan_and_plain_text(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"] + "/rules"
    rule = {
        "ruleId": "attendance",
        "category": "attendance",
        "title": "Attend",
        "body": "Arrive on time.",
        "position": 0,
    }
    template = admin.post(
        "/v1/admin/course-rule-templates", headers=headers, json={"rules": [rule]}
    )
    assert template.status_code == 201
    assert (
        admin.post(
            "/v1/admin/course-rule-templates/" + template.json()["id"] + "/activate",
            headers=headers,
        ).status_code
        == 200
    )
    body = {
        "expectedTemplateVersion": 1,
        "overrides": [
            {"ruleId": "attendance", "action": "override", "title": "Join", "body": "Join on time."}
        ],
        "customRules": [],
    }
    assert admin.put(endpoint, headers={**headers, "If-Match": '"1"'}, json=body).status_code == 200
    assert admin.get(endpoint).json()["rules"][0]["body"] == "Join on time."
    version = admin.get("/v1/courses/" + course["id"]).json()["revision"]
    assert (
        admin.put(
            endpoint,
            headers={**headers, "If-Match": f'"{version}"'},
            json={**body, "expectedTemplateVersion": 2},
        ).status_code
        == 409
    )
    assert (
        admin.post(
            "/v1/admin/course-rule-templates",
            headers=headers,
            json={"rules": [{**rule, "body": '<img src="https://example.test">'}]},
        ).status_code
        == 422
    )
    other = admin.post(
        "/v1/admin/course-rule-templates",
        headers=headers,
        json={"rules": [{**rule, "ruleId": "other"}]},
    )
    assert (
        admin.post(
            "/v1/admin/course-rule-templates/" + other.json()["id"] + "/activate", headers=headers
        ).status_code
        == 409
    )


def test_catalog_retirement_preserves_history_rejects_new_assignments(clients):
    admin, student, _ = clients
    headers, course, body = setup_course(admin)
    student_headers = login(student, "student")
    assert (
        student.post(
            "/v1/admin/faculties",
            headers=student_headers,
            json={"facultyId": "bad", "names": {"en": "No"}},
        ).status_code
        == 403
    )
    assert (
        admin.patch(
            "/v1/admin/faculties/cs", headers=headers, json={"status": "retired"}
        ).status_code
        == 200
    )
    assert admin.get("/v1/admin/faculties").json()["items"] == []
    assert (
        admin.get("/v1/admin/faculties?includeRetired=true").json()["items"][0]["status"]
        == "retired"
    )
    assert (
        admin.post("/v1/courses", headers=headers, json={**body, "courseCode": "NEW"}).status_code
        == 422
    )

    assert (
        admin.patch(
            "/v1/courses/" + course["id"],
            headers={**headers, "If-Match": '"1"'},
            json={"title": "History remains"},
        ).status_code
        == 200
    )
    assert (
        admin.post(
            "/v1/admin/academic-terms",
            headers=headers,
            json={
                "termCode": "bad",
                "name": "Invalid",
                "startsAt": "2026-01-01T00:00:00Z",
                "endsAt": "2025-01-01T00:00:00Z",
                "timezone": "UTC",
            },
        ).status_code
        == 422
    )


def test_course_responses_match_source_contracts(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"]
    for name, value in [
        ("CourseDetail", course),
        ("CourseList", admin.get("/v1/courses").json()),
        ("WorkspaceSummary", admin.get("/v1/workspace/summary").json()),
        ("LessonPlanView", admin.get(endpoint + "/lesson-plan").json()),
        ("EffectiveCourseRules", admin.get(endpoint + "/rules").json()),
    ]:
        validate(name, value)
    for name, path in [
        ("FacultyView", "/v1/admin/faculties"),
        ("AcademicTermView", "/v1/admin/academic-terms"),
    ]:
        validate(name, admin.get(path).json()["items"][0])
    plan = admin.put(
        endpoint + "/lesson-plan",
        headers={**headers, "If-Match": '"1"'},
        json={"entries": [{"week": "1", "topic": "Intro", "position": 1}]},
    )
    validate("LessonPlanView", plan.json())
    template = admin.post(
        "/v1/admin/course-rule-templates",
        headers=headers,
        json={
            "rules": [
                {
                    "ruleId": "conduct",
                    "category": "classroomConduct",
                    "title": "Respect",
                    "body": "Listen to each other.",
                    "position": 0,
                }
            ]
        },
    )
    validate("CourseRuleTemplateView", template.json())
    assert (
        admin.post(
            "/v1/admin/course-rule-templates/" + template.json()["id"] + "/activate",
            headers=headers,
        ).status_code
        == 200
    )
    validate("EffectiveCourseRules", admin.get(endpoint + "/rules").json())
    session = admin.post(
        endpoint + "/sessions",
        headers=headers,
        json={
            "startsAt": "2026-02-01T09:00:00+07:00",
            "endsAt": "2026-02-01T10:00:00+07:00",
            "timezone": "Asia/Bangkok",
        },
    )
    validate("TeachingSessionView", session.json())


def test_recurring_sessions_expand_in_course_timezone_and_keep_audited_exceptions(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"]
    series = admin.post(
        endpoint + "/session-series",
        headers={**headers, "If-Match": '"1"'},
        json={
            "startsAt": "2026-02-01T09:00:00+07:00",
            "endsAt": "2026-02-01T10:00:00+07:00",
            "timezone": "Asia/Bangkok",
            "frequency": "weekly",
            "interval": 1,
            "occurrences": 4,
            "room": "A-101",
        },
    )
    assert series.status_code == 201, series.text
    created = series.json()["items"]
    assert len(created) == 4
    assert [item["recurrenceIndex"] for item in created] == [0, 1, 2, 3]
    assert len({item["recurrenceSeriesId"] for item in created}) == 1
    assert [item["startsAt"][:10] for item in created] == [
        "2026-02-01",
        "2026-02-08",
        "2026-02-15",
        "2026-02-22",
    ]
    assert series.headers["etag"] == '"2"'
    exception = admin.patch(
        endpoint + "/sessions/" + created[1]["id"],
        headers={**headers, "If-Match": series.headers["etag"]},
        json={"status": "cancelled", "reason": "Room unavailable"},
    )
    assert exception.status_code == 200, exception.text
    assert exception.json()["status"] == "cancelled"
    assert exception.json()["recurrenceSeriesId"] == series.json()["seriesId"]
    listing = admin.get(endpoint + "/sessions").json()["items"]
    assert len(listing) == 4
    assert next(item for item in listing if item["id"] == created[1]["id"])["status"] == "cancelled"
    stale = admin.patch(
        endpoint + "/sessions/" + created[1]["id"],
        headers={**headers, "If-Match": series.headers["etag"]},
        json={"room": "A-102", "reason": "Stale change"},
    )
    assert stale.status_code == 409


def test_recurring_sessions_reject_missing_revision_and_dst_gaps_atomically(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"] + "/session-series"
    body = {
        "startsAt": "2026-03-01T02:30:00-05:00",
        "endsAt": "2026-03-01T03:30:00-05:00",
        "timezone": "America/New_York",
        "frequency": "weekly",
        "occurrences": 3,
    }
    assert admin.post(endpoint, headers=headers, json=body).status_code == 428
    response = admin.post(endpoint, headers={**headers, "If-Match": '"1"'}, json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "recurrence_hits_dst_gap"
    assert admin.get("/v1/courses/" + course["id"] + "/sessions").json()["items"] == []


def test_course_resources_and_grade_scheme_versions_are_revisioned_and_bounded(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"]
    resources = admin.put(
        endpoint + "/resources",
        headers={**headers, "If-Match": '"1"'},
        json={
            "items": [
                {
                    "kind": "learningResource",
                    "title": "Reading",
                    "note": "Chapter 1",
                    "coverage": "Basics",
                    "url": "https://example.test/book",
                    "position": 0,
                },
                {
                    "kind": "usefulUrl",
                    "title": "Portal",
                    "note": "",
                    "coverage": "",
                    "url": "https://example.test",
                    "position": 1,
                },
            ]
        },
    )
    assert resources.status_code == 200, resources.text
    validate("CourseResourcesView", resources.json())
    assert [item["kind"] for item in resources.json()["items"]] == ["learningResource", "usefulUrl"]
    assert (
        admin.put(
            endpoint + "/resources", headers={**headers, "If-Match": '"1"'}, json={"items": []}
        ).status_code
        == 409
    )
    scheme = admin.post(
        endpoint + "/grade-schemes",
        headers={**headers, "If-Match": resources.headers["etag"]},
        json={
            "components": [
                {"componentId": "midterm", "name": "Midterm", "weight": 40},
                {"componentId": "final", "name": "Final", "weight": 50},
            ],
            "bands": [{"minimumScore": 0, "label": "F"}, {"minimumScore": 100, "label": "A"}],
        },
    )
    assert scheme.status_code == 201, scheme.text
    validate("GradeSchemeView", scheme.json())
    failed_publish = admin.post(
        endpoint + "/grade-schemes/" + scheme.json()["id"] + "/publish",
        headers={**headers, "If-Match": scheme.headers["etag"]},
    )
    assert failed_publish.status_code == 422
    assert failed_publish.json()["error"]["code"] == "grade_weights_must_total_100"
    valid = admin.post(
        endpoint + "/grade-schemes",
        headers={**headers, "If-Match": scheme.headers["etag"]},
        json={
            "components": [
                {"componentId": "midterm", "name": "Midterm", "weight": 40},
                {"componentId": "final", "name": "Final", "weight": 60},
            ],
            "bands": [{"minimumScore": 0, "label": "F"}, {"minimumScore": 100, "label": "A"}],
        },
    )
    assert valid.status_code == 201
    published = admin.post(
        endpoint + "/grade-schemes/" + valid.json()["id"] + "/publish",
        headers={**headers, "If-Match": valid.headers["etag"]},
    )
    assert published.status_code == 202, published.text
    validate("GradeSchemeView", published.json())
    validate("CourseGradeSchemeList", admin.get(endpoint + "/grade-schemes").json())
    assert admin.get(endpoint + "/grade-scheme").json()["version"] == 2
    assert len(admin.get(endpoint + "/grade-schemes").json()["items"]) == 2
    assert admin.get(endpoint + "/resources").json()["items"][0]["title"] == "Reading"


def test_course_rule_publications_keep_history_after_template_changes(clients):
    admin, _, _ = clients
    headers, course, _ = setup_course(admin)
    endpoint = "/v1/courses/" + course["id"]
    first = {
        "ruleId": "attendance",
        "category": "attendance",
        "title": "Attendance",
        "body": "Join the class.",
        "position": 0,
    }
    template = admin.post(
        "/v1/admin/course-rule-templates", headers=headers, json={"rules": [first]}
    )
    assert template.status_code == 201
    assert (
        admin.post(
            "/v1/admin/course-rule-templates/" + template.json()["id"] + "/activate",
            headers=headers,
        ).status_code
        == 200
    )
    version = admin.get(endpoint).json()["revision"]
    saved = admin.put(
        endpoint + "/rules",
        headers={**headers, "If-Match": f'"{version}"'},
        json={
            "expectedTemplateVersion": template.json()["version"],
            "overrides": [],
            "customRules": [],
        },
    )
    assert saved.status_code == 200 and saved.json()["publicationVersion"] == 2
    history = admin.get(endpoint + "/rules/history").json()["items"]
    assert [item["version"] for item in history] == [2, 1]
    assert history[0]["rules"][0]["body"] == "Join the class."
    assert history[1]["rules"][0]["body"] == "Join the class."


def test_archive_of_draft_does_not_publish_it_to_students(clients):
    admin, student, _ = clients
    headers, course, _ = setup_course(admin)
    login(student, "student")
    endpoint = "/v1/courses/" + course["id"]
    user_id = student.get("/v1/me").json()["id"]
    assert (
        admin.post(endpoint + "/enrollments", headers=headers, json={"userId": user_id}).status_code
        == 201
    )
    assert (
        admin.post(
            endpoint + "/archive", headers=headers, json={"reason": "Unused draft"}
        ).status_code
        == 200
    )
    assert student.get(endpoint).status_code == 404
    assert student.get("/v1/courses").json()["items"] == []
    assert student.get("/v1/workspace/summary").json()["metrics"]["courses"] == 0


def test_withdrawal_and_invited_membership_revoke_course_reads(clients):
    admin, student, _ = clients
    headers, course, _ = setup_course(admin)
    login(student, "student")
    endpoint = "/v1/courses/" + course["id"]
    user_id = student.get("/v1/me").json()["id"]
    assert (
        admin.post(
            endpoint + "/enrollments",
            headers=headers,
            json={"userId": user_id, "status": "invited"},
        ).status_code
        == 201
    )
    assert (
        admin.post(endpoint + "/activate", headers=headers, json={"reason": "Ready"}).status_code
        == 200
    )
    assert student.get(endpoint).status_code == 404
    for status in ["active", "withdrawn"]:
        assert (
            admin.patch(
                endpoint + "/enrollments/" + user_id,
                headers=headers,
                json={"status": status, "reason": "Roster correction"},
            ).status_code
            == 200
        )
        assert student.get(endpoint + "/rules").status_code == (200 if status == "active" else 404)
    assert student.get("/v1/courses").json()["items"] == []


def test_permission_revocation_future_grants_and_cross_course_denial(clients):
    admin, _, factory = clients
    headers, course, body = setup_course(admin)
    user_id = staff_user(factory)
    endpoint = "/v1/courses/" + course["id"]
    assert (
        admin.post(
            endpoint + "/staff",
            headers=headers,
            json={"userId": user_id, "staffRole": "teachingAssistant"},
        ).status_code
        == 201
    )
    other = admin.post("/v1/courses", headers=headers, json={**body, "courseCode": "OTHER"}).json()
    with TestClient(app) as ta:
        ta_headers = login(ta, "ta")
        assert ta.get("/v1/courses/" + other["id"]).status_code == 404
        assert (
            ta.post(
                endpoint + "/permission-grants",
                headers=ta_headers,
                json={
                    "userId": user_id,
                    "permissionKey": "content.author",
                    "reason": "No escalation",
                },
            ).status_code
            == 403
        )
        assert (
            admin.post(
                endpoint + "/permission-grants",
                headers=headers,
                json={"userId": user_id, "permissionKey": "platform.manage", "reason": "Invalid"},
            ).status_code
            == 422
        )
        grant = admin.post(
            endpoint + "/permission-grants",
            headers=headers,
            json={
                "userId": user_id,
                "permissionKey": "content.author",
                "reason": "Later",
                "startsAt": (now() + timedelta(days=1)).isoformat(),
            },
        )
        assert grant.status_code == 201
        assert "content.author" not in ta.get(endpoint).json()["permissions"]
        live = admin.post(
            endpoint + "/permission-grants",
            headers=headers,
            json={"userId": user_id, "permissionKey": "content.author", "reason": "Now"},
        )
        assert live.status_code == 201
        assert "content.author" in ta.get(endpoint).json()["permissions"]
        assert (
            admin.request(
                "DELETE",
                endpoint + "/permission-grants/" + live.json()["id"],
                headers=headers,
                json={"reason": "Revoked"},
            ).status_code
            == 204
        )
        assert "content.author" not in ta.get(endpoint).json()["permissions"]
