# Core LMS Data Model

- Status: Reconciled logical model; PostgreSQL persistence foundation is tracked in BUILD-025, identity schema/API in BUILD-026, and course/catalog/rules/planning persistence in BUILD-027.
- Product source: [`../../PRODUCT_REQUIREMENTS.md`](../../PRODUCT_REQUIREMENTS.md).
- Persistence: PostgreSQL is authoritative. Redis is rebuildable/ephemeral infrastructure only.
- Identity: local authentication and audited CSV provisioning; no initial SSO or Moodle connector.

This model defines entities, ownership, immutability, and integrity boundaries. UUID is the default primary key unless a stable text key is specified; UUIDv4 or another cryptographically random non-sequential ID is used for any ID exposed through public routes/contracts. Never expose sequential database keys. Persist timestamps in UTC; use explicit IANA timezone IDs for course/system scheduling rules. Use restrictive foreign keys for historical records. Store user-uploaded files in private object storage and persist object keys, checksums, media type, size, and retention metadata rather than large blobs.

PostgreSQL 17, SQLAlchemy 2, Alembic, and private self-hosted S3-compatible object storage (MinIO target) are selected by [ADR-0007](../../adr/ADR-0007-postgresql-and-private-object-storage.md). The reusable Local Autograder library provides heuristic, non-executing static policy checks and executes only explicitly confirmed trusted source (ADR-0010); it is not a sandbox or LMS execution service. Student-code execution is disabled. The former gVisor direction in ADR-0008 is superseded for the initial scope; any future untrusted runner requires a new decision. JSONB is appropriate for versioned type-specific configuration only when validated against a versioned schema; canonical relationships and ledgers remain relational.

## 1. Identity, authentication, and provisioning

| Entity | Important fields and constraints |
|---|---|
| `users` | `user_id` PK; normalized `username` UNIQUE; normalized `email` UNIQUE; `official_name`; optional unique `institutional_id`; `nickname` (normalized, unique system-wide); optional `avatar_asset_id`; `status` (`invited`, `active`, `suspended`, `closed`); timestamps. Official identity fields are not self-editable. |
| `user_preferences` | `user_id` PK/FK; locale, timezone, theme (`light`/`dark`), color-palette ID, text-scale, high-contrast, reduced-motion, and caption preferences. Users read and update only their own row; preference values never grant access. |
| `platform_logos` | Immutable numbered normalized 1024×1024 PNG versions, SHA-256 digest, creator/time, and one active version enforced by a partial unique index. Only Admin may upload/activate; prior versions remain available for audited rollback. |
| `user_credentials` | `user_id` PK/FK; Argon2id PHC password hash (algorithm/parameters included); password-changed timestamp; never store plaintext or recoverable passwords. |
| `user_invitations` | token hash, normalized recipient, invited role, inviter, expiry, accepted/revoked timestamps; one-time use; only token hash is stored. Pending recipient invitations are unique; mail is delivered through the approved self-hosted SMTP relay. |
| `user_mfa_methods` | user PK/FK, method (`totp`), AES-256-GCM encrypted secret, enrollment/pending-expiry timestamps, last accepted TOTP step; never persist the authenticator secret in plaintext. Encryption key is a stable 32-byte secret-manager value. |
| `user_mfa_recovery_codes` | user, SHA-256 digest of high-entropy one-time recovery code, created/used timestamps; raw codes are displayed once and never stored. |
| `user_mfa_challenges` | SHA-256 digest of a short-lived password-verified enrollment token, user, expiry/consumed timestamps; raw tokens are never persisted. |
| `mfa_required_roles` | global role PK, required flag, last Admin updater/time. Policy changes revoke all existing role sessions; an Admin must use an MFA-authenticated session before requiring MFA for the Admin role. |
| `user_sessions` | session ID, user, SHA-256 session-token digest, CSRF-token digest, created/last-seen/expiry/revocation and MFA-authentication timestamps; never persist or log raw credentials/tokens. |
| `login_rate_limits` | HMAC-derived account/network key, fixed-window start and attempt count; raw usernames/IP addresses and the HMAC key are not persisted. Expired windows are pruned during login. |
| `global_role_grants` | (`user_id`, `role`, `granted_at`) key; role enum: `student`, `teacher`, `teachingAssistant`, `admin`, `administrativeAssistant`, `researchAssistant`; grantor, optional expiry/revocation, reason. Multiple roles allowed. |
| `global_access_policy_versions` | immutable version, role baseline permissions, allowlisted course permission keys, status/effective time, author and audit reference. A new active version supersedes but does not mutate prior policy. |
| `csv_import_jobs` | actor, import kind, source filename metadata, template version, selected duplicate policy (`upsert`/`skip`), status, checksum, preview-token digest, bounded counts, expiry/completion timestamps, audit reference. The current import API does not persist raw CSV. |
| `csv_import_rows` | job, row number, validation status/error codes, action (`create`/`update`/`skip`/`reject`), resulting entity ID, and matched-account update timestamp for stale-preview detection. Do not persist source identity values or copy secrets/PII into error logs. |
| `data_export_jobs` | requester, scope, format (`csv`/`xlsx`), filters, anonymized flag, status, protected asset reference, expiry/download timestamps; PII export requires permission and audit. |

