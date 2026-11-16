# Product Requirements

Status: **Captured from product-owner decisions; specification only**

This document records the currently agreed user-facing behavior for the LMS. It complements the initial logical model and architecture documents; it does not mean these features have been implemented. Where this document conflicts with an earlier scaffold/example, this document is the current product direction. Security, permission, and audit requirements apply to both UI and API.

## 1. Roles, accounts, and identity

### Global roles

The initial system roles are `Student`, `Teacher`, `TA`, `Admin`, `Administrative Assistant`, and `Research Assistant`. A user may hold multiple roles. System roles are fixed rather than user-created; course-level permissions are granted separately.

- **Administrative Assistant:** may support user profiles and enrollment workflows. Access to student submissions and grades is denied unless a separate permission is explicitly granted.
- **Research Assistant:** may access only approved, anonymized research data by default; no direct access to identifying information, grades, or submitted work.
- **Teacher/TA:** course membership and granular course permissions limit access and actions. One Teacher is the course owner; co-instructors and TAs may be added.
- Privileged role/permission changes are audited.

### Authentication and account provisioning

- No SSO or Moodle integration is planned for the initial release.
- Admins create and update accounts through manually uploaded CSV files. New users receive an email invitation to set their own password; password reset and MFA are supported.
- MFA is optional for users unless Admin requires it for a role.
- CSV templates cover username, email, official name, student/employee ID, role, faculty, course, and group/section as applicable. Imports have preview, row-level validation, duplicate handling (`upsert` or `skip`), and an audit record.
- Match existing users by stable institutional ID first and username second. Email alone must not silently merge accounts.
- CSV is authoritative for account/enrollment data initially. Any future connector must declare its authoritative source per data type before synchronization is enabled. Moodle is explicitly deferred.
- Admin account search supports official name, email, username, student/employee ID, role, status, course, and import/sync source.
- Deactivate/suspend accounts rather than hard-delete them; retain learning and audit history and permit authorized restoration.
- Admin may suspend an account, revoke sessions, or reset MFA with a required reason. Admin must not see or set a user's password.
- Authorized CSV/XLSX exports are supported; exports of identifying data are audited.

### Profiles and display identity

- Student official name, student ID, and institutional email are system-managed and cannot be changed by the student. The official name is used in exams and official records.
- Users may set a profile image, contact details where permitted, and a **unique system-wide nickname**. Nicknames are filtered and changes may have an Admin-configured cooldown.
- Student leaderboards use nickname and practice score only; they do not expose student ID or email.
- Staff profiles in a course may display academic title, name, photo, role, and courses; email visibility follows the user's privacy setting.

## 2. Teacher/TA experience

### Dashboard

The default block order is:

1. System overview: courses participated in, students, questions and assessments created, with all-time totals and time/course filters.
2. Course overview.
3. Items requiring attention.
4. Recent activity and charts.

Charts include submissions/grading trends (default 30 days), course progress/grades (current term), comparisons of active courses, and student/content growth (default 12 months). Recent activity focuses on new submissions and grading-status changes. Time filters may be changed. Users may drag, hide, or show blocks; layout is saved per account.

Items requiring attention include submissions awaiting grading/regrading, upcoming/overdue assignments and exams, draft content needing work, students with low activity/results, and creating an exam from a lesson plan. Dashboard entries link to detail workflows; no consequential operation is performed directly there.

TA overview may show system-wide aggregated metrics, but a TA may act only in courses and groups where they have permission.

### Course list and detail

- Course list supports table/card views, search, sort, and filters by status, term/time, staff assignment, and lesson-plan completion.
- Cards/rows show course title/code/status/dates, student/staff counts, lesson-plan and assessment progress. Default scope is assigned courses; a Teacher also sees courses they own.
- Authorized staff may open, create, edit, and archive courses. Archive preserves submissions, grades, and history; no hard deletion.
- Course detail uses tabs: **Overview, Lesson plan, Assessments, Students, Settings**.
- Navigation uses **Course**; academic details use **Module** terminology. Academic labels are English.

The Overview/Module specification includes:

