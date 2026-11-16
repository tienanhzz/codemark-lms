CodeMark_ClassFlow
A classroom learning management system built with Java 21+, Spring Boot, JPA/Hibernate and WebSocket, with a Next.js, TypeScript and Tailwind CSS frontend.

Overview
CodeMark brings course management, learning materials, announcements, discussions, assessments, grading, attendance and leave requests into a shared workspace for teachers and students. Teachers can monitor assessment activity and send alerts, adjust deadlines or submit an active attempt through WebSocket.

The application supports one server and multiple browsers on a local network. H2 provides persistent storage for local use; MariaDB can be configured through environment variables.

Requirements
JDK 21 or later, available through java in PATH.
Maven 3.9 or later, available through mvn in PATH.
Node.js 20.9 or later and npm.
Docker is optional and only required for code execution exercises.
Check your tools with java -version, mvn -version and node -v. The launcher also recognizes a local Maven installation at .tools/apache-maven-3.9.11/.

Quick start
Run these commands from the project root:

npm install
npm run seed
npm run dev
Service	Address
Frontend	http://localhost:3000
Backend health	http://localhost:5000/health
WebSocket	ws://localhost:5000/ws
The development launcher builds the backend JAR and starts both services. Press Ctrl+C to stop them. Restart the launcher after changing Java code. Stop any existing services on ports 3000 and 5000 before starting another instance.

Demo accounts
Run npm run seed explicitly to create demo accounts and sample content. Normal startup does not create these accounts. Stop the backend before running seed, as the H2 database is opened by the running server.

The automatically created administrator is separate from these demo accounts: login code `0000000000`, initial password `CodeMark@2026!` (including the final `!`). It is created only when no administrator with a valid login code exists and requires a password change on first login.

| Role | Mã đăng nhập | Mật khẩu ban đầu (Initial password) |
| --- | --- | --- |
| Admin | `1000000000` | `CodeMark@2026` |
| Teacher | `1000000001` | `CodeMark@2026` |
| Teaching assistant | `1000000002` | `CodeMark@2026` |
| Student | `2025000001` | `CodeMark@2026` |

Additional student accounts are `2025000002` and `2025000003`, with the same initial password. Sign in using the 10-digit login code above. The initial password applies to newly seeded accounts; seed preserves existing passwords and submissions.

Each account has one active session. Signing in again revokes its previous session. Sessions expire after 120 seconds of inactivity; the frontend sends a heartbeat every 30 seconds. Use separate accounts and browser profiles when testing different roles.

Running services separately
Build and start the backend:

npm run build:backend
cd backend
java -jar target/classflow-1.0.0.jar
In another terminal at the project root:

npm run dev:frontend
For a production frontend build, run npm run build:frontend, followed by npm run start --workspace=frontend. Stop the frontend development server before building to avoid concurrent writes to .next.

LAN access
Run npm run dev on the server computer. The launcher prints its LAN URLs and permits the corresponding frontend origins. Other devices on the same network should open http://<server-ip>:3000. Use the Wi-Fi or Ethernet address shared with those devices. Restart the launcher if the server IP changes.

API and WebSocket connections use the page hostname with port 5000 by default. Remove obsolete localhost overrides from frontend/.env.local when using LAN access.

If Windows Firewall blocks connections, run this command once from an Administrator PowerShell window at the project root:

powershell -ExecutionPolicy Bypass -File .\scripts\enable-lan.ps1
The script permits TCP 3000 for Node.js and TCP 5000 for Java from the local subnet. Clients must be able to reach both ports. Guest Wi-Fi or access point isolation may prevent communication between devices.

When running the backend JAR separately, configure the permitted frontend origins explicitly:

$env:CORS_ORIGINS="http://localhost:3000,http://192.168.1.20:3000"
Browser camera access may require HTTPS when opening a LAN IP address. Manual attendance token entry works over HTTP.

Configuration and storage
Spring reads operating system environment variables. It does not automatically load the root .env file. See the environment reference and application.properties.

