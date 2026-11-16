# Core API Contracts

## Local persistence foundation — BUILD-025

`GET /v1/admin/operations/persistence` is an authenticated Admin-only, read-only, no-store diagnostic projection. It returns database mode/migration heads, bounded pool configuration, pending/dispatched/exhausted outbox counts and oldest-pending age. It does not return database URLs, credentials, event payloads/IDs, idempotency keys, account data or Redis consumer identities. Its DTO is defined in OpenAPI as `PersistenceStatus`.

Implemented local mutations record business changes, immutable audit and minimal outbox metadata atomically. Outbox metadata currently contains only event/request UUIDs and action; audit reasons/PII/private content stay out. Concurrent retries of one persisted event use a unique idempotency key and payload fingerprint. The dispatcher remains disabled; no Redis/client delivery or learner-code execution is implied. Current schema head is `0005_outbox_foundation`; historical audit is not backfilled/re-emitted.

- Status: Product contract with initial runtime implementations for authentication, Admin account/CSV provisioning, course lifecycle/staff/enrollment/permissions, academic catalogs, course planning, versioned Course Rules, taxonomy administration, and the initial question-bank lifecycle. Assignments and most learning-domain APIs remain contract-only; see [`../../BUILDING_PROCESS.md`](../../BUILDING_PROCESS.md) for verified scope.
- Product source: [`../../PRODUCT_REQUIREMENTS.md`](../../PRODUCT_REQUIREMENTS.md).
- Persistence source: [`data-model.md`](./data-model.md).
- Machine-readable route/schema source: [`openapi.yaml`](./openapi.yaml), OpenAPI 3.1.0.
- The prose below specifies authorization and domain invariants that complement OpenAPI. Errors use a consistent envelope with `code`, safe `message`, optional field errors, and a request/correlation ID.

## Shared rules

- The authenticated principal is resolved by the server; clients cannot submit a trusted role, permission set, grade, balance, score, runtime image, hidden test, or policy decision.
- Requests are authorized before entity existence is disclosed where practical. Unauthenticated requests receive `401`; authenticated but unauthorized requests receive `403` or a non-disclosing `404` according to resource policy.
- Mutations require an idempotency key where retry can create duplicate effects. All timestamps are RFC 3339 UTC instants; timezone IDs are explicit for schedule rules.
- Use optimistic concurrency (`ETag`/`If-Match` or a version token) for mutable drafts and autosaves. Published question/assessment versions are immutable. Never mutate a published snapshot in place.
- Student projections are allowlisted response models. They exclude answer keys, reference solutions, hidden tests, private rubric notes, private course notes, other students' work, and unauthorized identity data.
- Mutating actions record actor, entity, before/after or version references, reason where required, timestamp, and correlation ID in the audit trail.
- Public resource IDs are random, non-sequential identifiers; sequential database keys must never appear in routes or client responses. Possession of a public or encrypted reference does not grant authorization. See `../../SECURITY_STANDARDS.md` for dependency, runtime network, and reference-codec rules.

## Authorization and course permission grants

The policy document is `access-policy.schema.json`. `globalRolePermissions` grants unscoped system capabilities; `courseRoleDefaults` defines course-scoped defaults for Teacher and TA memberships; entries in `coursePermissionKeys` are grantable only through a valid course-scoped grant. Role names are fixed system roles; holding multiple roles does not merge scope or bypass resource-specific checks. Authorization is default-deny and evaluated by Core for every request.

Policy order:

1. Global safety/privacy constraints and explicit denial rules always apply.
2. A global role supplies only its listed unscoped capabilities; `admin` does not bypass audit, retention, or privacy constraints.
3. An active Teacher/TA course membership receives its configured course-role defaults; course ownership grants the Teacher's documented owner capabilities.
4. An active, unexpired course grant may add only a key in `coursePermissionKeys`. A course grant is not a global role and cannot be delegated by a TA unless policy explicitly permits it.
5. Student access is limited to the student's active membership and own submissions/grades, except published course material and explicitly public boards.
6. If no rule authorizes the operation, deny it. Do not infer access from UI visibility or possession of an identifier.

