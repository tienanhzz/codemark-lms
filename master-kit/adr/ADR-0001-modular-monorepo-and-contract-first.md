# ADR-0001: Modular Monorepo and Contract-First Baseline

- Status: Accepted
- Date: 2026-11-01

## Context
The project must support multiple agents, skills, technology packs, and governance requirements while remaining maintainable and auditable.

## Decision
Adopt a modular monorepo with a framework-neutral Core and contract-first API definitions as the initial baseline.

## Rationale
This enables clear dependency boundaries, shared business logic across CLI/dashboard, controlled adapter generation, and phased delivery with traceability.

## Consequences
- Positive: consistency, auditability, extensibility.
- Trade-off: initial setup overhead before full runtime implementation.