- **Module Overview:** Faculty, Module Code, Module Name, Level, Unit of Credit, Prerequisites, Suggested Study Hours, Year, Nature of Module, Module Objectives.
- **Teaching Team:** title and name (for example, MSc. Nguyen Van A), email, and role (Teacher/Tutor).
- **Learning Resources:** title, note, coverage.
- **Useful URLs:** LMS portal, GitHub, and other relevant links.
- **Assessment Scheme:** assessment type, assessment name, weight, description, and determination of final grade.
- **Teaching Schedule:** week, topics, content, reading, and linked assessments.
- **Required Software/IDE.**

Course owner edits academic overview and lesson plan; TAs view these areas unless separately authorized. Grade schemes use an Admin-configured weighted-sum formula and conversion scale. Published weights must sum to 100%.

### Lesson plan and schedule

- Lesson plans are organized by week/session and include topic, content, reading, linked assessment, learning outcomes, and estimated study/teaching hours.
- Assessment creation is separate; creating an assessment from a lesson plan does not automatically prefill or link data. Staff may link them manually.
- Schedule has Calendar and List views. Sessions support recurring schedules and exceptions (cancellation, rescheduling, room changes) and may link to lesson-plan entries.
- Course owners edit lesson plans; TA access is read-only unless separately granted.

### Students, grades, and attendance

- Student page has **Overview** and **Roster** modes.
- Overview includes lesson completion/activity, assessment grades, and practice analytics.
- Roster includes student ID, official name, email, enrollment status/date, section, progress/activity, grade by assessment, average, pending/overdue submissions, and alerts. It supports authorized export, notifications, enrollment management, and attendance actions.
- Admin and course-authorized Teachers/TAs can open a consolidated **Student Learning Overview** for an individual student. It shows current and historical course enrollments (with filters), course-by-course attendance, lesson progress, practice activity, assessments, and recent learning activity. It is a read-only view; actions such as changing attendance, grades, or enrollment stay in their audited workflows.
- For each course, show membership/status and dates; scheduled/eligible attendance sessions and Present/Late/Absent/Excused/unrecorded counts with attendance rate and session drill-down; unique practice questions attempted, total attempts, completions/passes and accuracy; lesson completion/progress; and assessments assigned, started, submitted, graded, pending grading, missing/overdue, plus available results and last activity. Assessment detail includes title/type, due/submission state, grading state, and score/max score when the viewer is permitted to see it. Time-range and course filters must be available; aggregate values must use the selected period consistently and identify their period.
- Admin can view across all courses subject to system policy. A Teacher/TA sees only courses where they have active staff membership and the required course permissions; inaccessible courses and their counts are not disclosed. The `roster` permission allows identity and learning-activity summaries. Attendance session-level detail requires `attendance`; unpublished scores, submitted work, and private feedback require `grading`; exam-monitoring details require `examMonitoring`. Published results are visible according to course roster policy. The API rechecks these scopes for each course and field.
- Student profile contains identity/enrollment, activity timeline, lesson progress, submissions, published assessment grades/feedback/change history, and internal staff notes. Assigned Teachers/TAs can view notes; students cannot. Staff access to submissions and private notes remains course-scoped and permission-checked.
- Attendance is tracked per scheduled session and summarized for the course. Statuses are `Present`, `Late`, `Absent`, and `Excused`.
- Staff may mark attendance manually or use expiring QR/token check-in. No GPS is collected. Late grace periods are configurable. Changes after attendance is closed require a reason and are audited.
- At attendance close, eligible enrolled students without a valid check-in become Absent. Students may request Excused status before the check-in window closes; staff approval is required. Requests already submitted remain pending after close.
- A TA may grade only when the course Teacher grants grading permission. All grade changes are audited. Students see grades/feedback only after `Published`.

### Course permissions and lifecycle

