# ADR-0010: Local Autograder for Trusted Source

- Status: Accepted for local development and author-side validation only
- Date: 2026-11-13
- Supersedes: ADR-0008 as the active initial code-validation approach; it does not authorize learner-code execution

## Context

The project has an installable, reusable Python library at `cyb3rt1tan-lms/tools/local_autograder`, with a CLI as an optional front end. It runs C, Java, and Python directly on a developer's macOS host, without Docker, Kubernetes, or an external grading service. It supports Input/Output cases, language-specific unit-test harnesses, source-structure checks, Java annotation processors, and the JDK's Reflection, Annotation, Dynamic Proxy, Generic, ClassLoader, and Compiler APIs. Its static policy analyzer can check configured allowed/forbidden imports, symbols, and source patterns without compiling or executing code.

The tool runs programs with the current user's operating-system privileges. Process timeouts, temporary directories, environment cleanup, and output/file-size caps are development safeguards, not a sandbox or security boundary. Student submissions and other untrusted code must therefore never be passed to it.

## Decision

- Use the standalone Local Autograder only for explicitly confirmed trusted source during local development, teacher/author-side validation, and automated tests whose source and harnesses are trusted.
- Require the explicit `confirm_trusted_source=True` library argument or `--confirm-trusted-source` CLI option for every grading run. The confirmation is an operator attestation, not a trust check.
- Keep the package separate from Flask/FastAPI, LMS APIs, background workers, and the web UI. Do not send learner submissions, private LMS credentials, or production data to it.
- The supported local languages are C, Java, and Python. C++ and other languages are not included in this initial tool.
- Java advanced features are exercised by trusted test/processor code using the installed JDK; no additional runtime library is required.
- Static analysis is a configurable policy check, not malware detection or a proof of safety. It can miss indirect, obfuscated, generated, reflective, or runtime behavior, and C/Java source-pattern checks may produce false positives. A clean report means only that the configured rules found no violations.
- Do not deploy or invoke a shared-process executor for student submissions. LMS student-code execution, automated grading, runtime-profile activation, and related publication gates remain disabled. A future proposal for untrusted execution requires a separate explicit product/security decision and threat review; this ADR does not select or authorize a sandbox or other production runner.
- Keep the existing Redis runner queue/admission and runtime-profile code dormant. It is transport/metadata plumbing only and must not be interpreted as permission to execute jobs.

## Rationale

This decision delivers the requested convenient local grading workflow for trusted author-owned programs while avoiding a false security claim. A same-user process has the developer's filesystem, network, and account privileges; adding an approval flag cannot make hostile source safe. Excluding learner code from the tool is therefore a hard scope boundary.

## Consequences

- Developers can import the reusable package, run non-executing policy checks, and compile/run trusted C, Java, and Python programs on macOS using installed local toolchains.
- The autograder is not an LMS service, does not grade student submissions, and does not satisfy assessment acceptance requirements for student code execution.
- The local autograder's time/output limits improve feedback and protect against ordinary mistakes, but do not prevent deliberate filesystem access, network access, credential theft, or resource abuse beyond the implemented limits.
- No gVisor, Docker, Kubernetes, or external grading service is required for this trusted-source local workflow. ADR-0008's former gVisor deployment plan is retained as historical analysis, not an active implementation prerequisite.

## References

- [`../PRODUCT_REQUIREMENTS.md`](../PRODUCT_REQUIREMENTS.md)
- [`../contracts/core-api/data-model.md`](../contracts/core-api/data-model.md)
- [`../../cyb3rt1tan-lms/tools/local_autograder/README.md`](../../cyb3rt1tan-lms/tools/local_autograder/README.md)
- [`ADR-0008-gvisor-code-runner-isolation.md`](ADR-0008-gvisor-code-runner-isolation.md)
