# Workbook mission catalog

`app/workbook_quests.json` preserves all seven columns and 24 rows from
`Danh_Sach_Nhiem_Vu_LMS.xlsx`, sheet4. STUDENT maps to `student`; LECTURER maps
to `teacher`. No reward amounts were supplied: EXP and Coin start at zero and
authorized catalog managers may configure them. Existing `/me/missions` routes,
trusted event receipts, and idempotent legacy claims remain compatible.

After local backup and Alembic upgrade, run `python -m app.quest_catalog` from
`api`. The installer only accepts localhost `codemark_lms`, requires an existing
active administrator, takes the shared identity lock, audits installation, and
inserts missing definitions without replacing custom edits or progress.

The new API is `/v1/quests`: `GET /me`, `GET /manage`, `PATCH /manage/{code}`,
`POST /check-in`, `GET/POST /evidence`, `POST /evidence/{id}/review`,
`GET /resources`, `POST /resources/{resourceId}/views`, and
`POST /resource-views/{viewId}/finish`. Teachers manage student definitions;
administrators manage both catalogs. Personal lists remain role scoped.

Trusted code calls `record_quest_event(db, user, event_key, source_id, metadata)`
inside its authenticated domain transaction. There is no client completion
endpoint. Source receipts are permanent across resets. Daily/weekly cycles use
Asia/Ho_Chi_Minh and ISO weeks. Lecturer resource/poll caps are course scoped.
Early submission and fast grading share the base task's entity slot, replace
the lower tier, and pay only any positive configured reward difference.

Current producers: explicit daily confirmation, authenticated server-timed
document reading, assessment submissions, immutable released grades, new course
learning-resource URLs, moderated community questions/replies, selected best
answers, and approved lecturer discussion topics. A resource URL retains stable
identity across title/list edits. Verified rereads and capped contributions
remain learning activity without issuing duplicate rewards. Seven-day streaks
require login AND learning activity on each of seven consecutive dates.

Quiz-specific workflows, peer review, project checkpoints, chapter completion,
advanced-material classification, major-lab discipline, and satisfaction surveys
have no authoritative entity in the current LMS. Their actions open the labeled
evidence workflow. Original HTTPS evidence, an entity reference, and a description
are required. Teachers may review student evidence only with grading authority
in its linked course; administrators review lecturer or unlinked evidence.
Self-review is forbidden. Verified facts must satisfy executable thresholds.
Canonical entity identity prevents another reward via a new evidence request.

Rating approval additionally reads the actual course and academic term: the
course must be completed (or archived from completed), and its term must have
ended. Submitted flags cannot override these facts. Requests, evidence links,
reviewer identities, explanations, decisions, and verified facts are audited.
Pending/rejected requests and explanations remain visible to their requester.

`tests/test_workbook_quests.py` includes a source digest covering every workbook
cell and authorization, timing, anti-spam, duplicate, upgrade, streak, and review
regressions. UI tests cover table/navigation/status, role separation, catalog
editing, and explicit attendance confirmation. Student code is never executed.