- A course has one Teacher owner; it may have co-instructors and TAs.
- TAs receive granular, revocable permissions (for example roster, grading, assessment management, exam monitoring). Admin can provide reusable permission templates; course owners grant permissions within policy.
- Sensitive course permissions may have an expiry, including exam monitoring, grading, and data export.
- Admin sets system defaults for academic terms, module codes, enrollment, and grading scales. Course owners may customize allowed settings.
- Admin maintains a versioned shared Course Rules template for all courses. It provides student-facing starting rules for attendance, assignment submission, practice, assessments, classroom conduct, and communication. Admin changes to the active template apply as the new defaults across courses; a course's explicit overrides remain in force.
- A course owner or co-instructor with `course.rules.manage` may override or disable a default rule for that course and add course-specific rules. They cannot modify the shared Admin template. Students see the effective published rules for each course, with the most recent version and publication date.
- Rules are explanatory course policy text, not executable controls. Attendance windows, deadlines, grading, and exam behavior continue to be enforced by their dedicated course/assessment settings. Rule edits are versioned and audited; older effective versions remain available for history.
- Students may be invited by email/ID, imported by CSV, or join using a managed course code. Join codes support expiry, use limits, and revocation.

### Platform branding

- Admin may replace the platform logo. The Admin upload flow accepts a local image, opens an accessible crop tool, and previews a square 1:1 crop before saving. Provide zoom/reposition controls and guidance to center the mark with safe padding; the crop output is a 1024 × 1024 PNG used for the app mark/favicon.
- The crop UI uses browser-native image/canvas capabilities and local assets; uploaded files are not sent to any third-party service. Accept PNG, JPEG, or WebP as source input, but submit only the cropped PNG.
- The server validates file signature, decoded dimensions, and size; strips metadata and re-encodes the approved output. Reject SVG, animated images, malformed files, oversized/pixel-bomb images, and extension/MIME mismatches. Keep prior logo versions for audit/rollback and serve the active logo from this application's same-origin asset route.
- Only Admin may change platform branding. Upload and activation are audited. The initial Admin feature is logo replacement; arbitrary CSS/theme injection and external image URLs are not supported.

## 3. Question bank and assessment authoring

### Taxonomy and question bank

- Each question has one primary **Category** (categories may have parent/child hierarchy) and may have multiple **Tags**.
- Category filters offer an explicit option to include subcategories. Tag hierarchy does not automatically apply child/parent tags.
- Admin can create, rename, reorder, re-parent, merge, or retire categories/tags; show usage counts; preserve IDs and references; and prevent cycles. Referenced taxonomy entries are not hard-deleted.
- Question bank is a searchable table filtered by category, multiple tags, difficulty, language, and status. Rows show title, tags/category, language, difficulty, and number of assessment uses.
- A course-published question is shared among all course Teachers. Any course Teacher may edit the shared question. Editing creates a new version; future assessments use the new version while already-published assessments retain their exact question-version snapshot.
- A code question must include a reference solution and pass its author-side test validation before publication. Without a valid solution it may be saved only as Draft. No additional Admin approval is required for a validated course question; Admin may inspect or retire it.

### Supported question formats

1. **Code:** Class, Method, or Program.
2. **Writing:** free response with a manual rubric.
3. **Sentence Rewriting:** multiple accepted equivalent answers.
4. **Multiple Choice:** one correct answer.
5. **Multiple Select:** multiple correct answers.
6. **Short Answer / Fill in the Blank.**
7. **Matching:** including matching columns, headings, or information.
8. **Ordering / Sequence.**
9. **True / False / Not Given.**
10. **Reading Set:** one passage shared by multiple child questions.
11. **Listening Set:** one audio passage shared by multiple child questions.

Speaking is not in the initial scope. Reading/Listening sets may contain child questions using supported objective formats. Child questions have their own points and may use partial credit at pair/blank level or all-or-nothing scoring.

### Code question form and execution