Administrative Assistants have no submission/grade access by default. Research Assistants receive only approved anonymized datasets. TAs require explicit course permission for grading, assessment management, export, and exam monitoring. Permission grants have an actor, reason, start time, and optional expiry/revocation.

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/access/policy` | Admin reads the active policy/version. |
| `POST /v1/access/policies` | Admin creates a draft policy; activating it is a separate audited operation with validation and effective time. Active policies are immutable. |
| `GET /v1/courses/{courseId}/permission-grants` | Owner or authorized Admin lists grants, with pagination. |
| `POST /v1/courses/{courseId}/permission-grants` | Owner/Admin grants an allowlisted permission to an active course staff member; requires reason and optional expiry. |
| `DELETE /v1/courses/{courseId}/permission-grants/{grantId}` | Owner/Admin revokes a grant; records actor/reason and takes effect immediately. |
| `POST /v1/courses/{courseId}/staff` with `ownerTransfer=true` | Owner/Admin transfers ownership to an active Teacher; the target is made a course Teacher, a nonblank reason is required, and the previous owner is not implicitly retained as staff. |
| `DELETE /v1/courses/{courseId}/staff/{userId}` | Owner/Admin ends an active staff membership and immediately revokes its course permission grants; requires a reason. The current owner must be transferred first. |
| `POST /v1/courses/{courseId}/permission-decisions` | Internal Core operation only; must not be exposed as a general public permission-probing endpoint. |

## Learning taxonomy

Learning-content categories and tags are stored in `content_categories` and `content_tags` and read from `/v1/taxonomy`. Question categories and tags are stored separately in `question_categories` and `question_tags`, linked to immutable question versions, and read from `/v1/question-taxonomy`. Question taxonomy usage counts are Admin-only. Taxonomy hierarchy is navigation only and does not imply inherited filtering. Admin changes are audited; question taxonomy initialization is available through the local development seeder.

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/taxonomy` | Any authenticated user reads active categories, tags, catalog version, and merge redirects. `includeRetired=true` is Admin-only. |
| `POST /v1/admin/taxonomy/seed` | Admin may import the initial categories and tags once into an empty version-1 catalog using an expected `catalogVersion`; parent links/cycles are validated and nodes, applicability, revision, version, and audit event are committed atomically. |
| `POST /v1/admin/taxonomy/categories` and `POST /v1/admin/taxonomy/tags` | Admin creates a category or tag with stable ID, localized names, optional active parent, and sort order; tags also declare applicability and whether they are selectable. |
| `PATCH /v1/admin/taxonomy/categories/{categoryId}` and `PATCH /v1/admin/taxonomy/tags/{tagId}` | Admin renames, reorders, reparents, changes tag applicability/selectability, or retires/reactivates a node. IDs are immutable and writes are audited/versioned. |
| `POST /v1/admin/taxonomy/categories/{categoryId}/merge` and `POST /v1/admin/taxonomy/tags/{tagId}/merge` | Admin retires a source and records its redirect to a different active node of the same taxonomy type. A source with active children cannot be merged. |
| `POST /v1/admin/question-taxonomy/categories` and `POST /v1/admin/question-taxonomy/tags` | Same-origin Admin creates a question-only category or tag with a stable ID, localized names, optional active parent, and sort order; tags also declare selectability. Writes advance the shared catalog version and create audit/revision records. |
| `PATCH /v1/admin/question-taxonomy/categories/{categoryId}` and `PATCH /v1/admin/question-taxonomy/tags/{tagId}` | Same-origin Admin renames, reorders, reparents, activates, or retires a question-only node; tag selectability can also be changed. Cycles, inactive parents, and retiring a node with active children are rejected. IDs are immutable and writes are audited/versioned. |

The starter data contract provides six categories and 67 tags. A one-time Admin seed endpoint can load that starter catalog into a new empty catalog; subsequent imports and stale catalog versions are rejected.

## Question bank and version lifecycle

`question-version.schema.json` describes the version envelope and links public `content` to `question-content.schema.json` v1.0 and private `authoringConfig` to `question-authoring-config.schema.json` v1.0. The `configType` discriminator must match `questionType`. Answer keys, rubric criteria, code harness/test configuration, and private Reading/Listening keys are rejected unless they validate against the strict private schema. Deployments must reject unknown or inactive schema versions. The OpenAPI specification includes separate validate and publish endpoints.

Private authoring validation also checks relationships JSON Schema cannot express: choice IDs must refer to public choices; blank IDs must match; matching pairs must cover valid left/right IDs without duplicates; ordering IDs must be a permutation of prompt items; set child IDs and types must match existing published child versions; code test IDs/positions and rubric criterion IDs/positions must be unique; and code-test/rubric points must sum to their configured maximum. Reference solution and private tests remain private even for student-visible examples.