User import matches by institutional ID, then username. Email is not an implicit merge key. Deactivation preserves academic, financial, and audit history. Admin suspension/session revocation/MFA reset requires a reason; no Admin password-setting operation exists. MFA is optional unless enabled for a global role; policy-required users without enrollment complete TOTP setup through a short-lived pre-login challenge. TOTP codes are replay-protected, and recovery codes are one-time. Research Assistant access is limited to explicitly approved anonymized datasets.

## 2. Organization, courses, terms, and access

| Entity | Important fields and constraints |
|---|---|
| `faculties` | stable ID, localized name, status, sort order. |
| `academic_terms` | term code, name, start/end timestamps, timezone, status; unique code within organization. |
| `courses` | `course_id` PK; owner Teacher; course code/title; faculty and term catalog references; status (`draft`, `active`, `completed`, `archived`); timezone; version for optimistic concurrency; module details; created/updated by and timestamps. Archive preserves referenced records. |
| `course_module_details` | `course_id` PK/FK; module code/name, level, unit of credit, year, nature, objectives, suggested study hours, prerequisite descriptions, required software/IDE. Mutable details are audited. |
| `course_memberships` | course/user, section, membership status (`invited`, `active`, `withdrawn`, `completed`), joined/ended timestamps, source (`manual`, `csv`, `joinCode`). Only Student memberships count as roster enrollment. |
| `course_staff_memberships` | course/user, staff role, active interval, grantor. One active Teacher owner per course; zero or more co-instructors and TAs. Owner transfer is an explicit audited operation. |
| `course_permission_templates` | Admin-managed named versioned permission sets. |
| `course_permission_grants` | course/user/permission key, grantor, reason, start/expiry/revocation. Keys must be in the active global policy allowlist and user must have active course staff membership. Permissions include roster, content authoring, assessment management, grading, exam monitoring, export, and attendance. Grants are granular; templates do not bypass authorization. |
| `course_rule_template_versions` | immutable Admin-authored shared defaults; monotonically increasing version, effective time, rule JSON validated against the versioned schema, author, activation status, and audit reference. The active template is the default policy source for all courses. |
| `course_rule_overrides` | course, template version, stable rule ID, override action (`override`/`disable`), optional replacement title/body, editor and timestamps. Course owner or staff with `course.rules.manage` may edit; overrides do not mutate global defaults. |
| `course_custom_rules` | course-scoped additional rule ID, category, title/body, position, status, editor and timestamps. Only course owner or staff with `course.rules.manage` may change these. |
| `course_rule_publications` | immutable effective-rule snapshot/version, source template version, course override/custom-rule version, publication time/actor, and audit reference. Students read the active published snapshot; history is retained. |
| `course_join_codes` | code hash, expiry, use limit/count, allowed section, creator, revoked timestamp. Never store/display a reusable plaintext code after creation. |
| `course_urls`, `course_learning_resources` | course-linked title, note, coverage, URL or protected asset reference, display order and status. |
| `grade_scheme_versions` | course, immutable version, grading formula key, conversion-scale version, status and publisher. Published weights total exactly 100%. |
| `grade_scheme_items` | scheme version, assessment type/ID, weight, sort order. |
| `platform_branding_versions` | immutable version, private object key, SHA-256 checksum, normalized media type/dimensions, uploader, activation time, prior-version reference, and audit reference. Only Admin can upload/activate; the application serves only the active normalized logo through a same-origin route. |

Admin configures system defaults (terms, module-code policy, grading scales, enrollment policy); owners may change only permitted course settings. CSV is the initial source for identity/enrollment. No SSO, Moodle API, or automatic LMS sync is assumed.

The BUILD-027 runtime implements Admin-managed `faculties` and `academic_terms` catalogs. Faculty locale-name maps and term date ranges are validated on writes; active terms require both timestamps and an IANA timezone. Term codes are globally unique in the current single-organization deployment. Course faculty/term columns have restrictive foreign keys. New courses and explicitly changed references must target active entries, but retiring a catalog entry does not invalidate historical courses or block unrelated edits. Migration 0009 converts any pre-existing unmodeled course references into retired legacy catalog records before adding the foreign keys.

The current BUILD-027 runtime stores shared rule JSON in immutable `course_rule_template_versions` rows and per-course overrides/custom rules in `course_rule_configurations`; effective rules are assembled on read from the active shared version and current course configuration. Activations reject stable-ID removals that would orphan an override. The logical `course_rule_publications`, individually relational override/custom-rule rows, and retained historical effective snapshots are not yet runtime tables.