- The local author-validation utility supports C, Java, and Python. C++ is not supported by the initial Local Autograder.
- Local code validation is for trusted author-owned examples/reference solutions and trusted test harnesses only. It requires an explicit operator confirmation and runs with the developer's operating-system permissions. It is not a sandbox, is not connected to the LMS/API/UI, and must never execute student submissions or other untrusted code.
- Student code submission execution and automated grading are disabled in the initial release. Do not deploy or invoke a same-process executor as a substitute. Any future service that executes learner code requires a separate product/security decision; the former gVisor proposal in ADR-0008 is not an active build requirement.
- The local tool selects its C compiler, JDK, or Python interpreter from the developer's environment; it does not use or activate LMS runtime profiles. Its timeout, output, and temporary-directory controls are not isolation guarantees.
- Form fields include title, category, tags, difficulty, language/runtime, and usage type (`Practice`, `Practical`, `Exam`).
- The product may present code prompts and collect source text/files, but must not execute student-provided source in the initial release. Do not represent a source upload as automatically graded.
- Trusted local author-validation supports Input/Output, unit-test harnesses, and source-structure checks. Java author tests may use Reflection, runtime annotations, annotation processors, Dynamic Proxy, Generic type metadata, custom ClassLoaders, and Java Compiler API from the installed JDK.
- The reusable library also provides non-executing static policy checks for configured import allow/deny lists, forbidden symbols, and source patterns. Authors must define policy rules from explicit assignment constraints. These checks are heuristic, can miss obfuscated/indirect/runtime behavior, and cannot prove that source is benign or follows all semantic requirements. A passing static report is not permission to execute untrusted code.
- Local compile/runtime/time-limit failures are reported distinctly from wrong answers. Local results are development feedback only and do not create or publish LMS grades.
- Test cases may use structured input/output or a code snippet run in the test harness (for example, a snippet inserted into `main()`); each has expected output and may have a point value.
- Test cases support `use as example` and display modes: `show`, `hide`, `hide if fail`, `hide if success`.
- Class/Method templates may wrap the submitted answer in a configurable harness. Java Class requirements may validate package presence/name, class name, attributes and constraints (type, mutable/setter, optional/constructors, min/max/length/pattern), constructors, getters, setters, validators, `toString()`, comparators, and configured exceptions. Additional methods/behavior are checked through tests. Simpler templates are preferred when they satisfy the question.
- A configurable Check button may be shown. Authors can set a fixed point penalty per incorrect Check, with a score floor of zero.
- Default code scoring grants points per test case; authors may choose all-or-nothing. Hidden tests and reference solution are never returned to students.
- Practice questions are automatically available to all enrolled students in the course/cohort, allow unlimited attempts, and do not contribute to official course grades unless explicitly added to an assessment.
- Practice leaderboard points may use accuracy, time, and attempts under a published, course-configurable formula. There is no daily practice-attempt cap; streak rewards may be configured.
- Reference solutions are visible to Teachers and TAs with authoring permission only. Students see only allowed test feedback/hints.

### Other question formats

- **Writing:** criteria have point values and checkbox scoring (checked = full criterion points, unchecked = zero). Authorized graders may override criterion or total score with a note/reason. Editing a rubric recalculates already-graded work, preserves old/new score history, and notifies the grader. No separate student notification is sent for rubric-driven recalculation; the published grade history remains visible.
- **Sentence Rewriting:** authors supply multiple valid answers. Optional Check compares normalized answers using per-question normalization rules; incorrect characters are highlighted against the nearest accepted answer.
- **Multiple Select:** defaults to all-or-nothing; author may enable partial credit and configure deductions for incorrect selections.
- **Short Answer/Fill in the Blank:** multiple accepted answers; normalization may ignore case, extra whitespace, or punctuation. Fuzzy matching is opt-in per question.
- **Matching:** supports drag/drop and accessible dropdown/pair-selection interaction. Authors may randomize choices.
- **Listening:** audio is uploaded to the set; play count (for example one or two plays) is configurable per attempt. Transcript is hidden by default and may be enabled for an approved accommodation. Review playback follows assessment policy.

## 4. Student experience

### Dashboard and course pages

- Student Dashboard order: **Learning progress → To-do → Published grades/feedback**.
- Progress highlights course/module and completed lessons. To-do shows upcoming/overdue assignments, scheduled/open exams, and in-progress work with a continue action.
- Course tabs: **Overview, Lesson plan, Practice, Assessments, Grades, Leaderboard**.
- Lesson completion rules are configurable by the Teacher and may require marking complete, viewing content, or completing a quiz.
- Grades show only Published assessment results, weighted breakdown/final grade, feedback/rubric, and published grade-change history.
- Students may request grade review within an Admin-configured window for an assessment.
- Students see attendance by session and course-level attendance summary.
- General notifications support in-app and email; users may opt out of nonessential email. Security and required assessment/grade notices are mandatory.