Question difficulty has five ordered values: `newbie` (Level 1: Newbie), `noob` (Level 2: Noob), `wannabe` (Level 3: Wannabe), `gatekeeper` (Level 4: Gatekeeper), and `legendary` (Level 5: Legendary).

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/courses/{courseId}/questions` | Course-authorized users search by category, tags (`any`/`all`), difficulty, type, and text. Staff can see the latest version per question; Students see only published versions. |
| `POST /v1/courses/{courseId}/questions` | Create a Draft aggregate and initial Draft version; validates active category/tag applicability and course scope. |
| `POST /v1/questions/{questionId}/versions` | Create a new Draft version from an existing version or supplied content. Never modifies published versions. |
| `GET /v1/questions/{questionId}/versions/{versionId}` | Return an authoring projection only to authorized staff; Students may read only published versions in an active course and receive a projection without private config. |
| `POST /v1/questions/{questionId}/versions/{versionId}/validate` | Validate bundled strict schemas, taxonomy references, and supported type-specific relationships. Returns `valid` and errors with HTTP 200; it does not publish or execute code. |
| `POST /v1/questions/{questionId}/versions/{versionId}/publish` | Immediately publish eligible valid versions; invalid data returns 422. Code publication returns 409 because LMS execution of student code is disabled; trusted local author-validation is not an LMS validation service. Listening returns 409 until protected asset validation/storage is implemented. Successful publication is audited and immutable. |
| `GET /v1/practice/questions` | Students see published, auto-checkable practice questions only from active course memberships; responses contain no private scoring config. Category, tags, cursor, and page-size filters are bounded. |
| `POST /v1/practice/attempts` | Check and persist an answer for an eligible practice question; only the student's own active course membership is accepted. |
| `GET /v1/practice/attempts` | Read a bounded history of the caller's own saved practice attempts in courses where membership remains active. |

The initial runtime implements course-scoped Draft creation/versioning, authorized search, bundled JSON Schema validation for all declared question types, relationship validation, audit-backed publication for eligible non-Code/non-Listening versions, and safe Student projections of published course questions. Search supports category, multi-tag (`any`/`all`), five-level difficulty, type, and text filters. Standalone practice supports published objective question types with persisted attempts and server-side scoring; Writing and code questions remain excluded because manual grading and code execution are separate flows. Code and Listening publication are intentionally gated as described above; runtime profiles, the isolated runner, protected question-asset storage, and taxonomy management remain future work.

## Assessment, submissions, and grading

`assessment-version.schema.json` is the frozen configuration envelope; `versionStatus` is distinct from the current assessment lifecycle state. Draft versions can be edited by creating replacement drafts. Publication snapshots the exact ordered question versions and recipients in one transaction. Random selection must be resolved at publication, persisted, and reproducible from its audit record; later bank edits do not change delivery.

Routes:

| Method and path | Contract |
|---|---|
| `POST /v1/courses/{courseId}/assessments` | Create a Draft exam or assignment assessment and version; validate course scope and assessment type. |
| `POST /v1/assessments/{assessmentId}/versions` | Create an editable Draft revision; published deliveries remain pinned to prior versions. |
| `POST /v1/assessments/{assessmentId}/publish` | Atomically validate schedule, recipients, points, permissions, question versions, and selection resolution; exam types require published `exam` questions, while `assignment` requires published `practical` questions. Freeze the version and create delivery snapshots. |
| `POST /v1/assessment-attempts/{attemptId}/start` | Verify recipient, schedule, attempt allowance, and required exam acknowledgement; return the exact safe question projection plus the student's saved answers/revision when resuming. |
| `PUT /v1/assessment-attempts/{attemptId}/answers/{questionVersionId}` | Idempotent autosave with revision/ETag conflict detection; accept only questions assigned to this attempt. |
| `POST /v1/assessment-attempts/{attemptId}/submit` | Finalize the last saved answer state; enforce server time and submission policy. When `autoSubmitOnExpiry` is true, the first authenticated attempt request at/after the deadline atomically marks the attempt `forceSubmitted` at its deadline, updates the recipient, and records an audit event. This lazy expiry is not a scheduled background job; exact-time expiry while the user is offline requires a future worker. |
| `GET /v1/courses/{courseId}/grading` | A caller with `course.grading` reads a bounded, no-store queue of submitted attempts and course-scoped student identities. |
| `GET /v1/assessment-attempts/{attemptId}/grading` | Authorized grader reads the safe answer workspace, frozen question snapshots, pinned manual rubric, and current grade revisions. The student can read only released grades/feedback for their own attempt. |
| `PUT /v1/assessment-attempts/{attemptId}/grades/{questionVersionId}` | A grader with `course.grading` records a per-question score or every criterion state for the pinned rubric. Criterion points are scaled to the assessment item's maximum; score overrides are accepted only when policy allows and require a reason by default. Regrades append a revision and supersede the prior current record. |
| `POST /v1/assessments/{assessmentId}/grades/publish` | A grader with `course.grading` publishes grades after the configured release time and, by default, only when every submitted attempt is completely graded. |
| `PUT /v1/submissions/{submissionId}/rubric-scores` | Future contract; submission-based rubric records are not implemented. |
| `POST /v1/submissions/{submissionId}/score-overrides` | Future contract; the implemented override is part of the attempt/question grade request above. |
| `POST /v1/grade-review-requests` | Future contract; grade-review requests are not implemented. |

The initial grading runtime stores append-only revisions by attempt and question-version, including score, scaled criterion results, optional grader note, override reason, grader, and publication timestamp. Student grade projections contain only published records for the student's own attempt; rubric details and notes are policy-gated. Assessment item points must sum to `gradingPolicy.maximumPoints`. Assignment assessments reuse the versioned delivery/attempt flow and practical question snapshots. Authorized assessment managers configure `latePenaltyTiers` as increasing minute thresholds and non-decreasing percentages; the highest threshold reached deducts that percentage once from the assessment maximum, capped at 100%, and never changes individual rubric revisions. Late duration and deduction are persisted on the attempt and only the adjusted released total is returned to the student. Grade-scheme integration, review requests, notifications, and controlled regrade jobs are not implemented. Learner-code execution and automatic code scoring remain disabled.

## Course, achievement, and report administration

The OpenAPI specification defines the machine-readable routes and request shapes for course discovery/create/update/archive/restore, staff and enrollment management, grade schemes, and teaching sessions. Course owner/TA permissions remain scoped; administrative restore and global configuration require Admin permission. Course archive is reversible and does not delete submissions, grades, ledger or audit history.

Course rules are explanatory, versioned text and are not a substitute for enforceable attendance, grading, assignment, or exam settings. The initial runtime stores immutable, numbered Admin template versions and a course-level override/custom-rule configuration. Activating a template version makes it the default for all courses; stable rule IDs preserve per-course overrides, and activation is rejected if it would orphan an existing override. A course owner or staff member with `course.rules.manage` may override/disable a shared rule and add course-specific rules without changing the Admin template. Updates publish an audited effective response version, require the current course `If-Match` ETag and expected active template version, and are conflict-checked. Students with active enrollment and authorized course staff may read effective rules. The runtime accepts plain text only; HTML markup and remote images are rejected. This does not yet provide immutable historical effective-rule publication snapshots or a management UI.

The initial course-planning runtime persists versioned lesson-plan drafts and scheduled teaching sessions. Only the course owner/Admin or staff with `course.content.author` may write; active students and authorized course staff may read. Lesson-plan writes use the course ETag, API-issued entry IDs keep session links stable, and referenced entries cannot be removed. Lesson-version IDs remain opaque until lesson authoring is implemented. Session timestamps require explicit offsets consistent with the named IANA timezone and are stored/returned as UTC instants; optional online meeting URLs must use HTTPS. Session reads support a half-open `[from, to)` time range. Attendance, recurrence, session updates/cancellation, and immutable published lesson versions remain outside this runtime increment.

Platform branding is Admin-only. The browser cropper decodes local PNG/JPEG/WebP input and uses the built-in Canvas API to preview/reposition/zoom a square 1:1 crop, then submits a 1024 × 1024 PNG. No third-party cropper or upload host is used. The API accepts only that PNG output (maximum 5 MiB), independently verifies/decode-validates it, re-encodes it without metadata, versions it, and serves the active asset from a same-origin URL. SVG, animation, malformed or oversized images, and MIME/extension mismatches are rejected. Preserve old versions for audited rollback; never use uploaded bytes directly as a trusted static file.

Achievement definitions are versioned and use registered event/metric keys and supported effect/reward types only. Admin publishes validated immutable versions; user views show locked/unlocked progress, tier, reward, unlock history, and equipped-title state without exposing restricted progression details. Achievement progress is calculated from trusted domain events, never client-submitted completion.

`GET /v1/students/{studentId}/learning-overview` provides the consolidated Student Learning Overview to Admin and authorized course staff. It aggregates only courses and fields the caller may access: roster permission for identity/activity/progress, attendance permission for session-level attendance, grading permission for submissions/unpublished scores/private feedback, and exam-monitoring permission for exam details. Teachers/TAs see only courses with active staff membership and applicable permissions; inaccessible courses are omitted without leaking their count. Every query is reauthorized at request time. Reject `from > to`; the response reports the effective period, defaulting to the current period if no range is supplied.

The overview summarizes current/historical course enrollments, attendance by status and eligible-session rate, lesson progress, unique practice questions and attempts/completions/passes/accuracy, assessment assignment/submission/grading/missing/overdue counts, permitted results, and recent activity. Optional course and time filters apply consistently to all time-based counts and return the reporting period. Practice question count is distinct question IDs; attempts count submission attempts. Accuracy is passed / completed auto-graded attempts; ungraded/manual work is not in its denominator. Attendance rate is `(present + late) / (eligible sessions - excused)`, with only held sessions in range counted as eligible and unrecorded sessions remaining in the denominator. Interactive detail is read-only; mutations use the existing audited domain routes.

Reports are asynchronous, permission-scoped jobs for enrollment, course activity, per-student learning progress, assessment/grading, attendance, exam incidents, and rank/EXP/Coin. PII exports are audited; Research Assistant reports are anonymized. Download URLs are short-lived and scoped. Report filters, columns, and result access are reauthorized at creation and download; report completion never broadens the caller's permissions. Revoked course membership or permissions remove the corresponding course/fields from future result reads and downloads.

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/students/{studentId}/learning-overview` | Admin or authorized course staff reads a student's permission-filtered learning summary. Optional `courseId`, `from`, and `to` filters; course and field scopes are rechecked on every request. |
| `GET /v1/admin/faculties` and `POST /v1/admin/faculties` | Admin lists active faculty entries (optionally including retired entries) or creates an immutable faculty ID with localized names. |
| `PATCH /v1/admin/faculties/{facultyId}` | Admin updates localized names/sort order or retires/reactivates a faculty; IDs cannot be changed and existing courses retain references. |
| `GET /v1/admin/academic-terms` and `POST /v1/admin/academic-terms` | Admin lists active terms (optionally including retired entries) or creates a uniquely coded term with ordered timezone-validated start/end timestamps. |
| `PATCH /v1/admin/academic-terms/{termCode}` | Admin updates the term schedule/name or retires/reactivates it; codes cannot be changed and existing courses retain references. |
| `GET /v1/admin/course-rule-templates` | Admin reads the active shared template/version. |
| `POST /v1/admin/course-rule-templates` | Admin creates a draft template version; activating it is a separate audited operation. |
| `POST /v1/admin/course-rule-templates/{templateId}/activate` | Admin validates and activates a version as the shared default for all courses; stable rule IDs and existing overrides are checked before activation. |
| `GET /v1/courses/{courseId}/rules` | Read the currently effective published rules; no unpublished override data is returned. |
| `PUT /v1/courses/{courseId}/rules` | Course owner or staff with `course.rules.manage` replaces course-specific overrides/custom rules and publishes a new audited effective version; requires `If-Match` and the expected active template version. |
| `GET /v1/courses/{courseId}/lesson-plan` | Course staff and actively enrolled students read the current draft plan. |
| `PUT /v1/courses/{courseId}/lesson-plan` | Course owner/Admin or staff with `course.content.author` replaces the draft using `If-Match`; API-issued entry IDs preserve session links. |
| `GET /v1/courses/{courseId}/sessions` | Course staff and actively enrolled students list scheduled sessions with optional `[from, to)` filters. |
| `POST /v1/courses/{courseId}/sessions` | Course owner/Admin or staff with `course.content.author` creates a timezone-validated teaching session; timestamps require matching offsets and online links require HTTPS. |
| `GET /v1/branding` | Read non-sensitive active branding metadata and the same-origin logo URL. |
| `GET /v1/admin/branding` | Admin reads active branding and prior version metadata. |
| `PUT /v1/admin/branding/logo` | Admin replaces the active logo with validated/cropped PNG bytes; requires `If-Match`, creates an immutable version, and retains the prior asset for rollback. |
| `GET /v1/reports` and `POST /v1/reports` | List caller-visible report types or create an asynchronous scoped report job. `studentProgress` accepts a student filter plus optional course/time filters. |
| `GET /v1/reports/{reportId}` and `GET /v1/reports/{reportId}/download` | Read status or download only while the caller remains authorized for the included data; PII exports are audited and download references expire. |

