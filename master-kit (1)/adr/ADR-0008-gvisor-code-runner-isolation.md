# ADR-0008: gVisor-Isolated Code Runner

- Status: Superseded for the initial local trusted-source workflow by ADR-0010; no learner-code runner is approved
- Date: 2026-11-12

> Historical proposal: this ADR records the former gVisor direction and its threat analysis. It is not an active build prerequisite or authorization to deploy/execute code. ADR-0010 selects a local trusted-source autograder and explicitly excludes student submissions. Any future untrusted-code runner requires a new product/security decision.

## Context

The LMS must compile and execute untrusted student source code against approved tests. The API currently stores immutable Draft runtime profiles, but there is no job broker, runner service, or code execution implementation. Student code, compiler inputs, question-authored harnesses, and test fixtures must be treated as hostile. Code execution must never run in API, web, database, Redis, or general-purpose worker processes.

The user selected a gVisor-backed runner on dedicated Linux worker hosts. This decision selects the isolation direction; it does not approve any runtime profile, enable code execution, or claim that a deployment has passed isolation tests.

## Former decision (superseded)

- Execute each job in a fresh OCI container using gVisor's `runsc` runtime on dedicated, patched Linux worker hosts isolated from the API, PostgreSQL, Redis, and object storage.
- Do not expose a container-runtime socket, host mounts, host networking, devices, credentials, or privileged execution to the API or to the sandbox. Runner control-plane privileges remain confined to the dedicated worker service.
- Require deny-by-default host egress and sandbox network isolation. Runner workers communicate only with the approved internal job/result boundary over authenticated TLS; sandboxed programs have no network interface or route.
- Resolve an immutable, Admin-approved runtime-profile ID/version to an allowlisted image by exact SHA-256 digest. The client, question, and job cannot choose an image, compiler command, package install, environment variable, network policy, or limit above the profile caps.
- Create a disposable workspace per job with validated relative file paths, a read-only runtime root, non-root identity, no capabilities, no secret mounts, bounded temporary storage, and enforced process, CPU, memory, wall-time, file-size, and output limits.
- Keep orchestration and result handling outside the sandbox. Authenticate worker identities, validate job/result envelopes, make dispatch and result processing idempotent, bound retries, and treat infrastructure failure as non-penalizing to the learner.
- Keep question correctness, reference solutions, and expected outputs out of API responses, logs, and student-visible diagnostics. Return only bounded per-test results permitted by each test's display policy and sanitized diagnostics.
- Keep job-broker technology selection separate. Use the existing internal runner contract and PostgreSQL/outbox durability requirements until a Python-compatible broker is selected and reviewed.

## Rationale

gVisor adds a userspace system-call boundary while retaining the familiar OCI image workflow, making a separately operated Linux worker service a deployable first target. Dedicated hosts and strict network/data boundaries reduce the impact of a sandbox or compiler failure on LMS control-plane services. Runtime images remain immutable, reviewable, and reusable across approved profile versions.

Firecracker microVMs may provide a stronger VM boundary, but require KVM-capable hosts and additional image/VM lifecycle operations. Revisit this decision if the required residual risk is unacceptable, the deployment can support KVM operations, or gVisor cannot meet the verified threat model.

## Consequences and limits

- A gVisor sandbox is not a proof of safety and still depends on the worker host kernel, `runsc`, container runtime, compiler images, and control plane being patched and correctly configured. A sandbox escape can compromise its worker host; hosts therefore contain no LMS data-plane credentials and have no route to protected services except the narrowly required control channel.
- Program inputs that are required for an execution are observable to the program during that execution. “Hidden” tests mean hidden from the normal student API/UI and withheld from diagnostics, not cryptographically secret from hostile code that is actively being tested. Do not execute high-stakes material whose confidentiality requires that stronger guarantee.
- Side channels, compiler/runtime vulnerabilities, denial of service beyond configured quotas, and operator errors remain residual risks. Dedicated capacity, short jobs, quotas, patching, monitoring, and an incident kill switch are required.
- Local Docker Compose is not an approved runner deployment. Do not add a runner service to the existing shared Compose stack or run untrusted source on developer machines as a validation shortcut.
- Code publication, runtime-profile testing/activation, and student code execution remain disabled until all acceptance gates below pass and are reviewed.

## Required acceptance gates

1. Provision dedicated Linux worker hosts; pin and verify supported kernel, container runtime, `runsc`, and immutable runtime image versions/digests. Maintain a patch and emergency-disable process.
2. Verify deployment policy denies sandbox egress, host mounts, runtime sockets, devices, capabilities, credentials, control-plane service access, and cross-job workspace/process reuse.
3. In an isolated staging environment, test authorization and job/result identity, path and payload validation, cgroup/resource enforcement, output bounds, cleanup on success/failure/timeout, retry/idempotency behavior, and the runner's documented isolation conformance suite.
4. Verify no source, reference solution, hidden expected output, credentials, or unbounded process output appears in application/worker logs, API responses, diagnostics, or retained artifacts.
5. Review and pin every runtime image and library allowlist; record provenance, vulnerability/license review, SBOM, and supported end-of-life policy.
6. Require Admin profile approval only after conformance succeeds. Test each profile version against known-good, compile-error, runtime-error, and resource-limit cases; activation is audited and immutable versions remain addressable.
7. Complete operational monitoring, worker saturation/quotas, bounded retry and dead-letter recovery, incident response, data retention, and a global execution kill switch.

The API package provides a read-only `python -m lms_api.runner_preflight` prerequisite check for Linux, Docker daemon OS, `runsc` version, and Docker runtime registration. It does not establish that a host is dedicated or isolated, and passing it is not acceptance evidence for these gates. Never run untrusted jobs as part of this preflight.

## References

- [`../CODE_RUNNER_THREAT_MODEL.md`](../CODE_RUNNER_THREAT_MODEL.md)
- [`../SECURITY_STANDARDS.md`](../SECURITY_STANDARDS.md)
- [`../contracts/core-api/API_CONTRACTS.md`](../contracts/core-api/API_CONTRACTS.md)
- [`../contracts/core-api/code-runner.schema.json`](../contracts/core-api/code-runner.schema.json)
