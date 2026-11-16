# PROJECT_STATE

## Current Phase
- Phase 1: Research & Source Audit (in progress)
- Phase 2: Architecture & Specification (in progress)

## Repository Baseline
- Modular monorepo skeleton established.
- Required reports initialized.
- Initial Core API contract scaffolded.
- Redis/job/realtime boundaries and configurable teacher/TA rank policy specified in ADRs/contracts.
- Shared learning taxonomy, multi-tag content, and assignment question-snapshot contracts specified.

## Known Gaps
- Core runtime modules not implemented yet.
- Agent adapter generation logic not implemented yet.
- CLI and dashboard runtime not implemented yet.
- Skill ingestion and approval workflow not implemented yet.
- Learning taxonomy, coding-question and assignment runtime/persistence/admin workflows not implemented yet.
- Phase 1 source audit has no approved candidate sources yet; Phase 2 contract/model work remains open.

## Evidence
- See `SOURCE_AUDIT.md`, `ARCHITECTURE.md`, `TASKS.md`, ADRs 0001–0004, and the contracts under `contracts/core-api/`.