Course creation and explicit faculty/term reassignment accept only active catalog entries. Retiring a faculty or term preserves existing course references and does not block unrelated course edits. Historical references from before migration 0009 are represented by retired legacy catalog records.

## Secure code execution boundary

`runtime-profile.schema.json` describes metadata for a proposed Admin-approved immutable profile. A profile may progress `draft → test → active → deprecated` only under a future approved execution service; no profile may be activated now. The configured profile would be a hard ceiling, but the Local Autograder does not use LMS runtime profiles. ADR-0010 accepts only trusted local author-validation and does not authorize student-code execution. ADR-0008's gVisor proposal is historical/superseded for the initial scope.

`code-runner.schema.json` is a dormant internal queue message/result envelope, not a public runner API or authorization to execute a job. The existing Redis Streams publisher/admission code is transport plumbing only; no code-execution consumer is approved or started. The Local Autograder is standalone and must not receive learner submissions or LMS data.

The following are historical requirements for any future proposal to execute untrusted learner code; they do not describe the Local Autograder or an active service:

- No network egress, non-root execution, read-only base filesystem, dropped capabilities, ephemeral workspace, no mounted secrets, strict CPU/wall-time/memory/source-size limits, and bounded output.
- Only Admin allowlisted compiler images and libraries, selected by profile ID/version. Never accept user-supplied image names, shell commands, package installation directives, or resource ceilings.
- Validate all submitted relative paths for traversal, absolute paths, duplicate/case-colliding paths, and reserved harness files before materializing the workspace.
- Compile/run under a gVisor (`runsc`) isolation boundary on dedicated Linux worker hosts, with application/data-plane separation. A schema flag is not an enforcement mechanism; runtime activation requires deployment-level tests for egress denial, isolation, cleanup, and limit enforcement as defined in the threat model.
- Keep reference solutions and hidden test inputs/expected outputs server-side. Return only permitted per-test status and sanitized diagnostics based on each test's display mode.
- Distinguish `compileError`, `runtimeError`, `resourceLimit`, and `infrastructureFailure`. Infrastructure failures are retryable/idempotent and do not penalize the learner.
- Store bounded execution telemetry and logs under configured retention. Never log environment secrets, complete hidden fixtures, or unrestricted submitted files in ordinary application logs.

