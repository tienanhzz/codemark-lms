# CodeMark_ClassFlow — Spring Boot technical specification

## Stack and architecture

JDK 21+, Spring Boot 3.5.7, Spring MVC, Hibernate/JPA, H2 file database (demo) or MariaDB (configurable), native JSON WebSocket. Next.js/React/TypeScript remains the frontend. Python/Flask and Socket.IO are no longer runtime dependencies.

Controllers cover Auth, Admin, Course, Assessment, Attendance and Reporting. Access centralizes authorization/session policy. Store provides JPA persistence and parameterized JPQL; Views constructs explicit DTOs. GradingService composes AnswerGrader strategies. ContainerRunner owns bounded execution. RealtimeService authorizes messages; RealtimeHub only delivers them.

## Persistence

Entities: User, Course, Enrollment, Meeting, Lesson, Announcement, DiscussionPost, Assessment, Question, TestCase, Attempt, AttendanceSession, AttendanceRecord, LeaveRequest, ProctorEvent, AuditEvent, IpBlacklist. BaseEntity defines generated ID, createdAt and optimistic version.

Enrollment has a unique course/user constraint; attendance records have a unique session/user constraint. Related entities use JPA many-to-one associations. HTTP operations and realtime messages execute in Spring-managed transactions. Start-attempt takes a pessimistic assessment lock to serialize attempt-limit checks. Hibernate schema update is for demo setup, not a production migration policy.

H2 file data is separate from legacy SQLite. Existing SQLite/upload files are preserved. There is no automatic legacy database import.

## Identity and authorization

Passwords use BCrypt. HTTP session cookie is HttpOnly and SameSite Strict; COOKIE_SECURE must be true for HTTPS deployments. Authentication checks that the session ID matches the user's activeSession and that lastActivity is within 120 seconds. Login invalidates the prior session. Heartbeats run every 30 seconds; persistent activity writes are throttled to five seconds.

Course access requires enrollment, ownership or admin. Course modifications and roster promotion require the owner/admin; staff operations permit course TA. Students can only modify their own attempts/leave requests. Global literal IP/CIDR blacklist and assessment IP allowlists are evaluated on the server.

Allowed origins are an explicit configured list plus LAN origins supplied by the development launcher. HTTP mutations validate Origin when present; WebSocket upgrades require an allowed Origin and an HTTP session. Each WebSocket message revalidates authentication and authorization.

## REST contract

Prefix /api; JSON error shape is {"error":"error_code"}.

- /auth/login, /auth/me, /auth/heartbeat, /auth/logout, /auth/password
- /users, /users/search, /users/{id}
- /admin/stats, /admin/sessions, /admin/ip-blacklist, /admin/audit, /admin/audit/export
- /courses, /courses/{id}, /courses/{id}/meetings, /courses/{id}/roster
- /schedule/me, /dashboard, /courses/{id}/stats, /courses/{id}/gradebook
- /courses/{id}/lessons, /lessons/{id}
- /courses/{id}/announcements, /announcements/{id}
- /courses/{id}/discussions, /discussions/{id}
- /courses/{id}/assessments, /assessments/{id}, /assessments/{id}/questions
- /questions/{id}, /questions/{id}/testcases, /testcases/{id}, /questions/{id}/run
- /assessments/{id}/start, /assessments/{id}/attempts, /attempts
- /attempts/{id}, /attempts/{id}/answers/{questionId}, /attempts/{id}/flags/{questionId}, /attempts/{id}/submit
- /attempts/{id}/telemetry, /attempts/{id}/proctor, /courses/{id}/proctor-report
- /courses/{id}/attendance-sessions, /attendance-sessions/{id}, /attendance-sessions/{id}/token, /attendance-sessions/{id}/close, /attendance/check-in
- /courses/{id}/leave-requests, /leave-requests/{id}/decision, /leave-requests/{id}/evidence
- /runner/status; /health is outside /api.

IDs are numeric; timestamps are ISO-8601 UTC; public JSON field names remain compatible with the Next.js client.

## Assessment lifecycle

Server stores start time, deadline, answers, flags, current question and score. Student question DTOs exclude answer keys and hidden test cases. Staff can manage questions/testcases. Deadline is capped by assessment close time when an attempt starts.

Late answer edits are rejected. Reading an expired attempt finalizes stored responses. Submission is idempotent, finalizes stored responses, and includes deadlineExceeded when a late request arrives; it never accepts new answers through submit. Staff can adjust a running deadline by at most one hour per action or force-submit. MCQ uses exact option index; short answers normalize case/whitespace and accept pipe-separated alternatives.

## WebSocket /ws

Cookie-authenticated native WebSocket. Frame: {"event":"name","data":{...}}. No STOMP or Socket.IO client is needed.

Client events: heartbeat, join_course, join_monitor, telemetry, teacher_action.
Server events: connected, heartbeat_ack, monitor_joined, monitor_denied, proctor_event, teacher_alert, deadline_adjusted, forced_submission, attempt_submitted, teacher_action_ack, error.

Rooms are server-owned: user:{id}, course:{id}, monitor:{assessmentId}. A student cannot join a monitor room. Teacher actions validate course staff role and assessment, then target active attempts. Sessions use Spring ConcurrentWebSocketSessionDecorator for concurrent sends; room membership uses concurrent maps/sets. Frontend reconnects with bounded backoff and rejoins through its connect listener. Authorization is rechecked per message.

## Attendance and evidence

Attendance token uses AES-256-GCM, random 96-bit nonce, attendance:v1 associated data, session/course binding and 30-second expiry. Check-in requires current enrollment, student role, active session, permitted network and no existing record.

Evidence accepts JPEG/PNG/WebP/PDF, maximum 5 MiB, with MIME and magic-byte checks. Files are stored outside public web root under UUID names. Failed DB transactions remove newly uploaded files. Evidence download requires owner/course-staff permission. Only staff may decide a pending request; decisions are audited.

## Container runner

Off by default. Docker image includes Python, C, C++, Java and SQLite for SQL exercises. Submitted source is written to a temporary mapped directory; compilation and execution occur only in Docker. Containers have no network, read-only root, non-root user, dropped capabilities, no-new-privileges, PID/CPU/memory limits, tmpfs and timeout. A fixed executor and semaphore bound concurrency; output capture is bounded. Cleanup kills/removes containers and deletes temporary source directories.

Real Docker/image execution, MariaDB, LAN device behavior, browser E2E and performance have not been validated by the migration integration tests. Do not report those as measured results.

## Submission evidence

README contains build/run/seed and role accounts. JUnit tests exercise REST and actual WebSocket connections with in-memory H2. Report/slide/Compilatio evidence must be supplied by the team; test counts and outcomes should be read from the latest Surefire output, not estimated.