### Practice, rankings, and achievements

- Practice has both a lesson-plan path and a searchable library with category/tag/difficulty filters and status (not started/in progress/completed).
- Leaderboards include a course total and question-level boards; question-level boards are version-specific. The score formula includes accuracy, time, and attempts, is configurable per course, and is disclosed to users.
- Public boards show nickname and score. Time/attempt details are visible only to the learner and authorized staff.
- Student rank and staff rank use separate Admin-managed tier lists but both derive from EXP. There are no seasons. Rank is recalculated from current EXP; spending/deducting EXP can lower rank.
- Student rank names are an Admin-managed academic-style set, separate from the English League-style staff ranks.
- Student achievement showcase displays unlocked and locked achievements with criteria/progress, unlock history, reward, tier, and visual effect. User may equip one title above their nickname; clan icon is shown separately.
- Admin defines achievement event criteria, tiers, reward, and effects. Examples include first question leaderboard win and repeated first-place finishes.
- Staff leaderboard is system-wide and visible to all users. Students see staff name and rank only; EXP/task details are restricted to staff/Admin.
- Student leaderboard shows nickname and practice score, not official identity.
- Nickname is unique system-wide, moderated, and subject to an Admin-configured change cooldown.

### Profile and settings

Settings include Profile, Security/MFA/Sessions, Notifications, Language/Timezone, and Accessibility.

- Accessibility preferences include larger text, high contrast, reduced motion, keyboard navigation, and captions/transcripts where available.
- User timezone affects display only; exam deadlines and mission resets use configured course/system timezones.
- Official identity remains unchanged by editing nickname/profile preferences.

## 5. Assessment and exam delivery

### Assessment lifecycle and grading

- Assessment categories/types are Admin-managed; each Module selects applicable types (for example Internals and Final Exam).
- Assessment list groups by type and shows weight, description, due date/status, submissions, grading progress, and average score.
- Lifecycle: `Draft → Scheduled → Open → Closed → Grading → Published`.
- Supports code, objective quiz, writing/project/file/link submission, and manually graded in-person assessment.
- Code and quiz may be auto-graded; file/project work is manually graded. Teachers may override a grade with a reason; all changes are audited.
- Final grade is the configured weighted sum. Published grade-scheme weights must total 100%; conversion scales are Admin-managed.

### Exam timing and question delivery

- Exam has an open/close window and a per-student duration. A student may start any time before close, even after the initial open time.
- Questions may be fixed or randomized from the bank using tags, difficulty, and points. Assignment snapshots preserve versions.
- Author may configure one or more remaining-time notifications (for example 10 and 5 minutes) or disable them.
- Student exam UI has question navigation, mark-for-review, countdown, autosave status, and a persistent submit control. Submission confirmation shows unanswered questions; time expiry auto-submits the last autosaved state.
- Autosave recovers after reconnect and displays last saved time.
- Before starting, the student must acknowledge exam rules, monitored signals, possible actions/penalties, time limits, and data-retention policy.
- Approved accommodations (extra time or event exceptions) may be configured per student before the exam and audited.

### Monitoring, incident handling, and privacy

