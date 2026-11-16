# DECISIONS

## Approved / Active Decisions
1. Use a modular monorepo with clear boundaries between Core, adapters, packs, CLI, dashboard, and governance artifacts.
2. Start with contract-first API definitions before runtime implementation.
3. Track architectural decisions in ADRs with explicit status and rationale.
4. Deliver iteratively by controlled phases; do not attempt full-platform implementation in a single change.
5. Use Redis initially for BullMQ jobs, Socket.IO cross-instance fan-out, and ephemeral distributed coordination, with PostgreSQL remaining authoritative (ADR-0002).
6. Make teacher/TA ranks configurable by administrators, with English League-style tiers, season-scoped points, and role-specific promotion tasks (ADR-0003).
7. Use a shared, administrator-managed hierarchical tag taxonomy for lessons and coding questions; support multi-tag content, explicit any/all filters, and snapshot question IDs when publishing tag-based assignments (ADR-0004).
