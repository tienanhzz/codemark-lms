# ADR-0003: Configurable Teacher and Teaching Assistant Ranks

- Status: Accepted
- Date: 2026-11-04

## Context
Teachers and Teaching Assistants need a shared, understandable progression system, while promotion evidence must reflect each role's actual responsibilities. Administrators need to tune tiers and requirements without changing application code.

## Decision
- Use English League-style tier names: Iron, Bronze, Silver, Gold, Platinum, Emerald, Diamond, Master, Grandmaster, and Challenger.
- Start with season-scoped points and example minimum thresholds of 0, 100, 250, 450, 700, 1,000, 1,400, 1,900, 2,500, and 3,200 respectively. These are configurable starting values, not immutable business rules.
- A user's eligible rank is the highest configured tier whose point threshold is met and whose required tasks for that user's role are all complete.
- Define promotion tasks separately for Teacher and Teaching Assistant. Seed a balanced example checklist in `contracts/core-api/teacher-rank-policy.example.json`; administrators may add, edit, reorder, or retire tiers and tasks through audited Core APIs.
- Store point awards as auditable ledger entries in PostgreSQL, attributed to trusted backend events. Store policy versions and admin changes for traceability. Redis rank summaries are cache-only.
- Restrict task completion to registered backend metrics or an explicit review workflow. Do not execute administrator-supplied scripts or formulas.
- Validate policies before activation: tier IDs and task IDs are unique; names are non-empty; thresholds are non-negative and strictly increasing; the first tier begins at zero; both roles have a task list for every tier; and all metric references are recognized.

## Rationale
The tier names provide familiar progression, while points plus role-specific tasks prevent a high score alone from granting promotion without the expected work. A season boundary keeps rankings relevant and makes point resets explicit.

## Consequences
- Positive: administrators can calibrate the system without deployments; requirements remain auditable and role-appropriate.
- Trade-off: Core needs a versioned policy, season lifecycle, point ledger, metric registry, and promotion evaluator before the ranks can be displayed as live.
- Trade-off: threshold and task changes need an explicit effective season to avoid surprising mid-season promotions or demotions.

## Initial admin capabilities
- Create, edit, reorder, activate, and retire tiers.
- Set each tier's minimum season points and required tasks per role.
- Preview policy validation and promotion impact before activation.
- Review task evidence where configured for manual review and view policy/point audit history.