- No webcam or microphone monitoring in the initial scope. Research a lockdown browser as a later option; ordinary browser pages cannot reliably enumerate installed extensions.
- Log observable signals only: tab/window focus changes, fullscreen exit, connection loss/reconnect, session/device change, and clipboard actions where technically available. These are signals, not proof of cheating.
- Monitor shows student ID, official name, observed IP, browser/OS, exam state, connection status, time remaining, and alerts. Hostname is shown only if a managed client can provide it.
- Table supports filters and a detail panel with event timeline/logs. Serious events produce realtime alerts to course Teachers/Admin; TAs receive them only with monitoring permission. Duplicate alerts are grouped.
- All events are logged. Repeated-event thresholds and suggested actions (time deduction, percentage score deduction, freeze/lock, or early submit) are configured per exam and disclosed before the exam.
- System suggests a penalty; Teacher/Admin confirms before applying it. Applied action is shown immediately to the student with reason and linked events.
- Monitor actions: inspect logs, notify student, adjust time, freeze/lock work, or force-submit. Lock/freeze and early submit require confirmation, reason, linked evidence, and autosave of current work.
- While an assessment is open, an Admin or a Teacher assigned to that course may reset one student's in-progress attempt's work from the exam monitor, with a required reason. The student's answers are cleared so they can redo the work in the same attempt; the attempt remains in progress and its original deadline/countdown continues unchanged. This does not create another attempt or grant a reset to TAs.
- Preserve the pre-reset answers and reset history for audit/review; do not delete the answer history. Advance the attempt's answer revision so stale clients cannot restore pre-reset answers. Keep the published question snapshot, attempt count, and original timer/deadline unchanged, and notify the student that their work was reset.
- During system incidents, authorized staff may pause/resume the whole exam or grant audited bulk time extensions.
- Network loss is logged and may alert, but does not automatically penalize or lock a student before a configured threshold/authorized decision.
- Students may appeal penalty/lock/early-submit decisions within an Admin-configured window; cases link to logs and are retained through the appeal/legal-hold period.
- Exam logs default to 90-day retention, configurable by Admin. Logs connected to an open appeal/disciplinary case are held until the case closes, then retained/anonymized per policy.
- Incident reports summarize signals, decisions, reasons, and appeal status; they do not automatically conclude that misconduct occurred.

## 6. EXP, Coin, ranks, shop, marketplace, and clans

### EXP, ranks, and missions

- All roles earn EXP and Coin. EXP drives two separate rank tracks: Student and staff (Teacher, TA, Admin and other staff roles); each track has its own Admin-managed tiers.
- Rank tiers configure English/display name, threshold, icon/color, order, description, and role-specific criteria. Staff promotion tasks may differ by role. Admin validates increasing thresholds and previews rank changes.
- Student rank follows its EXP threshold. Staff rank requires the configured EXP threshold and any required tasks for that staff role.
- EXP is a single balance: spending EXP on items reduces rank when it crosses a threshold. Corrections/deductions use an append-only, reasoned ledger; rank updates immediately and is audited.
- No seasonal reset. EXP/rank accumulate over time.
- Admin creates global daily/weekly missions, one-time achievements, and limited-time system events. Missions can be shared or role-specific. Staff may create course events using their Coin; global staff events require Admin approval.
- Events may grant EXP, Coin, both, or neither. Regular mission rewards are automatic; event winners are determined by configured system activity and approved by the organizer/staff before payout.
- Admin configures reward values, event triggers, repeat/idempotency rules, cooldowns, streak thresholds/windows, and timezone. Practice has no daily reward cap; streaks may reward repeated success within configured windows and restart cycles. A failed activity resets only its matching streak, not prior rewards.
- Reward values are configurable per mission/event. No aggregate EXP/Coin issuance cap was selected.
- Daily/weekly resets use Admin-configured system/course timezone. Mission changes are versioned and apply from the next cycle; active progress uses the previous version.
- EXP and Coin rewards are ledgered. Coin has no expiry.

### Store and inventory

- One system-wide shop serves all roles. Initial items prioritize cosmetics (avatar/frame/title/theme) and learning aids (practice packs/hints); learning aids do not alter official assessment results.
- Admin may create only supported effect types, not arbitrary scripts: timed EXP multiplier, mission-specific streak boost, EXP voucher, Create Clan, Rename Clan, and title item.
- EXP multiplier items (for example x2 for 8h/24h) multiply all eligible EXP sources, not Coin; bonus EXP counts toward rank. Multipliers extend duration when reused but remain capped at x2.
- Streak boost cards select a mission and duration, set streak progress to 3, and do not grant reward until the next qualifying action. Expiry removes only progress granted by the card, not a pre-existing achieved streak. Admin may add durations and supported mission targets.
- EXP vouchers grant the configured amount (for example 1,000 or 10,000 EXP).
- Title items (for example, **Big Spender / Đại gia chính hiệu**) may cost Coin, EXP, or both; if both are configured, both balances are charged. Purchased titles are equipable in the one active title slot.
- Each item configures price/currency, eligible roles, duration, stock/sale window, per-account purchase limit, and tradeable/bound state. Role-limited items are account-bound. Cosmetic items default to bound unless Admin explicitly changes the policy.
- Admin may schedule one non-stacking discount per item with start/end time. Store shows the original price struck through and highlighted discounted price.
- Store purchases follow an Admin-defined refund policy.

