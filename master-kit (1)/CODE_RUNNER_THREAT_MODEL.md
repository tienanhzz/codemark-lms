# Code Runner Threat Model

**Status:** Historical threat analysis for a superseded gVisor proposal; not an active deployment decision.  
**Scope:** Former proposal for compilation and execution of untrusted Java, C, C++, and Python submissions. The accepted initial scope is trusted local author-validation only (ADR-0010); student code is not executed.  
**Decision record:** [ADR-0008](adr/ADR-0008-gvisor-code-runner-isolation.md)

## Security objectives

The Local Autograder runs trusted code only as the developer's current OS user. It is not covered by the isolation controls below and must never receive student submissions or other untrusted source. These controls describe the retired proposal and do not imply an approved service.

- Prevent student code, compilers, and question-authored harnesses from accessing LMS control-plane services, other jobs, host data, credentials, or arbitrary network destinations.
- Keep private answer keys, reference solutions, hidden expected outputs, and other users' source/submissions out of student APIs, logs, and unapproved artifacts.
- Enforce profile limits regardless of values supplied by the student or question.
- Preserve job integrity and idempotent outcomes; infrastructure failure must not be scored as an incorrect answer.
- Bound resource use, retention, and operator access; make runner health and security failures visible without logging sensitive payloads.

## Assets and trust boundaries

| Asset / boundary | Trust assumption |
|---|---|
| Student source, uploaded files, and question-authored harnesses | Fully untrusted, even after frontend/API validation |
| Reference solutions, private tests, expected outputs, grading policy | Restricted server-side data; disclose only minimum execution inputs and permitted result summaries |
| Runtime image, compiler, libraries, `runsc`, worker OS | Trusted computing base; pinned, reviewed, patched, and monitored |
| LMS API, authorization, profile registry, PostgreSQL/outbox | Trusted control plane; never exposed directly to sandbox processes |
| Broker and runner control channel | Internal service boundary; authenticated, encrypted, bounded, and treated as untrusted input at each receiver |
| Per-job gVisor sandbox and temporary workspace | Hostile execution boundary; disposable and never reused |
| Dedicated worker host | Potentially compromisable by a sandbox/runtime escape; holds no application/data-plane credentials |

### Data flow

1. The API authenticates and authorizes a submission, resolves the immutable active profile version and question version, validates bounded source files, applies limits no higher than the profile caps, and durably records the job/outbox event.
2. The current Redis consumer group reclaims and validates the bounded queue envelope against the PostgreSQL outbox, then records job identity durably before acknowledging it. It does not execute source code or claim worker authentication.
3. The worker starts one fresh gVisor `runsc` sandbox from the approved immutable image, stages only that job's files and required test inputs, enforces host and sandbox resource limits, executes, captures bounded results, then destroys the sandbox and workspace.
4. A future authenticated worker/result channel must validate a bounded result, enforce job ownership/state, and persist it idempotently; the current internal result helper is not exposed as a network endpoint. Only policy-permitted feedback may reach students.

The specific broker and deployment orchestrator remain undecided. This data flow must be preserved regardless of those choices.

## Threats and required controls