Student-code execution and automatic grading are disabled. Do not deploy a shared-process executor or pass learner code to the local tool or API/web/queue/grading-worker processes. Any future untrusted-code execution proposal needs a new product/security decision. See [`../../CODE_RUNNER_THREAT_MODEL.md`](../../CODE_RUNNER_THREAT_MODEL.md) for historical threat analysis.

## Account provisioning and exports

Routes:

| Method and path | Contract |
|---|---|
| `POST /v1/admin/invitations` | Admin creates a one-time email invitation for a selected fixed role and optional course membership. Do not accept or return a password. |
| `POST /v1/admin/csv-imports` | Admin creates an import job with import kind, template version, duplicate policy (`upsert` or `skip`), and sanitized source metadata. Returns the bounded raw-CSV preview endpoint; CSV content is not stored. |
| `POST /v1/admin/csv-imports/{jobId}/preview` | Accept a UTF-8 `text/csv` body (maximum 1 MB / 500 data rows) and its SHA-256 checksum. Validate rows and return counts plus row-number/error-code details without account changes; retain only a digest of the short-lived preview token and non-PII outcomes. |
| `POST /v1/admin/csv-imports/{jobId}/commit` | Require the exact CSV bytes/checksum, preview token, unchanged duplicate policy, and explicit confirmation. Revalidate matches and account snapshots, then atomically apply account/role/audit changes; replay is rejected. New-account invitation email is delivered after commit and delivery failures revoke those invitations. Match by institutional ID, then username; never auto-merge by email. |
| `GET /v1/admin/csv-imports/{jobId}` | Admin reads job state and row-level outcome codes; never return secrets or excessive PII in error text. |
| `POST /v1/admin/exports` | Authorized Admin/Teacher starts an audited CSV/XLSX export. Scope and fields are permission-checked; Research Assistant exports must be anonymized. |
| `POST /v1/admin/users/{userId}/suspensions` | Admin suspends a user with a required reason and session revocation. |
| `POST /v1/admin/users/{userId}/mfa-resets` | Admin resets MFA enrollment with a required reason; cannot set/reset the user's password directly. |
| `GET /v1/me/preferences` and `PUT /v1/me/preferences` | Read or replace the authenticated user's own locale, light/dark theme, and color-palette ID. All supported palettes remain user-selectable; preferences do not grant permissions. |
| `GET /v1/branding/logo` and `GET /v1/branding/logos/{logoId}` | Serve the active or retained normalized PNG logo from this application's same-origin route. |
| `GET /v1/admin/branding/logos`, `POST /v1/admin/branding/logos`, and `POST /v1/admin/branding/logos/{logoId}/activation` | Admin lists retained versions, uploads a browser-cropped 1024×1024 PNG, activates it, or rolls back to an earlier version. Uploads are signature/dimension/size validated, metadata-stripped and audited. |
| `POST /v1/me/password-resets` | Self-service reset flow uses a one-time expiring token; responses do not disclose whether an account exists. |

CSV commit is transactional per row or bounded batch with explicit partial-failure semantics and a durable job report. Preview tokens bind to the uploaded file checksum and options; any file/option change invalidates the preview. Limits, accepted encodings, field allowlists, file size, and raw-file retention are Admin policy. Match existing users by institutional ID first and username second; conflicting matches fail for manual resolution. All import/export actions are audited.

## Courses, achievements, and reports

The machine-readable OpenAPI contract covers course list/detail/create/update/activate/complete/archive/restore, staff and enrollment management, immutable grade schemes, teaching sessions, lesson-plan drafts, learning resources, and course-scoped questions/assessments. The first runtime increment implements course lifecycle, staff additions, student roster/enrollment, and scoped permission grants. Course owner/TA permissions remain scoped; administrative restore and global configuration require Admin permission. Course archive is reversible and does not delete memberships, submissions, grades, ledger, or audit history.

Achievement definitions are versioned and use registered event/metric keys and supported reward/visual-effect types only. Admin publishes validated immutable versions; user views show locked/unlocked progress, tier, reward, unlock history, and equipped-title state without exposing restricted progression details. Achievement progress is calculated from trusted domain events, never client-submitted completion.