### Peer marketplace and event prizes

- Users trade Coin and eligible items through offers/escrow; no unescrowed direct transfer. Initial marketplace supports fixed-price listings and item/Coin offers.
- Funds/items are reserved while an offer is open. Accepted offers settle atomically; canceled/expired offers return reserved assets. All transactions use an auditable ledger.
- Admin configures fee by transaction type, price/volume limits, listing expiry, and dispute freeze tools. Fee is deducted from the seller/offer originator's proceeds and burned. Fee is shown before confirmation.
- Role-restricted items are not transferable. Admin may set other items tradeable or bound.
- Admin may freeze assets and resolve disputes through compensating ledger entries; original transactions are never deleted.
- Shop errors may be refunded under policy. Completed peer trades are not self-cancelable; disputes are handled by Admin.
- Teacher/TA-created course events escrow their total Coin prize budget at creation. Winner payout is made after approval; canceling an event returns the reserve. Insufficient balance prevents creation.
- Event ties follow organizer-defined tie-break/split rules, chosen after the event (unless event rules specify otherwise).

### Clans

- A user may belong to one clan at a time. Clan creation requires a Coin-purchased card priced by Admin; Admin configures member caps.
- Owner may invite members and approve join requests. Owner can configure internal clan ranks and permissions (membership management, activities, etc.); clan permissions never grant platform-wide authority.
- Clan name changes require a Coin-purchased Rename Clan card; only the owner may use it. Names must be unique and pass content moderation.
- Clan EXP comes from Admin-configured missions and Clan Wars. Admin creates system-wide clan missions/wars; staff may propose events for Admin approval. Code and writing competitions may award Clan EXP and participant EXP, Coin, or supported shop items.
- Admin configures Clan EXP thresholds, level, member cap, and level-based name/icon effects. The owner has a distinct level-based visual. Default UI shows the clan icon by the nickname and clan name in profile/hover.
- Global clan leaderboard ranks by accumulated Clan EXP and shows level, member count, and war record.

## 7. Admin surfaces, reports, and notifications

### Admin dashboard

Default order: **System overview → Items requiring attention → Economy**. Overview includes users by role/status, active courses/modules, enrollment, activity, content, assessments, and grading progress. Operational health widgets cover API, database, Redis/queue, realtime workers, and sync status and link to diagnostics. Charts default to 30-day activity/submissions, 12-month user/course growth, and current-term grading, with filters by time/faculty/course.

Attention items are severity/time sorted and link to audited workflows; sensitive actions are not executed directly on the dashboard. Economy shows aggregate EXP issued/deducted, Coin issued/burned/fees, balance distribution, and suspicious transactions; drill-down is permissioned. Admin dashboard layout is saved per account.

### Admin course and user management

- Admin course table covers all courses with faculty, module code, term, owner, status, enrollment, archive/restore, and detail page.
- Course detail tabs: Overview, Academic/Module details, Staff & Permissions, Enrollments, Grade Scheme, Integrations, Audit.
- Admin may edit course metadata, reassign owner, manage staff/student membership, and archive/restore; actions are audited.
- Admin account detail tabs: Overview, Roles & Access, Courses, Security, Audit.
- Admin may assign fixed global roles and course permissions, view security/session state, revoke sessions, and reset MFA with a reason. No password viewing/reset by setting a password.

### Taxonomy, question, runtime administration