| Threat | Required controls | Residual risk |
|---|---|---|
| Sandbox escape through system calls, kernel/runtime/compiler flaws | `runsc`; dedicated patched Linux workers; no privileged mode, capabilities, devices, host mounts, host PID/IPC/network namespaces, or runtime socket inside sandbox; minimal host services; rapid kill/patch procedure | Any isolation layer can contain unknown defects; an escape may compromise the worker host |
| Lateral movement or data exfiltration | No sandbox network interface/route or DNS; deny-by-default worker egress; allow only authenticated runner control traffic; firewall worker from DB/Redis/object storage/API internals except explicit control endpoints; no cloud metadata route | Host or network policy mistakes can bypass application-level settings |
| Cross-job access or residual files/processes | New sandbox and bounded workspace per job; no shared writable volumes; destroy processes/workspace after every outcome; test cleanup after timeout/crash; isolate worker capacity by policy | Host-level compromise can cross job boundaries on that worker |
| Resource exhaustion and fork/process abuse | Enforce wall-clock, CPU, memory, process, open-file, file-size, temporary-storage, source/input, and output limits at host/runtime boundaries; bounded concurrency and per-course/user quotas; kill timed-out jobs | Capacity exhaustion remains possible within configured quotas; limits require deployment verification |
| Path traversal, symlink, archive, or file-collision abuse | Accept only bounded relative paths; reject absolute paths, traversal, reserved harness names, duplicate/case-colliding paths, links/special files, and unsafe archive extraction; create files with restrictive permissions in a fresh workspace | Filesystem and language tooling defects remain possible |
| Private-test or solution disclosure | Never send correctness data to student APIs; do not log source/tests/raw stdout; compare outputs in trusted control code where feasible; enforce per-test display policy and return only bounded pass/fail/points/sanitized diagnostics; no persistent artifacts by default | Inputs needed for an execution can be observed by that executed program. Timing/resource side channels may reveal limited information. Do not claim hidden inputs are secret from hostile code |
| Job or result forgery, replay, or duplicate scoring | Authenticated workload identity and TLS; server-generated opaque job IDs; immutable profile/question version references; envelope validation; idempotency keys; state-transition checks; bounded retries; worker result is never accepted solely by an unauthenticated callback | Compromised worker credentials can forge results until revoked; operational revocation and audit are required |
| Malicious or compromised runtime image/library | Admin allowlist by exact digest; provenance/SBOM/license/vulnerability review; no runtime package installation; controlled build pipeline; EOL and patch process; test before activation | Upstream zero-days and build-chain compromise remain |
| Compiler diagnostic or output injection | Capture output with strict byte limits; sanitize/escape before rendering; remove control characters and secrets; never include unrestricted stdout/stderr or hidden fixtures in student feedback | Diagnostics may still contain sensitive fragments unless reviewed and bounded |
| Abuse of execution endpoint or queued workload | Existing course authorization plus per-user/course rate and concurrency limits; admission quotas; authenticated internal dispatch; queue-age/backlog alerting; global kill switch | A valid authorized user can consume allowed capacity |
| Sensitive data leakage through logs/telemetry | Structured metadata-only logging (job ID, profile digest, status, duration, bounded resource totals); redact source, fixtures, env, tokens, and raw output; restricted access and retention | Misconfigured platform-level telemetry can capture process or storage data |

## Non-negotiable deployment properties

- Run runner control and sandbox execution on dedicated Linux worker hosts separate from API, web, PostgreSQL, Redis, and object-storage hosts.
- The API must not create containers or access a container-runtime socket. The sandbox receives no service credentials, secret mounts, cloud credentials, or writable host paths.
- Use `runsc` as the configured runtime; a container label or profile field alone does not prove gVisor is active. Fail closed if the selected runtime or required policies are unavailable.
- Enforce limits in the host/runtime, not only in request validation or a sandbox JSON document. A job may reduce but never raise Admin profile caps.
- Pin the runtime image by digest. Do not allow job payloads to specify images, shell fragments, package repositories, arbitrary compiler options, environment secrets, or network policy.
- Keep hidden tests and expected output out of student-visible response payloads and routine logs. Execution results are minimal, typed, size-bounded, and validated before persistence or display.
- Use isolated staging for conformance and failure testing. The existing local Compose environment is not a code-runner security boundary and must not execute untrusted submissions.

## Release gates

The controls above are historical requirements for the former ADR-0008 proposal, not active release gates. Under ADR-0010, LMS code publication/execution and profile testing/activation remain disabled; no learner-code runner is approved. A future proposal for untrusted-code execution needs a new product/security decision and threat review rather than simply satisfying this retired checklist.

Revisit this model after material changes to the execution environment, compiler images, broker/control channel, data flow, or threat assumptions.