Reports are asynchronous, permission-scoped jobs for enrollment, course activity, per-student learning progress, assessment/grading, attendance, exam incidents, and rank/EXP/Coin. PII exports are audited; Research Assistant reports are anonymized. Download URLs are short-lived and scoped. Report filters, columns, and result access are reauthorized at creation and download; report completion never broadens the caller's permissions.

## Attendance and student excusals

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/courses/{courseId}/attendance/sessions` | Staff with `course.attendance` lists scheduled sessions, records, and excusal requests for that course. |
| `POST /v1/sessions/{sessionId}/attendance/check-in-tokens` | Authorized staff opens/rotates a token expiring within five minutes; return the secret once and store only its SHA-256 verifier. |
| `POST /v1/attendance/check-ins` | Actively enrolled Student presents a token; server validates expiry/session/course membership and atomically records Present/Late. No GPS is collected. |
| `PUT /v1/sessions/{sessionId}/attendance/{studentId}` | Authorized staff marks status; post-close changes require a reason and append an immutable change event. |
| `POST /v1/sessions/{sessionId}/attendance/close` | Authorized staff closes the window idempotently; eligible active enrollees without valid check-in or a pending excusal become Absent. Existing pre-close excusal requests remain pending. |
| `POST /v1/sessions/{sessionId}/excusal-requests` | Student requests Excused before the window closes; status remains Pending until authorized staff review. |
| `POST /v1/excusal-requests/{requestId}/decisions` | Authorized staff sends `approve` or `reject` with a decision reason; approval updates attendance and appends history. |
| `GET /v1/me/attendance` | Student reads only their own session and course summaries. |

Check-in token secrets never appear in list/detail APIs or logs. A token expires within five minutes; rotation invalidates the previous token. The default late grace is ten minutes after session start, and check-in is rejected after session end plus the same grace. Enforce one current attendance record per student/session, active enrollment and section eligibility, per-student replay prevention, and audited manual overrides. `attendance_change_events` is database-enforced append-only; post-close changes require a reason. Student reads return only the authenticated Student's own records; staff list access requires `course.attendance`.

## Exam monitoring, incident actions, and appeals

Routes:

| Method and path | Contract |
|---|---|
| `POST /v1/exam-attempts/{attemptId}/acknowledgements` | Student acknowledges the exact exam policy version before starting; acknowledgement is immutable. |
| `POST /v1/exam-attempts/{attemptId}/observed-events` | Authenticated exam client submits only allowlisted observable signals with bounded metadata and client timestamp; server stamps receipt time and treats events as signals, not proof. |
| `GET /v1/assessments/{assessmentId}/exam-monitor` | Teacher/Admin or explicitly permitted TA lists authorized attempts, current connection/time state, and grouped alert summaries. |
| `GET /v1/exam-attempts/{attemptId}/events` | Authorized monitor reads paginated events under retention and permission policy. |
| `POST /v1/exam-attempts/{attemptId}/actions/proposals` | System or authorized staff proposes a disclosed configured action linked to events; no consequential penalty is auto-applied. |
| `POST /v1/exam-actions/{actionId}/confirmations` | Teacher/Admin confirms, rejects, or modifies a proposal with reason; freeze/force-submit/time/score adjustments require confirmation and audit. TAs need explicit monitoring/action permission. |
| `POST /v1/assessments/{assessmentId}/pause` and `POST /v1/assessments/{assessmentId}/resume` | Authorized Teacher/Admin pauses/resumes an incident-affected exam with reason; bulk extension is explicit and audited. |
| `POST /v1/assessments/{assessmentId}/recipients/{studentId}/attempt-resets` | While the assessment is open, Admin or a Teacher assigned to its course clears the work in that student's in-progress attempt, with a required reason. The same attempt remains in progress with its original deadline/countdown, attempt count, and published question snapshot; no replacement attempt is created. Pre-reset answers remain in history, the answer revision advances to reject stale client writes, and the action is audited. TAs cannot use this operation. |
| `POST /v1/exam-actions/{actionId}/appeals` | Affected Student appeals within the configured window and supplies an explanation. |
| `POST /v1/exam-appeals/{appealId}/decisions` | Authorized independent/reviewing staff records outcome and reason; decision is append-only. |

Event ingestion is rate-limited, size-bounded, deduplicated, and redacted. IP/browser metadata is access-restricted and not interpreted as proof of misconduct. A confirmed action is immediately visible to the Student with reason and linked events. An open appeal/legal hold blocks scheduled deletion. Default retention is 90 days for exam logs unless policy/legal hold requires otherwise; ordinary network loss alone does not trigger an automatic penalty.

Attempt-work reset is a separate, reasoned staff operation rather than an automated penalty or event-proposal action. It is allowed only for a recipient with an in-progress attempt while the assessment is open. It clears the current answer state in the same attempt; it does not stop or replace the attempt, create another attempt, or reset/extend the timer. The original deadline and remaining-time countdown continue unchanged, and the published question snapshot remains pinned. Pre-reset answers and monitoring history remain available for authorized review. The answer revision advances atomically so stale clients cannot restore cleared work. The student is notified, and the reset record links the attempt and actor/reason.

## EXP/Coin, missions, shop, marketplace, and clans

All balance changes are server-side domain commands backed by append-only ledgers. Public clients never submit a balance, reward amount, fee, rank, event result, or arbitrary effect type.

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/me/wallet` and `GET /v1/me/ledger` | Read the caller's own balances and paginated ledger entries; wallet also reports the active EXP multiplier and its expiry. Staff/Admin views require explicit permission. |
| `GET /v1/me/missions` | Read eligible missions/progress and any active streak-card expiry; expired card progress is removed lazily while preserving prior progress. Progress otherwise changes only from trusted events, not client-reported completion. |
| `POST /v1/missions/{missionId}/claims` | Idempotent claim for a claimable mission only; Core rechecks eligibility and calculates configured reward from trusted events. |
| `GET /v1/me/title`, `POST /v1/me/titles/equip`, `DELETE /v1/me/title` | Read, equip or clear the single active title slot. Titles can be earned through unlocked achievement tiers or purchased as bound inventory; purchased title inventory remains owned after equipping. |
| `GET /v1/shop/items` | Read currently eligible item versions, prices, stock/window, bound/tradeable policy, and supported effect summary. |
| `GET /v1/admin/shop/items` | Admin catalog view includes inactive stock and each item's single scheduled discount. |
| `POST /v1/admin/shop/items` | Publish an allowlisted effect. `title-token` accepts title text up to 80 characters and is account-bound; `exp-voucher` requires a positive configured EXP amount; `exp-multiplier` requires x2 for 1–168 hours; `streak-boost` targets an active supported mission with target count at least 4 and lasts 1–168 hours. A purchased title can be equipped, cleared and equipped again while owned. A streak card sets progress to 3 (without reducing existing progress), consumes on the next qualifying action, and expires by removing only the card-granted progress. Eligible trusted EXP rewards (not Coin) are multiplied and ledger details record the base amount and bonus. An optional discount has one percent and one explicit start/end window. |
| `PATCH /v1/admin/shop/items/{itemId}/discount` | Set, replace or clear the item's single scheduled discount; changes are audited. A 0 percent with no dates clears it. |
| `POST /v1/shop/purchases` | Purchase a supported item by item-version ID and quantity; Core calculates the discounted Coin component and configured EXP component, checks role/stock/limits/both balances, then charges both ledgers and grants inventory atomically. An insufficient balance rejects the full purchase without a partial charge. |
| `GET /v1/shop/refund-policy`, `POST /v1/admin/shop/refund-policies` | Read and publish audited immutable refund policy versions. Each purchase snapshots its policy version; requests require unused, unequipped inventory and fit the captured time window. |
| `GET /v1/me/shop/purchases`, `POST /v1/shop/purchases/{purchaseId}/refund-requests` | Read own purchase/refund status and request Admin review with a reason; pending requests reserve inventory against use or trade. |
| `GET /v1/admin/shop/refunds`, `POST /v1/admin/shop/refunds/{refundId}/decisions` | Review pending requests. Approval appends idempotent Coin/EXP credits and restores stock; rejection releases reserved items. |
| `POST /v1/inventory/{inventoryId}/activations` | Apply a supported owned item; validate bound state, role, target mission/effect and caps. One-shot boosts/vouchers are consumed; a purchased title stays owned and can be equipped again. |
| `GET /v1/marketplace/listings` | Read active fixed-price listings and published escrow/item summaries. |
| `GET /v1/marketplace/policy` | Read active versioned fees, price/volume limits, and expiry rules used to disclose seller proceeds before confirmation. |
| `POST /v1/admin/marketplace/policies` | Publish audited listing/offer fees, price/volume limits, and expiry caps as a new immutable version. Existing listings/offers keep their captured fee and version. |
| `POST /v1/marketplace/listings` | List eligible items at a Coin price; atomically reserve inventory and enforce limits/fees/expiry. |
| `POST /v1/marketplace/offers` | Create an offer using server-validated item/Coin references; atomically reserve offered assets. No direct transfer endpoint. |
| `POST /v1/marketplace/offers/{offerId}/decisions` | Counterpart accepts/rejects; acceptance settles escrow atomically, rejection/cancel/expiry returns reservations. |
| `POST /v1/marketplace/disputes` | Party opens a dispute; freeze eligible escrow and notify Admin. Admin resolution uses compensating ledger entries. |
| `GET /v1/clans` and `GET /v1/clans/{clanId}` | Read public clan profile/leaderboard-safe data; member-only views are permission-filtered. |
| `POST /v1/clans` | Create a clan by consuming an eligible Create Clan item; enforce unique moderated name and member cap. |
| `POST /v1/clans/{clanId}/invitations` and `POST /v1/clans/{clanId}/join-requests` | Owner invites; user requests to join. Membership transitions are explicit and a user may have at most one active clan. |
| `POST /v1/clans/{clanId}/membership-decisions` | Owner approves/rejects invitations or join requests; check cap and current membership atomically. |
| `POST /v1/clans/{clanId}/rename` | Owner consumes Rename Clan item; validate moderation and global uniqueness before changing name. |
| `POST /v1/clans/{clanId}/owner-transfer` | Current owner may transfer ownership to an active clan member; role projection and audit record update atomically. |
| `GET /v1/me/clan-missions` | Read only the authenticated user's active clan mission progress and configured rewards. |
| `GET /v1/clan-wars` and `GET /v1/clans/leaderboard` | List scheduled/completed wars and public W-L-D clan records. |
| `POST /v1/admin/clan-missions` and `POST /v1/admin/clan-missions/{missionId}/versions/{version}/activation` | Admin creates immutable versions using registered trusted event keys and activates a version; in-cycle clan progress remains pinned to its previous version. Rewards are server-configured Clan EXP and contributor EXP/Coin. |
| `POST /v1/admin/clan-wars` and `POST /v1/admin/clan-wars/{warId}/results` | Admin schedules a Clan War or code/writing competition. Competitions snapshot per-participant EXP/Coin/supported item rewards; Admin selects active members of either competing clan when finalizing. Awards and inventory grants are audited and idempotent. |
| `GET /v1/admin/clan-wars/{warId}/participants` | Admin retrieves active student members of the two competing clans for participant selection. |
| `POST /v1/courses/{courseId}/clan-war-proposals` | Course staff with `events.manage` submit a Clan War or code/writing competition proposal without choosing rewards; Admin approval configures rewards and schedules the event. |
| `GET /v1/admin/clan-war-proposals` and `POST /v1/admin/clan-war-proposals/{proposalId}/decisions` | Admin reviews proposals and approves/rejects them once; approval creates the scheduled war atomically. |
| `POST /v1/admin/missions` and `POST /v1/admin/runtime-profiles` | Admin creates versioned supported mission/reward definitions or approved runtime profiles; arbitrary scripts, code, images, and effects are rejected. |
| `POST /v1/courses/{courseId}/staff-events` | Authorized Teacher/TA creates a course event and escrows the configured prize budget; reject insufficient funds. |
| `GET /v1/courses/{courseId}/staff-events` | List course events; award identities are returned only to callers with roster/event management permission. |
| `POST /v1/staff-events/{eventId}/results/approval` | Organizer/authorized staff approves configured event results; payout uses idempotent ledger events. Global events require Admin approval. |
| `POST /v1/staff-events/{eventId}/cancellations` | Organizer or authorized Admin cancels an unpaid event with an idempotent reserve refund; paid events cannot be reversed here. |