- Admin manages separate category hierarchy and tags with usage counts, retirement, merge/re-parent safeguards, and optional include-subcategories filtering.
- Validated course questions publish without Admin approval; Admin may inspect/retire.
- Runtime administration manages versioned approved profiles: language/version, compiler image, allowlisted libraries, time/memory limits, support status, and end-of-life. Lifecycle is Draft → Test → Active → Deprecated. A profile must pass standard tests before use. New profiles do not silently change existing question versions.

### Reports, audit, retention

- Reports are available to Admin and permission-authorized course staff. They cover enrollment/course activity, per-student learning progress, assessment/grading, attendance, exam incidents, and rank/EXP/Coin. The interactive Student Learning Overview is available directly from the roster/profile; CSV/XLSX student-progress exports use the same permission and field-visibility rules.
- Reports export CSV/XLSX with access controls. Research exports are anonymized. PII exports are audited.
- Student-progress reports may filter by one student, course, and time range. Exports must state the reporting period, distinguish zero activity from unavailable/not-authorized data, and reauthorize the requester and every included course/field at job creation and download. A report job must not preserve access after staff membership/permission is revoked.
- Audit log is append-only and searchable by actor/action/entity/time/course/IP, with before/after diff, reason, and correlation ID. Exporting audit data is itself audited.
- General audit retention is configurable, default one year; retention jobs delete/anonymize according to policy and write an audit event. Admins cannot manually edit/delete individual audit records.
- Exam logs default to 90 days, with legal hold for active appeals/cases as described above.
- Admin operations on balances, fees, freezes, reversals, or large rewards require audit; a single authorized Admin may execute them (dual approval was not selected).

### Notifications and global settings

- Admin manages email, in-app, realtime/popup channels, templates, locale, and event-level policy; course policies may customize within global limits.
- General notifications use in-app and email; users may opt out of nonessential email. Emergency notices use popup/in-app only, not email.
- Emergency/critical notices use popup/in-app delivery and require acknowledgement; the system tracks who has/has not acknowledged and may remind recipients. Admin may send system-wide; assigned Teacher/TA may send only within their course/group. Sender can see acknowledged/unacknowledged status.
- Ordinary notices have optional acknowledgement; sender can see status.
- UI default language is English; users can select a supported language. User timezone changes display only, not course/system rules.
- Each user configures their own language, light/dark appearance, and color palette in personal Settings. All supported palettes remain available to every user. These preferences are persisted per user and follow that account across devices; selecting a theme or palette never changes role permissions.
- Admin may configure global feature flags with audited course/role overrides for modules such as clans, marketplace, leaderboard, exam monitoring, and integrations.

## 8. UI/UX and motion

- UI/UX Pro Max is the design-direction layer for visual style, layout, typography, color, and accessibility; Animate UI is an optional implementation layer for motion primitives. Motion must not replace or override the approved design system.
- Use Animate UI only after the application framework and component primitives are selected and compatibility is verified. Pin dependencies and review changes; do not run an upstream CLI migration automatically.
- Motion is purposeful and nonessential content remains available without it. Respect reduced-motion preferences, keyboard navigation, focus visibility, touch input, and screen-reader semantics.
- Avoid blocking transitions on exam controls, form submission, grading, autosave, and other time-sensitive workflows. Prefer lightweight animations that preserve responsiveness on dense data views and code editors.
- The repository contains project-authored integration guidance in `modules/skills/animate-ui/SKILL.md`; no upstream skill or component source has been imported. Animate UI's audited MIT license includes the Commons Clause, so package adoption and distribution require a license review.

## 9. Current non-goals and implementation status

- No runtime, application UI, database migration, authentication service, queue worker, or exam monitor has been implemented in this repository; this document specifies expected behavior only.
- No SSO or Moodle integration in the initial phase. No webcam/microphone proctoring. Lockdown browser support is deferred for research.
- The first three external skill candidates remain deferred; Animate UI has project-authored integration guidance only. No upstream skill/package is installed. See `SOURCE_AUDIT.md`.
- The logical model and discovery contracts have been reconciled with the major product decisions. Before migrations/runtime, remaining work includes exact database constraints, strict private authoring schemas for each question type, and API/policy contracts for account provisioning, attendance, exam incidents, economy, clans, and notifications. The contracts remain specifications, not implementation.