The initial course-planning runtime stores editable plans in `course_lesson_plans` as versioned JSON entries and scheduled occurrences in `teaching_sessions`. Lesson-plan entry IDs are API-issued stable identifiers; writes use the parent course ETag, and entries referenced by sessions are retained. `lessonVersionId` is an opaque reference until lesson authoring is implemented. Session timestamps are stored as timezone-aware UTC instants alongside an IANA timezone; offsets are validated against that timezone. Recurrence, cancellation, attendance windows/records, and immutable published plan snapshots remain future work.

## 3. Categories, tags, and taxonomy history

Categories and tags are separate concepts. A question version has one primary category and zero or more tags; lessons may have multiple tags. Category descendant inclusion is an explicit filter option; tag hierarchy is navigation only and does not imply inherited matching.

| Entity | Important fields and constraints |
|---|---|
| `content_categories` | stable text `category_id` PK; nullable parent category FK; localized names; status (`active`, `retired`); sort order; created/updated by. IDs are immutable; no cycles. |
| `content_tags` | stable text `tag_id` PK; optional parent tag FK for navigation; localized names; status; sort order; creator. IDs are immutable; no cycles. |
| `content_tag_applicability` | (`tag_id`, `content_type`) PK; supported values initially `lesson`, `question`. |
| `taxonomy_revisions` | catalog version, actor, timestamp, change summary. Taxonomy edits are versioned and audited. |
| `taxonomy_merges` | retired/source ID, surviving target ID, actor, timestamp and migration summary; preserves historical references and redirect behavior. |

Retire or merge referenced nodes; do not hard-delete them. A question filter may explicitly include descendants of selected categories. Tag filters use direct selected tag IDs and `any`/`all` semantics. Category/tag applicability and active state are validated when creating new content; historical versions retain their original IDs.

The initial BUILD-028 runtime adds learning-content category/tag tables, question-specific category/tag tables, tag-applicability rows for learning content, serialized catalog-version state, taxonomy revision history, and typed merge redirects. Migration 0013 copies existing category/tag records to the question-specific tables and redirects question foreign keys there. A local development seeder installs the canonical catalog in the appropriate content/question tables and creates one active account per role.

## 4. Lessons, lesson plans, teaching schedule, and attendance

| Entity | Important fields and constraints |
|---|---|
| `lessons` | stable lesson ID, optional course scope, status (`draft`, `published`, `archived`), current version pointer, author. |
| `lesson_versions` | immutable version number, title/body blocks, learning outcomes, estimated hours, completion rule, author/time. Published versions are immutable. |
| `lesson_version_tags` | lesson version and tag ID junction, unique pair. |
| `lesson_plan_entries` | course, week/session label, lesson version, topic/content/reading references, outcomes, estimated hours, sort order, optional scheduled-session link. |
| `teaching_sessions` | course, section scope, starts/ends, timezone, room/online URL, recurrence group, exception/cancellation metadata, linked lesson-plan entry. |
| `attendance_windows` | session, open/close time, late grace period (ten-minute default), hashed rotating QR/check-in token and expiry, status. Tokens expire within five minutes; no GPS collection. |
| `attendance_records` | session/student, status (`present`, `late`, `absent`, `excused`), source (`staff`, `token`, `system`), marked by/time, optional reason; one current record per student/session plus append-only change history. |
| `attendance_change_events` | previous/new status, actor, required reason for post-close edits, timestamp. |
| `attendance_excusal_requests` | student/session, reason and optional private evidence reference, submitted before attendance close, review status/reviewer/time. Requests submitted before close may remain pending after close. |

At attendance-window close, unenrolled/eligible students without a valid check-in are marked Absent. Staff-approved exceptions may change status. Student lesson completion events and attendance do not themselves alter official grades unless an explicitly published grade scheme includes that criterion.

## 5. Question bank and immutable content versions

Every question has a stable aggregate ID and immutable versions. Each version has a `question_type`, one primary category, multiple tags, difficulty, usage type (`practice`, `practical`, `exam`), author, and status. Difficulty values are constrained in migration 0011: `newbie` (Level 1: Newbie), `noob` (Level 2: Noob), `wannabe` (Level 3: Wannabe), `gatekeeper` (Level 4: Gatekeeper), and `legendary` (Level 5: Legendary). Editing shared course content creates a new version. Published assessments reference exact versions, so changes never alter already-delivered work.

