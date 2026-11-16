# ADR-0006: Dependency Management and Opaque Resource References

- Status: Accepted
- Date: 2026-11-06

## Context

The application must not depend on public CDNs or third-party hosted APIs at runtime. Public URLs must not expose sequential database identifiers such as `/courses/1`. The system also needs a controlled service boundary for encrypting and decoding references where concealing internal identifiers is required.

## Decision

- Dependencies may be installed via their language/package manager from approved package registries during development and CI; exact versions and lockfiles are required, and dependency provenance/license/security review remains required.
- Application runtime must not fetch scripts, styles, fonts, or images from third-party CDNs or remote asset hosts. Bundle/self-host all runtime dependencies and assets. Runtime Internet egress, telemetry, and third-party APIs remain prohibited unless separately approved by a security-reviewed ADR.
- Authenticated APIs between this LMS's own services are permitted; they are not third-party integrations.
- Invitation email is sent through an administrator-approved, self-hosted SMTP relay, not a third-party email API.
- Use random, non-sequential public identifiers for ordinary resource URLs. Never expose sequential database keys.
- Provide one backend `ResourceReferenceCodec` abstraction for encrypted references when there is a specific concealment need. Use maintained local crypto libraries and standard authenticated encryption (AES-256-GCM), with managed keys, fresh nonces, context binding, key identifiers, rotation, and tamper rejection. Do not create a proprietary cipher.
- Identifiers and encrypted references do not grant access. Backend authorization is checked on every operation.

## Rationale

Installing dependencies from package registries during development/build allows the project to use maintained libraries without requiring them to be preinstalled. Bundling runtime dependencies/assets prevents CDN and remote-asset reliance. Random public IDs prevent simple sequential enumeration. Standard authenticated encryption can conceal internal identifiers for special cases without introducing custom cryptographic risk.

## Consequences

- The project may use package registries during development/build. New dependencies still require a controlled manifest/lockfile update and review.
- CI may use hosted actions and fetch build-time packages, but must keep exact versions, integrity checks, and visible security-scan results.
- Production runtime network restrictions remain independent of build-time package access and must be enforced/tested separately.
- Public resource references are not authorization tokens; object-level and course-level access checks remain mandatory.
- Key provisioning, rotation, and reference lifetime must be designed before implementing the codec.
- Runtime libraries, package manifests, backend codec implementation, and enforcement are not yet complete. `SECURITY_STANDARDS.md` is the authoritative control baseline.
