# ROADMAP

## Phase 1 — Research & Source Audit
- Build auditable inventory of candidate skills and integrations.
- Define approval gates and evidence requirements.

## Phase 2 — Architecture & Specification
- Finalize module contracts, data model, policy hierarchy, and ADR set.
- Specify Redis-backed job/realtime/distributed coordination boundaries, rank policies, and shared learning-content taxonomy contracts.

## Phase 3 — Core Platform, Skill Registry & Orchestrator
- Implement Core services, state management, approvals, and orchestrator.
- Implement transactional job dispatch, rank calculation, and audited rank policy management.
- Implement persistent tag taxonomy, tag validation/search, and coding-question/assignment domain contracts.

## Phase 4 — Agent Integrations
- Implement generated adapters for Copilot, Claude Code, Cursor.

## Phase 5 — Dashboard & Realtime Operations
- Implement administrator rank-policy management and realtime updates through the shared Core API.
- Implement administrator taxonomy management and multi-tag question/lesson pickers; support tag-filtered assignment drafts and question snapshots on publish.
- Validate Redis-backed queue recovery, duplicate job handling, and multi-instance event delivery.

## Phase 6 — CLI Installer & Project Initializer
- Implement cross-platform CLI install/init and diagnostics workflows.

## Phase 7 — Technology Packs & Templates
- Deliver prioritized packs: Web, Backend, Python, Java, Data/AI/ML.

## Phase 8 — Testing, Security & Quality Gates
- Add layered testing, security controls, and quality compliance gates.

## Phase 9 — Documentation, Validation & Release
- Complete validation evidence, release process, and operational docs.