| Entity | Important fields and constraints |
|---|---|
| `questions` | question ID, course scope, creator/time. The current runtime stores course-scoped bank items; lifecycle state is versioned. |
| `question_versions` | question version ID, question ID, positive version number, type, title/prompt, category ID, difficulty, usage types, public content, private authoring config, schema version, status and author/time; unique question/version number. Content rows are append-only in the initial runtime. |
| `question_content_schemas` | registry key (`question_type`, schema version), schema artifact digest, activation status and compatibility metadata. Unknown or inactive schema versions cannot be used for authoring/publication. |
| `question_version_tags` | version/tag unique junction. |
| `question_set_items` | parent Reading/Listening set version, ordered child question version, points. Child question type is limited to supported set-compatible types. |
| `question_assets` | version, private object key, checksum, media type, file size, relative sandbox path if applicable, access/retention classification. |
| `question_answer_keys` | private answer data, accepted variants, normalization rules, correct choices, or matching keys; never included in student-facing APIs. |
| `question_options` | version, stable option key, public text/media, position; correctness and rationale stored separately in private answer-key data. |
| `question_rubric_criteria` | version, unique criterion key/title/description, positive points, unique order; criterion points sum exactly to rubric maximum and are versioned with the question. |
| `question_code_configs` | version, runtime profile ID, submission mode, wrapper kind (`class`, `method`, `program`), harness/template, package/class requirements, attribute/constructor/getter/setter/validator/comparator/toString requirements, configured expected exceptions, limits bounded by Admin policy. |
| `question_test_cases` | version, test key, visibility (`example`, `show`, `hide`, `hideIfFail`, `hideIfSuccess`), test representation (`inputOutput`, `harnessSnippet`), private input/expected output, points/weight, order. Hidden data is only available to trusted grader/authorized authors. |
| `runtime_profile_versions` | Immutable numbered profile snapshots with language/version, compiler image digest, allowlisted libraries, resource caps, restrictive sandbox settings, lifecycle status, EOL, and creator/time. The current API accepts Admin-created Drafts only; testing/activation requires a selected runner and its threat model and conformance evidence. |
| `question_check_policies` | version, check-button visibility, wrong-check penalty, zero score floor, all-or-nothing flag, retry policy. Technical runner errors do not count as incorrect checks. |

Supported `question_type` values: `code`, `writing`, `sentenceRewriting`, `multipleChoice`, `multipleSelect`, `shortAnswer`, `fillInTheBlank`, `matching`, `ordering`, `trueFalseNotGiven`, `readingSet`, `listeningSet`.

The standalone local tool supports C, Java, and Python for trusted author-owned validation using Input/Output cases, unit-test harnesses, and structural checks. Java test harnesses may use the installed JDK's Reflection, Annotation, Annotation Processing, Dynamic Proxy, Generic, ClassLoader, and Compiler APIs. Execution requires explicit operator confirmation and runs with the developer's OS privileges; timeout/output/temp-directory controls do not make it safe for untrusted code. It is not connected to LMS APIs or grades. Student source may be collected only as non-executed work in the initial scope; student-code execution and automatic grading are disabled. Runtime profile drafts remain metadata only. Do not infer a production runner, sandbox, or isolation guarantee from the local tool or queue plumbing.

The BUILD-028 runtime adds course-scoped question aggregates, immutable version records, multi-tag relations referencing `question_categories`/`question_tags`, taxonomy-backed search, authorized authoring projections, and Admin-only distinct-question usage counts at `/v1/question-taxonomy`. Strict schema and relationship validation plus safe published-question projections are implemented. The initial question-bank migration constrains difficulty to the five agreed levels; Code/Listening publication, assignments, and practice delivery remain gated or pending as recorded in the build log.

Writing rubrics use criterion checkbox scoring with authorized score overrides and reasons. A published rubric edit creates a new version and a controlled recalculation of prior grading results, preserving before/after score history and notifying graders. Sentence rewriting supports multiple accepted answers and configured normalization. Matching/ordering/choice/short-answer grading rules and partial-credit policy are versioned with the question.

Listening sets reference protected audio assets and a per-attempt play limit. Transcript is private by default and exposed only where a permitted accommodation applies. Audio review after submission follows assessment policy.

## 6. Assessments, delivery snapshots, submissions, and grades

| Entity | Important fields and constraints |
|---|---|
| `assessment_types` | Admin-managed stable code, label, order, status (for example Internals/Final Exam). |
| `assessments` | course, type, title/description, lifecycle (`draft`, `scheduled`, `open`, `closed`, `grading`, `published`, `archived`), owner, opens/closes/due timestamps, timezone, grade-scheme version, current version. |
| `assessment_versions` | immutable instructions, policies, question selection, points, schedule, review/feedback policy. |
| `assessment_question_items` | assessment version, position, question ID and immutable version ID, points, section/group conditions. |
| `assessment_selection_rules` | manual fixed set or random blueprint by category/tags/difficulty/points/count; persisted rule and resolved immutable item snapshot. Category descendant inclusion is explicit. |
| `assessment_recipients` | assessment/student, delivery status, accommodation reference, published timestamp; recipient derived from course membership or explicit authorized subset. |
| `assessment_attempts` | recipient, attempt number, started/ended timestamps, per-student duration/deadline, state (`inProgress`, `submitted`, `forceSubmitted`), last autosave time, submitted status, current answer revision. Resetting work does not change attempt state, count, or deadline. |
| `submission_answers` | attempt/question-version, current answer payload or private asset reference, autosave revision/time. Enforce that referenced question version was assigned to the attempt; preserve superseded/reset answer revisions for audit according to retention policy. |
| `exam_attempt_resets` | assessment/student, in-progress attempt ID, actor, required reason, reset timestamp, prior/new answer revision, audit ID. Append-only; reset clears current answers in the same attempt without changing its timer or creating another attempt. |
| `grading_runs` | submission, grader/runtime version, queued/running/completed/failed status, score, sanitized feedback, bounded execution details. |
| `grading_case_results` | grading run/test case, pass status, points, duration, bounded resource usage; hidden-case visibility is controlled separately. |
| `manual_grade_events` | submission, grader, rubric version, criterion scores, override score/reason, previous/new total, timestamp. Append-only history. |
| `published_grade_records` | student/assessment version, published score, grade scheme version, publisher/time; students see only published records. |
| `grade_review_requests` | student, assessment, published grade, explanation, deadline, status, reviewer, decision/reason/timestamps. |

