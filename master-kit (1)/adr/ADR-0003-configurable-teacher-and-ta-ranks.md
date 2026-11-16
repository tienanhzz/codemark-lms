# ADR-0003: Configurable Rank Progression

- Status: Accepted, revised by `PRODUCT_REQUIREMENTS.md` on 2026-11-05
- Date: 2026-11-04

## Context
Staff initially needed a shared, understandable progression system, while promotion evidence must reflect each role's responsibilities. Product requirements subsequently expanded progression to all users, with separate Student and staff rank tracks and a shared EXP economy.

## Decision
- EXP is the single balance used to calculate rank. It applies to every role; Student and staff use separate Admin-managed rank tracks. Staff tier names use the English League-style set: Iron, Bronze, Silver, Gold, Platinum, Emerald, Diamond, Master, Grandmaster, and Challenger. Student tier names are an independent Admin-managed academic-style set.
- Rank is non-seasonal and is derived from the current EXP balance. Spending EXP or an audited deduction may lower rank. Example thresholds are configurable starting data, not immutable rules.
- Staff rank criteria may vary by role. Admin configures task lists and thresholds through audited Core APIs; metric tasks use trusted backend events and manual tasks use explicit review.
- Store EXP changes as append-only ledger entries in PostgreSQL, attributed to trusted backend events and idempotency keys. Store policy versions and Admin changes for traceability. Redis rank summaries are cache-only.
- Restrict task completion to registered backend metrics or an explicit review workflow. Do not execute administrator-supplied scripts or formulas.
- Validate policies before activation: tier IDs and task IDs are unique; names are non-empty; thresholds are non-negative and strictly increasing; the first tier begins at zero; role criteria refer only to supported roles and recognized metrics.

## Rationale
Separate tracks preserve role-appropriate progression while a common EXP balance powers missions, rewards, and ranks. No seasonal reset is used.

## Consequences
- Positive: administrators can calibrate the system without deployments; requirements remain auditable and role-appropriate.
- Trade-off: Core needs versioned rank policies, an EXP ledger, metric registry, and promotion evaluator before ranks can be displayed as live.
- Trade-off: policy changes need an explicit effective time and preview because existing users may be promoted/demoted when thresholds change.

## Initial admin capabilities
- Create, edit, reorder, activate, and retire tiers.
- Set each tier's minimum EXP and required tasks per staff role.
- Preview policy validation and promotion impact before activation.
- Review task evidence where configured for manual review and view policy/point audit history.
