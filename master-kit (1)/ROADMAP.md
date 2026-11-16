# ROADMAP

## Phase 1 — Research & Source Audit
- Build auditable inventory of candidate skills and integrations.
- Define approval gates and evidence requirements.

## Phase 2 — Architecture & Specification
- Finalize module contracts, data model, policy hierarchy, and ADR set.
- Specify Redis-backed job/realtime/distributed coordination boundaries, rank policies, and shared learning-content taxonomy contracts.
- Capture and reconcile role-based UI/workflow requirements in `PRODUCT_REQUIREMENTS.md`; define CSV/local-auth, course permissions, question formats, assessments/exams, EXP/Coin, clans, reporting, and notification policies.
- Specify default-deny authorization and initial question, assessment/grading, rubric, and code-runner message contracts before runtime implementation. The Local Autograder is for explicitly confirmed trusted author code only; student-code execution remains disabled under ADR-0010.

## Phase 3 — Core Platform, Skill Registry & Orchestrator
- Implement Core services, state management, approvals, and orchestrator.
- Implement transactional job dispatch, CSV provisioning/authentication, course access, and audited policy/ledger services.
- Implement question/question-set versioning, grading, taxonomy, attendance, assessment, exam incidents, and appeals.
- Implement EXP/Coin, ranks, missions, achievements, shop, marketplace, and clan domain services.

## Phase 4 — Agent Integrations
- Implement generated adapters for Copilot, Claude Code, Cursor.

## Phase 5 — Dashboard & Realtime Operations
- Implement role-specific dashboards, course administration, rank/economy, taxonomy, question-bank, roster, assessment, exam-monitoring, and report views through shared Core APIs.
- Implement multi-format questions, Reading/Listening sets, rubrics, attendance, notifications/acknowledgements, and student learning/grade flows.
- Validate Redis-backed queue recovery and duplicate job handling; preserve the passing multi-instance realtime delivery check.

## Phase 6 — CLI Installer & Project Initializer
- Implement cross-platform CLI install/init and diagnostics workflows.

## Phase 7 — Technology Packs & Templates
- Deliver prioritized packs: Web, Backend, Python, Java, Data/AI/ML.

## Phase 8 — Testing, Security & Quality Gates
- Add layered testing, security controls, and quality compliance gates.

## Phase 9 — Documentation, Validation & Release
- Complete validation evidence, release process, and operational docs.