An assessment publish transaction resolves recipients and question selection, snapshots all question versions, and freezes delivery state. Changes after publication require an explicit new revision workflow. Final course grade uses the published grade-scheme weighted sum; active weights total 100%. Auto-grading is used for code/objective questions; projects/files and in-person assessments support manual grading. Score overrides require a reason and audit record.

An authorized Admin or course Teacher may reset the work of one in-progress recipient attempt while the assessment is open. The operation clears the current answers in the same attempt; it does not reset or extend the timer, alter the deadline, change the attempt count, or create a replacement attempt. Preserve prior answers and reset history for audit, and advance the answer revision atomically so stale clients cannot restore cleared work. TAs are not included in this operation.

The corresponding API boundary, authorization rules, validation invariants, and endpoint shapes are specified in [`API_CONTRACTS.md`](./API_CONTRACTS.md). These contracts do not imply that endpoints or code execution are implemented.

## 7. Exam monitoring, penalties, and appeals

| Entity | Important fields and constraints |
|---|---|
| `exam_policies` | assessment version; monitored browser signals, thresholds/windows, configured suggested actions, notice schedule, data-retention policy and student acknowledgement version. No webcam/microphone fields in initial scope. |
| `exam_attempt_events` | attempt, event type, observed timestamp, minimal evidence/metadata, source, severity; append-only. Events describe browser-observable signals, not conclusions of misconduct. |
| `exam_device_observations` | attempt, observed IP, browser/OS, session/device metadata; hostname only from a future managed client. IP may reflect proxy/VPN and is not proof of identity. |
| `exam_alerts` | event/threshold group, recipients by authorized role, delivery/ack status, dedupe window. |
| `exam_actions` | attempt, action (`notify`, time adjustment, score penalty, freeze, force submit), proposed/applied/reversed status, required reason, linked events, actor/approver, time delta/score delta, audit ID. Penalties are proposed first; authorized Teacher/Admin confirms. |
| `exam_incident_cases` | attempt/student, summary, review status, assigned reviewer, legal-hold state, retention deadline, closure decision; no automated misconduct verdict. |
| `exam_appeals` | incident/action reference, student explanation, submitted within configured window, status, reviewer, outcome/reason/timestamps. Open cases place related logs on hold. |
| `exam_pause_events` | assessment, actor, reason, pause/resume timestamps, affected recipients and any bulk extension; fully audited. |
| `exam_acknowledgements` | attempt, student, exact policy version, acknowledgement timestamp. Must exist before exam starts. |

The monitor UI reads official name/student ID plus IP and browser/OS under restricted course permission. Serious alerts go to course Teachers/Admin; TAs need explicit monitoring permission. Duplicate alerts are grouped. Network loss does not automatically penalize or lock a user without a configured threshold and authorized decision. Student is notified immediately of a confirmed adjustment and may appeal. Default log retention is 90 days; open appeals/cases have legal hold, then policy-driven retention/anonymization.

## 8. EXP, Coin, ranks, missions, achievements, shop

EXP is the single spendable balance and rank basis. Student and staff have separate non-seasonal rank tracks. Spending EXP can lower rank. Coin is a separate non-expiring balance. All changes are append-only ledger events; no direct client balance mutation.