Variable	Purpose
PORT	Backend port; defaults to 5000
JDBC_DATABASE_URL	JDBC URL; defaults to a local H2 file
DB_USER, DB_PASSWORD	Database credentials
CORS_ORIGINS	Comma-separated permitted frontend origins
COOKIE_SECURE	Set to true when using HTTPS
UPLOAD_DIR	Private upload storage directory
TOKEN_ENCRYPTION_KEY	Base64url-encoded 32-byte attendance token key
CODE_RUNNER_ENABLED	Enables Docker-based code execution; defaults to false
CODE_RUNNER_IMAGE	Runner image name
CODE_RUNNER_MAX_CONCURRENCY	Concurrent runner tasks, from 1 to 8
When started through the launcher:

The H2 database is stored at backend/instance/classflow.mv.db.
Leave evidence is stored under backend/instance/uploads/leave/.
If no token key is supplied, a persistent demo key is created at backend/instance/attendance.key.
For MariaDB, create an empty database and set JDBC_DATABASE_URL=jdbc:mariadb://localhost:3306/classflow, DB_USER and DB_PASSWORD. The JDBC driver is included.

The legacy SQLite database at backend/instance/lms.db is preserved but is not automatically imported into H2 or MariaDB. A local backup of the previous Flask source may be present under archive/; it is excluded from Git and is not required to run this application.

Do not commit database files, uploaded evidence, secrets, .env, build output or dependency directories.

Architecture
Next.js -> HTTP JSON and session cookies -> Spring MVC controllers
        -> JSON WebSocket /ws            -> RealtimeService / RealtimeHub
Spring services -> Store / JPA -> Hibernate -> H2 or MariaDB
GradingService -> AnswerGrader -> TextAnswerGrader / CodeAnswerGrader
CodeAnswerGrader -> ContainerRunner -> disposable Docker containers
Component	Responsibility
BaseEntity and domain entities	Persistent IDs, timestamps, optimistic versions and relationships
Access	Authentication, BCrypt passwords, course permissions, network rules and audit
Views	Explicit JSON DTOs that exclude private fields and hidden answers
Store	JPA persistence with parameterized JPQL
GradingService and AnswerGrader	Assessment lifecycle and grading strategies
ContainerRunner	Bounded execution, output capture, timeouts and container cleanup
RealtimeService	Authorization and handling of incoming WebSocket events
RealtimeHub	Concurrent room membership and message delivery
AttendanceTokens	AES-256-GCM tokens with purpose binding and expiry
Controllers are grouped by authentication, administration, courses, assessments, attendance and reporting. Spring manages transactions and dependency injection. See the technical specification for API and protocol details.

Code runner
Code execution is disabled by default. Multiple-choice assessments do not require Docker.

To enable code exercises, start Docker, build the image using the sandbox instructions, set CODE_RUNNER_ENABLED=true in the server environment and restart the backend. Submitted code runs inside disposable containers with restricted permissions and resource limits.

Verification
npm run test:backend
node node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
npm run build:frontend
JUnit uses in-memory H2 databases and separate test upload storage. Results are written to backend/target/surefire-reports/.

Integration coverage includes authentication, authorization, LAN origin checks, quiz answers and flags, grading, attendance tokens, evidence uploads, leave decisions and dashboard responses. WebSocket tests start a real server on a random port and verify monitoring, telemetry, alerts, deadline adjustments, forced submission and access restrictions.

GitHub Actions builds and tests the Java backend and builds the Next.js frontend.

Limitations
Legacy SQLite import is not implemented.
MariaDB and the Docker language runners still need validation in their deployment environments.
Browser end-to-end tests, load tests and performance benchmarks are not included.
H2 is intended for the single-host demo configuration.
Internet deployment requires appropriate HTTPS, reverse proxy, credential and operational configuration.
Exam monitoring records events inside the application page and cannot guarantee prevention of cheating.
References
Spring Boot
Spring Data JPA
Spring WebSocket
Next.js
