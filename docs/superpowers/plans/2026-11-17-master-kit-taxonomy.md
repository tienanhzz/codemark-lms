# Master Kit taxonomy implementation plan

**Goal:** Install and expose all 73 legacy taxonomy IDs according to the revised Master Kit contract: six separate categories and 67 reusable tags, for both lessons and questions.

**Sources:** `master-kit/contracts/core-api/learning-taxonomy.example.json`, `master-kit (1)/contracts/core-api/learning-taxonomy.example.json`, ADR-0004, PRODUCT_REQUIREMENTS taxonomy section and API_CONTRACTS.

**Constraints:** Preserve stable IDs, EN/VI names, navigation-only tag hierarchy, applicability, history and admin edits. No forced tag-descendant matching. Permissions and audits apply to writes. Existing manual assessment behavior remains compatible.

- [x] Read sources and compare every legacy ID with revised category/tag data; inspect actual local catalog.
- [x] Add safe audited local installer reusing version-checked import; test exact metadata, idempotence, partial catalog refusal and authorization.
- [x] Add explicit category-descendant search and lesson-plan tag references with validation and history preservation.
- [x] Add persisted direct any/all tag assignment criteria; resolve and snapshot ordered question/version IDs at publication, preserving published content.
- [x] Improve admin taxonomy hierarchy, counts, bilingual search and scope switching.
- [x] Verify targeted API/UI checks, typing/build, actual PostgreSQL migration/import, and desktop/mobile flows.

## Validation notes
Initial PostgreSQL catalog was empty, version1. Bundled public catalog already matched revised six/67 source; legacy has 73 unified IDs. Tests must verify behavior, not treat a successful import as completion of lesson and assessment requirements.

Verified32 targeted API tests,54 relevant UI tests, full app mypy69files, TypeScript, contract validation (199paths/230operations/19schemas/17examples) and production build. Independent code review found no important defects. Applied migration0051 with private backup/count parity; installed both scopes atversion2; repeat installation made no changes. Afterwards a concurrent administrator action retired question tag breadth-first-search and advanced catalog toversion3; preserve that edit. Both scopes retain all67tag IDs; active question count is66, lesson count67.

Browser QA used real student-authorized PostgreSQL catalog reads with a UI-only admin role fixture (no account/session permission changes) to verify hierarchy, accent-insensitive bilingual search, ancestor context, scope switching and desktop/mobile overflow. Admin writes/authorization were tested against isolated API fixtures. No fictional lessons, questions or assessments were inserted into the live database.

Local installer: `cyb3rt1tan-lms/.venv/Scripts/python.exe cyb3rt1tan-lms/scripts/install-local-taxonomy.py --apply`. It refuses to replace a modified or partial catalog; ongoing catalog changes belong in audited Admin CRUD.