| Entity | Important fields and constraints |
|---|---|
| `exp_ledger` | user, signed delta, reason/source event, idempotency key UNIQUE, actor/system, policy version, timestamp. Includes earned, purchased, bonus, correction, and spend entries. |
| `coin_ledger` | same pattern for Coin, with source and transaction references. Transfers must use escrow; no direct wallet transfer. |
| `rank_policy_versions` | track (`student`/`staff`), version/status/effective time, author and audit metadata. Active policy versions are immutable. |
| `rank_tiers` | policy, stable ID, name, threshold EXP, icon/color/description, position; thresholds start at zero and strictly increase. |
| `rank_role_tasks` | staff tier, staff role, registered metric or manual-review requirement. No arbitrary executable expressions. |
| `rank_snapshots` | user/track, current EXP-derived tier, policy version, calculated time; rebuildable projection. |
| `mission_definitions` | Admin or authorized event owner, scope (system/course/role), role eligibility, mission type (daily/weekly/achievement/event/streak), versioned condition key/config, timezone, active interval, repeat/idempotency/cooldown rules. |
| `mission_rewards` | mission version, optional EXP/Coin amounts, item rewards; reward dimensions independently optional. |
| `mission_progress` | user/mission version/cycle, progress and state. Definition changes apply next cycle; active cycle remains pinned to old version. |
| `mission_streaks` | user/mission, successful sequence, window, current progress and reset state. Failure resets only the matching streak; no daily Practice attempt cap. |
| `reward_events` | source event/idempotency key, user, mission, computed EXP/Coin/item awards, multiplier context, timestamp; auditable and replay-safe. |
| `exp_boost_effects` | inventory activation, start/end, multiplier (system-supported; cap x2), source item. Reuse extends duration but does not stack multiplier. |
| `mission_streak_boosts` | user, mission version and cycle, baseline and granted progress, expiry, consumption/expiry timestamps; expiry removes only progress granted by the card, not pre-existing progress. |
| `achievements` / `achievement_versions` | Admin-defined event criteria key, tiers, reward, visuals, effective version. |
| `user_achievements` | user, achievement version/tier, progress/unlock timestamp, source event. |
| `user_equipped_title` | one equipped title per user, ownership reference; a user may display one earned or purchased title. |
| `user_equipped_shop_titles` | one shop inventory reference per user for the shared equipped-title slot; inventory remains owned and can be equipped again after switching titles. |
| `shop_items` / `shop_item_versions` | supported effect type only (`exp-multiplier`, `streak-boost`, `exp-voucher`, `create-clan`, `rename-clan`, `title-token`, cosmetic, practice aid); price in Coin and/or EXP, eligible roles, duration, stock/window, per-user limit, bound/tradeable flag, policy version. |
| `shop_discounts` | item version, start/end, discounted price, creator; at most one active non-stacking discount per item. |
| `user_inventory` | user/item version, quantity, bound/tradeable state, acquired/used timestamps. Role-limited items are account-bound. |
| `shop_purchases` | buyer, item version, charged EXP/Coin, discount version, outcome/refund reference; both ledger debits settle atomically and are audited. |
| `shop_refund_policies` | immutable version, enabled state, refund window, unused-only rule, publisher and timestamp; each purchase snapshots the policy version. |
| `shop_refunds` | unique purchase request, requester, captured policy version, reason, pending/approved/rejected outcome and independent Admin decision metadata. Approval refunds both currencies via append-only ledger credits and restores unused inventory/stock. |

The EXP multiplier affects eligible EXP only (not Coin), counts toward rank, and is capped at x2. Streak cards target a selected mission, set progress to three for a configured duration, and do not grant reward until the next qualifying action. EXP vouchers award configured amounts. Shop purchases use supported effect handlers; Admin cannot author arbitrary scripts.

## 9. Marketplace, staff-funded events, and clans

| Entity | Important fields and constraints |
|---|---|
| `marketplace_policies` | versioned fees by transaction type, price/volume limits, listing lifetime, dispute settings. Fees are disclosed and burned, deducted from seller/offer originator proceeds. |
| `marketplace_listings` | seller, inventory item/quantity, fixed Coin price, expiry/status. Listing reserves assets in escrow. |
| `marketplace_offers` | buyer/seller, offered Coin/items, requested items, expiry/status; funds/items reserved while open. |
| `marketplace_escrow_entries` | transaction, asset type/amount/item, owner, state; settle atomically on acceptance or release on cancellation/expiry. |
| `marketplace_disputes` | transaction, parties, evidence, status, freeze and resolution; Admin resolves using compensating ledger entries, never edits original ledger rows. |
| `staff_events` | course scope, organizer, activity/ranking rules, start/end, state, approved tie policy and results. Global events require Admin approval. |
| `staff_event_prize_reserves` | organizer's Coin reserve and optional supported item reserve, event, status; reserve at creation, payout after result approval, refund on cancellation. |
| `staff_event_awards` | event, participant, rank/result, approved EXP/Coin/item/Clan EXP award; ledger idempotency key. |
| `clans` | unique moderated name, owner, level/Clan EXP projection, member cap, status, created time. One current clan membership per user. |
| `clan_memberships` | clan/user, join status, clan rank, joined/left times; invitations and join requests are explicit. |
| `clan_roles` / `clan_permissions` | owner-defined internal ranks and permission keys; cannot grant platform/course permissions. |
| `clan_name_changes` | clan, owner, consumed Rename Clan item, previous/new name, moderation result and audit. |
| `clan_exp_ledger` | clan, signed delta, source mission/war, idempotency key, timestamp. Clan level is derived from Admin-configured thresholds. |
| `clan_missions` / `clan_wars` / `clan_competition_awards` | Admin-created system events, versioned rules, eligibility, schedule, scoring, tie-break/split rules, rewards and approvals. Code/writing competitions snapshot per-participant EXP/Coin/shop-item rewards and record one award per active member selected from either competing clan. Staff may submit event-type proposals; Admin configures reward policy at approval. |
| `clan_effect_policies` | Admin-managed level thresholds, member caps, icon/color/name and owner visual effects. |

