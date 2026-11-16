# SOURCE_AUDIT

Status: **COMPLETE FOR THE FOUR NOMINATED SNAPSHOTS — no upstream content installed/imported**

- Audit date: 2026-11-05
- Requested agent targets: Claude Code, Cursor, GitHub Copilot (the currently specified adapters)
- Method: static review of GitHub repository metadata, pinned commit contents, license/manifest/readme, and selected installer/launcher/skill files. No upstream installer or script was executed, and no upstream content was copied into this repository.
- This decision covers only the exact snapshots below; it does not approve later commits, releases, npm packages, transitive dependencies, or unreviewed media assets.

## Summary

| Candidate | Owner / pinned snapshot | License / version | Compatibility and dependencies | Security / maintenance notes | Decision |
|---|---|---|---|---|---|
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `nextlevelbuilder` organization; `main` at [`b7d5353e0130feb8c5574ef1251f8a1db1873ccb`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/commit/b7d5353e0130feb8c5574ef1251f8a1db1873ccb), pushed 2026-11-05 | MIT; skill manifest 2.15.0; CLI package 2.5.0 | Explicitly supports Claude Code, Cursor, and Copilot. CLI needs Node/npm (or Bun for development); skill search uses Python 3 standard library. CLI dependencies include `commander`, `chalk`, `ora`, and `prompts`. | Security policy exists. Installer writes files under the project or home directory; `--force` overwrites and the legacy path downloads/extracts a release ZIP. `--dry-run` is available. Pin both the skill snapshot and CLI package; do not pass workflow credentials as GitHub tokens. | **Deferred** pending isolated installer/path testing and explicit import approval. Static guidance is a relevant candidate. |
| [impeccable](https://github.com/pbakaus/impeccable) | `pbakaus`; `main` at [`c8891a9ae865d6ee311836ae5199bfce0fe115b1`](https://github.com/pbakaus/impeccable/commit/c8891a9ae865d6ee311836ae5199bfce0fe115b1), pushed 2026-11-05 | Apache-2.0; npm package 4.8.0; native engine 0.1.18 | README lists Claude Code, Cursor, and GitHub Copilot. npm path requires Node >=18.19; native engine is shipped or fetched. Optional platform packages are pinned; engine downloads are checked against committed SHA-256 digests. | README documents hooks running outside model approval, with the first edit potentially downloading the engine. Live “Apply” may launch Codex or Claude with approval and sandbox bypass flags when no agent has polled, inheriting the environment. Telemetry sends anonymous design-direction selections; the README says project files/code are not sent. | **Deferred**; do not enable live Apply or unattended hooks in this project. Reconsider static guidance/detector separately after a constrained trial. |
| [taste-skill](https://github.com/Leonxlnx/taste-skill) | `Leonxlnx`; `main` at [`9b4bf937a1f69348126959c15d2f99a73e65699b`](https://github.com/Leonxlnx/taste-skill/commit/9b4bf937a1f69348126959c15d2f99a73e65699b), pushed 2026-11-05 | Repository MIT; skill 2.5.0 | README documents Claude/Codex plugins and agent skill layouts including Copilot/Cursor. Runtime scripts require Node 22+ and Chrome/Edge/Chromium; ffmpeg is optional. No root package manifest was present in the inspected root listing. Scripts may fetch fonts, icons, and photographs. | `install.sh` reads an install name from each `SKILL.md` frontmatter and uses it as a filesystem link name under agent directories without an apparent path-component allowlist. The current skill name is ordinary, but validate names before linking or update automation. Photo records carry individual Commons/Unsplash license and credit obligations; repository MIT does not replace those obligations. | **Deferred** pending install-name hardening and per-asset attribution/license review. Do not run `install.sh` on this snapshot. |
| [Animate UI](https://github.com/imskyleen/animate-ui) | `imskyleen`; pinned at [`1d00dd0fd203ff7f7f4f21e3c104592007283b72`](https://github.com/imskyleen/animate-ui/commit/1d00dd0fd203ff7f7f4f21e3c104592007283b72) | MIT with Commons Clause; React package 2.4.2, CLI 2.4.0; root snapshot 1.0.27 | Animated React and Vue primitives using Motion, including Radix UI, Base UI, React Aria, and reka-ui integrations. React package peers include React 19 and Motion 14; CLI requires Node >=22.12. This project has not selected an application framework. | Commons Clause permits use in an application but prohibits selling or redistributing the components themselves in original form, alone or bundled. Upstream CLI can rewrite project components; do not run it automatically or use floating `@latest`. The upstream skill includes reference material and a timing-check script; neither was copied or executed. | **Project-authored guidance added**; upstream skill/components are not vendored. Reassess package use once the UI stack and distribution model are settled, including license review. |

## Candidate findings

### UI/UX Pro Max

- The repository metadata reports MIT and an active `main`; the pinned `skill.json` reports skill version 2.15.0, while `cli/package.json` independently reports CLI version 2.5.0. These are separate version numbers and must not be conflated.
- The skill is focused on interface design and contains local searchable design guidance. Its skill instructions explicitly say search queries should not contain private project data.
- The default CLI installer generates files from bundled templates; `--dry-run` previews writes, and `--force` authorizes overwrites. The legacy ZIP flow and npm update path are additional code paths that should remain disabled unless separately reviewed.
- Use a pinned package/revision, run the dry-run in a disposable project first, inspect all planned target paths, and avoid using `GITHUB_TOKEN` or another broad workflow credential for public downloads.
- Evidence inspected: repository `LICENSE`, `SECURITY.md`, `skill.json`, `.claude/skills/ui-ux-pro-max/SKILL.md`, `cli/package.json`, `cli/src/commands/init.ts`, `cli/src/commands/update.ts`, and `cli/src/utils/template.ts`.

### Impeccable

- Repository and npm metadata report Apache-2.0. The npm package pins optional platform engine packages to 0.1.18; the inspected launcher and `fetch-engine.mjs` fail closed when no checksum exists and verify SHA-256 before using a downloaded engine.
- The primary install can add agent skills/hooks. The README explicitly warns that hooks may run outside model approval and that the first edit can download the engine.
- The documented live Apply fallback is a high-risk capability: if no chat agent polls, it starts `codex` or `claude` with permission/approval and sandbox bypass options, while inheriting the environment. This is documented behavior rather than a reproduced vulnerability, but it is unsuitable for unattended use in this project.
- The README says telemetry records anonymous design-direction impressions/selections, and states project name/files/code/product context are not sent. Keep telemetry disabled if project policy requires no analytics.
- Engine checksums mitigate binary substitution but do not make all hooks, npm dependencies, or agent permissions safe. A later review must pin the npm package and inspect hook behavior before enabling it.
- Evidence inspected: repository `LICENSE`, `package.json`, `.claude/skills/impeccable/SKILL.md`, `cli/bin/cli.js`, `skill/scripts/impeccable`, `skill/scripts/engine-checksums.txt`, and README installation/live/telemetry documentation.

### Taste Skill

- Repository metadata and `LICENSE` report MIT, but its photo catalog documents per-image licenses and attribution (including CC BY/CC BY-SA and Unsplash License). Review and preserve each asset's credits/license before redistributing any bundled media.
- README identifies external access for Google Fonts and additional photographs/icons and requires a real browser for page checks. This means using the skill may access the network and inspect a local rendered page; do not treat it as an offline-only prompt.
- The `install.sh` helper links skill directories into `~/.claude/skills` and/or `~/.codex/skills`. It reads `name` from skill frontmatter to construct link paths; add strict path-component validation and containment checks before using this installer or any automated update of its skill set.
- Evidence inspected: repository `LICENSE`, README, `skills/taste-skill/SKILL.md`, `install.sh`, `scripts/start.mjs`, `scripts/photos.mjs`, `scripts/icons.mjs`, and the photo catalog/credits.

### Animate UI

- The pinned README describes animated drop-in primitives for React and Vue. The inspected React package peers include React 19, Motion 14, and optional Radix UI, Base UI, React Aria, and related packages; the repository also contains Vue packages. The LMS UI framework has not yet been selected, so compatibility is not established.
- The repository includes an agent skill at `skills/animate-ui/SKILL.md` and a CLI that can swap shadcn primitives. The CLI must not be run against this scaffold or a future app without a pinned version, isolated backup, reviewed diff, and explicit approval.
- The repository license is MIT with the Commons Clause. It permits using the software in an application, including a commercial application, but forbids selling or redistributing the components themselves in original form, alone or bundled. Do not publish a component bundle or copy upstream component source into this repository; review the license against the eventual distribution model before adopting the package.
- A concise, project-authored guide was added at `modules/skills/animate-ui/SKILL.md`. It does not vendor the upstream skill or component code. It defines Animate UI as the implementation/microinteraction layer and UI/UX Pro Max as the design direction/accessibility layer, with reduced-motion and manual-review requirements.
- Evidence inspected at the pinned snapshot: root README and `package.json`, `LICENSE.md`, `skills/animate-ui/SKILL.md` metadata and `NOTICE.md`, `packages/react/package.json`, `packages/cli/package.json`, and `apps/v2/package.json`. No upstream code or scripts were installed or executed.

## Decision and follow-up

- No upstream skills are installed or approved for automatic installation.
- The first three exact snapshots remain **deferred**, not rejected as unusable. Animate UI is represented by a local project-authored guide only; package/component adoption remains conditional on framework compatibility and license review.
- Re-evaluate upstream sources only after the risk controls above and a product-level choice about which design capabilities to include.
- Future updates require a new pinned commit/version and re-audit. Do not use floating `@latest`, unpinned GitHub branches, or an installer with write access to a developer home/project without a reviewed dry-run.