Marketplace accept/cancel/expire, purchase/refund, and event payout operations are atomic and idempotent. Reserved balances/items are unavailable to concurrent spends. Admin dispute resolution never rewrites original ledger rows. Mission definition changes are versioned and apply from the next cycle; active progress stays on the prior version. Rank is derived from the current EXP balance and may fall after a spend/deduction.

## Notifications and realtime recovery

Routes:

| Method and path | Contract |
|---|---|
| `GET /v1/me/notifications` | Paginated in-app feed filtered by unread/severity/cursor; includes only the recipient's notifications. |
| `POST /v1/me/notifications/{notificationId}/read` | Mark the recipient's notification read idempotently. |
| `POST /v1/me/notifications/{notificationId}/acknowledgements` | Acknowledge a notice when required/allowed; critical notices require acknowledgement and track status. |
| `GET /v1/me/notification-preferences` and `PUT /v1/me/notification-preferences` | Read/update opt-in channels for nonessential events; mandatory security/assessment notices cannot be disabled. |
| `GET /v1/admin/notification-templates` and `POST /v1/admin/notification-templates` | Admin manages versioned localized templates, event/channel allowlists, and mandatory classification. |
| `GET /v1/notifications/{notificationId}/delivery-status` | Sender with scope permission reads aggregate acknowledgement/delivery status; do not expose another user's unrelated notification feed. |