One user belongs to at most one active clan; member caps are Admin-managed. Create Clan and Rename Clan cards are Coin-priced by Admin. Clan name is shown in profile/hover; level-based clan icon appears by nickname with a distinct owner effect. Clan leaderboard is system-wide and ranks by Clan EXP. Peer marketplace uses escrow; no direct Coin transfer endpoint exists.

## 10. Notifications, acknowledgements, analytics

| Entity | Important fields and constraints |
|---|---|
| `notification_templates` | Admin-managed versioned localized templates, event key, mandatory/optional classification, allowed channels. |
| `notifications` | recipient, event reference, severity, channel policy, rendered payload, created/expiry times, read state. Avoid including secrets or unnecessary PII. |
| `notification_deliveries` | notification/channel, delivery state, attempts, provider response summary; no sensitive provider credentials. |
| `notification_acknowledgements` | notification/recipient, acknowledged timestamp. Critical notices require in-app popup acknowledgement; ordinary acknowledgement is optional. Critical notices do not send email in the initial policy. |
| `dashboard_layouts` | user/role, widget order/visibility and version; validate widget allowlist and permissions server-side. |
| `analytics_snapshots` | course/faculty/time bucket and aggregate counts only. Drill-down queries re-check permission; research exports are anonymized. |

### Local implementation reconciliation — BUILD-032, migration 0049

The local runtime currently represents the logical notification entities as `notification_templates` (immutable localized versions), `notification_preferences` (per-user locale and nonessential-email opt-out), `notifications` (sender, event, scope, severity, idempotency digest and acknowledgement policy), and `notification_recipients` (rendered locale/body snapshot, read/ack timestamps, email state/attempt count/retry time/error code). This is intentionally recipient-scoped rather than storing a single recipient on the notification. Critical/emergency notices require in-app acknowledgement and suppress email. Email delivery is an explicit STARTTLS worker with bounded retry; provider credentials and message bodies are not logged. Authenticated clients now subscribe to Socket.IO generic invalidation hints and refetch the authoritative recipient-scoped API; the outbox dispatcher validates audit envelopes and never publishes private details or runner payloads. Redis live cross-instance acceptance remains pending.

Dashboards default to the product-defined widget order and chart windows; per-user layouts are preferences, never authorization. Operational health details are Admin/ops-only.

The individual Student Learning Overview is computed from authoritative memberships, attendance, lesson completion, practice attempts, assessment recipients/submissions/grades, and activity records; it is not sourced from cross-user aggregate snapshots. Do not cache student-level results across principals. Any request cache must include caller, effective course/field permissions, filters, and source versions in its key and must be invalidated/re-authorized after access changes.

## 11. Audit, retention, and event delivery

| Entity | Important fields and constraints |
|---|---|
| `audit_log` | actor/system, action, entity type/ID, timestamp, request/correlation ID, reason, redacted before/after summary, IP where policy permits. Append-only; export and retention actions are themselves audited. |
| `retention_policies` | data class, retention interval, default/effective version, legal-hold behavior, anonymization/deletion method. General audit default is one year; exam logs default 90 days. |
| `legal_holds` | case/resource, reason, actor, start/end/release; prevents retention cleanup while open. |
| `outbox_events` | event ID, aggregate/version, event type, minimal payload, occurred/available times, attempt count, delivery state/error summary. Written in same transaction as the business change. |
| `processed_events` | consumer/event ID unique key and processed timestamp for idempotent handlers. |

Realtime dispatch is implemented by API instances claiming pending PostgreSQL outbox rows with `FOR UPDATE SKIP LOCKED`, then publishing minimal invalidation hints through the Redis-backed Socket.IO manager. Runner dispatch uses a separate at-least-once outbox publisher and consumer group. The consumer reclaims pending entries, verifies each stream payload against PostgreSQL, records a unique durable job receipt before acknowledgement, and routes invalid envelopes to a metadata-only dead-letter stream. Migration 0014 adds unique job/outbox/idempotency identities and one result per job; the result helper treats identical retries as idempotent and rejects conflicting results. The consumer does not execute code and result ingestion is not exposed as an authenticated service endpoint. Redis remains rebuildable infrastructure, not the source of truth. Realtime notifications are best-effort hints; clients recover authoritative state through Core APIs. Runner payloads must never be exposed through realtime. Production runner dispatch still requires queue-specific persistence/ACL/retention, monitoring/alerts, operational recovery, and deployment approval.

## 12. Integrity, authorization, and indexes

- Use append-only ledgers for EXP, Coin, Clan EXP, grade changes, audit, and exam actions. Correct with compensating entries; never rewrite financial/progression history.
- Every ledger award has a unique idempotency key and trusted source event. Client-supplied values cannot award or spend balances without an authorized domain command.
- Use immutable content, question, assessment, rubric, grade-scheme, runtime, rank, mission, and item versions. Historical submissions retain exact version references.
- Add composite foreign keys so submissions can reference only a question version in that assessment snapshot and only eligible recipients.
- Enforce one active course owner, one active clan membership per user, one equipped title, one active non-stacking discount per item, and valid rank-threshold ordering.
- Validate category/tag cycles and tag applicability. Merge/retire preserves historical references.
- Index normalized identity keys, course membership/status, assessment recipient/state, submissions by course/student/assessment, event time/user, ledger user/time, outbox readiness, and taxonomy junctions. Add JSONB indexes only for demonstrated query plans.
- Enforce course/role permissions in Core on every command and query; UI filters and FK integrity do not provide authorization.
- Use optimistic concurrency/version tokens for admin policy, taxonomy, question, grade scheme, mission, and inventory edits.
- Keep hidden answers, reference solutions, hidden tests, credentials, exam evidence, and private submissions behind explicit server-side authorization; never include them in public question DTOs.

## 13. API contract reconciliation and remaining design gates

Initial API boundaries are specified in [`API_CONTRACTS.md`](./API_CONTRACTS.md) and machine-readable [`openapi.yaml`](./openapi.yaml), including access policy, all question formats, private authoring configuration, assessment delivery/grading, courses, CSV, attendance, exam incidents/appeals, economy/clans, achievements, reports, and notifications. Routes do not imply runtime implementation.

Before migration/runtime implementation:

1. Select PostgreSQL version, migration tooling, object storage, media scanning, backup/restore, and retention job design.
2. Implement the selected runner and validate OS/container isolation, network/filesystem restrictions, resource enforcement, queue separation, and result sanitization against [`CODE_RUNNER_THREAT_MODEL.md`](../../CODE_RUNNER_THREAT_MODEL.md); JSON Schema policy flags alone do not ensure isolation.
3. Define exact limits where intentionally configurable: password/MFA policy, CSV size/retention, attempts/late submissions, exam signal thresholds, shop/market caps, and supported locale/timezone sets.
4. Add exhaustive executable semantic tests for cross-record rules that JSON Schema/OpenAPI cannot express: question child membership, test/criterion point totals, allowed runtime selection, transaction atomicity, authorization, idempotency, and retention/legal hold.
5. Select tooling to lint/diff the OpenAPI contract in CI and derive executable migrations only after the above decisions are approved.

No runtime, SQL migration, HTTP endpoint, or user interface is implemented by this logical specification.

## 14. Local BUILD-026 self-service reconciliation — 2026-11-15

The separate local implementation at `cyb3rt1tan-lms` now has additive migration `0006_identity_self_service`. This is implementation evidence for the following subset, not completion of all entities in this logical model:

- `users.nickname_key`: unique NFKC/casefold normalized key; `nickname_changed_at`: UTC time used for the configured change cooldown. A conflicting legacy normalized nickname aborts migration rather than renaming users silently.
- `user_profiles`: one private profile per user; separate contact email/phone, plain-text biography/academic title and course staff email opt-in. Official identity/roles are immutable through self-service commands; updates participate in `users.revision`.
- `identity_policy`: singleton versioned nickname cooldown and blocked-term policy, Admin-only updates with a reason.
- `password_resets`: one-time random token digest, credential-hash/email digests, expiry, delivered/consumed/revoked state and user reference. No raw password, raw token or mail content is staged. Resend revokes older tokens; successful redemption and credential/access revocations invalidate pending tokens. SMTP is sent from process memory after the generic response; undelivered tokens cannot be redeemed.
- Profile and recovery mutations use the existing transactional audit/outbox. Outbox remains metadata-only. Personal session DTOs expose public UUIDs and times, never session/CSRF digests.

Protected avatars, course-scoped staff profile projection, expanded CSV/provisioning and identifying exports remain local BUILD-026 work. See the execution report rather than inferring completion from schema or contract presence.

### Local provisioning reconciliation — 2026-11-15, migration 0007

The subsequent local increment implements `users.faculty_id` and indexed `provisioning_source`, import kind/template version, enrollment revision/source/join/end metadata and actor-owned `account_exports` manifests. Existing unknown source/dates stay legacy/NULL; a bootstrap source is backfilled only from a matching bootstrap audit event. No credential or historical audit data is rewritten.

Account CSV v1 stays compatible; v2 adds faculty/course/section. Enrollment CSV v1 supports existing Student accounts and is available to Admin/Administrative Assistant without granting unrelated course/submission/grade/export access. Preview snapshots include account, course and membership revisions; commits serialize with identity/course mutations and revalidate before atomic application. No raw CSV, source filename or identifying row values are staged.

Export manifests persist selected UUIDs/revisions and non-identifying filter metadata, excluding search text, raw PII and file content. Admin preparation and each fresh authorized download are audited; downloads are requester-owned, expire after 15 minutes and fail on changed/missing records. CSV protects spreadsheet formulas; XLSX contains inline text, no formulas/macros/external relationships. Exports exclude credentials, MFA, private profile contacts, grades and submissions. Expiry controls access, not retention deletion; cleanup/retention remains a BUILD-033 operational gate.