Realtime uses Socket.IO: FastAPI integrates `python-socketio`'s `AsyncServer` through ASGI, `AsyncRedisManager` fans out across API instances, and browser clients use `socket.io-client` over TLS. REST remains the command and authoritative-read transport. After an audited mutation commits its business state and outbox row atomically, an API-side dispatcher publishes a best-effort event through Redis. The current runtime sends only `{eventId, eventType: "state.changed"}` to authenticated connections; clients then refetch state through their authorized REST APIs. Resource-specific event payloads and subscriptions are not yet implemented. "System-wide" means reaching connected clients with a generic invalidation hint, not sending private resource details to every account.

Socket/realtime messages are best-effort hints with event ID, event type, recipient scope, resource ID, and revision/version only. No hidden test, submitted code, secret, answer content, or unnecessary PII is sent through realtime channels. Authenticate with the existing LMS session, validate origin, authorize room/subscription membership server-side, and revalidate/revoke access after permission changes; never trust client-selected rooms. Clients reconnect using a cursor and recover authoritative unread/current state from REST APIs; delivery is at-least-once/idempotent from the consumer perspective. Critical notices use in-app popup and acknowledgement, not email under the initial policy. Emergency notice sends and acknowledgements are audited.
# Local BUILD-026 provisioning reconciliation — 2026-11-15

This dated implementation update applies to `cyb3rt1tan-lms` and the current OpenAPI contract. It supersedes earlier user-only/unsupported-enrollment CSV descriptions for this local increment; other runtime claims remain subject to the local execution report.

- `/admin/csv-imports` supports Admin user templates v1 (five columns) and v2 (plus `faculty_id,course_id,section_id`), and Admin/Administrative Assistant enrollment v1 (`institutional_id,username,course_id,section_id,status`). Jobs remain actor-owned, checksum/token-bound, 1 MB/500-row bounded and revision-revalidated at commit. No raw identifying row data is staged; role/session/MFA checks are live. Assistants cannot import global accounts or access submissions/grades/rosters/identifying exports through this capability.
- `/admin/users` additionally accepts faculty/source filters. Existing sources are legacy unless provenance is known; there is no active Moodle/SSO connector.
- `/admin/account-exports` provides Admin-only users/enrollments CSV/XLSX job creation with mandatory reason and at most 10,000 selected rows; larger selections return 413. The original selection is retained as UUID/revision metadata, excluding raw PII/search text/file content. User status/source filters describe accounts; a course filter on enrollment exports includes every enrollment status.
- `/admin/account-exports/{job_id}` and `/download` require the same requester to retain Admin/session/MFA authorization. Downloads expire after 15 minutes (410) and reject changed selected data (409); unauthorized ownership is 404. Preparation/download both produce transactional audit/outbox events. Responses are attachments with no-store/nosniff headers. CSV formula protection and XLSX inline text prevent cells from being authored as executable formulas.
- Protected avatar/profile support and real SMTP/browser/hosted acceptance remain pending; see the local BUILD-026 report. Contracts do not imply completion of other domain endpoints.

