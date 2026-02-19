---
phase: 04-clinical-skills
plan: 05
subsystem: skills
tags: [entry-points, integration-tests, skill-loading, core-exports, openclaw-plugin, SKIL-01, SKIL-02, SKIL-03, SKIL-04, SKIL-07]
dependency_graph:
  requires: [skill-loader, credential-validator, audit-pipeline, hardening-engine, entry-points]
  provides: [skill-wiring, integration-tests, core-skill-exports]
  affects: [openclaw-entry, standalone-entry, core-entry, plugin-manifest]
tech_stack:
  added: []
  patterns: [non-fatal-skill-loading, import-meta-url-path-resolution, error-boundary-wrapping]
key_files:
  created:
    - test/integration/skills.test.ts
  modified:
    - src/entry/openclaw.ts
    - src/entry/standalone.ts
    - src/entry/core.ts
    - openclaw.plugin.json
decisions:
  - "Skill loading wrapped in try/catch -- non-fatal in both entry points to avoid breaking activation on skill errors"
  - "import.meta.url path resolution for ESM-compatible plugin root detection"
  - "Skills re-exported through core.ts for complete API surface via @careagent/provider-core/core"
  - "openclaw.plugin.json declares skills/chart-skill for OpenClaw discovery"
metrics:
  duration: 194s
  completed: 2026-02-19T21:38:31Z
  tasks: 2
  files: 5
  tests_added: 14
  tests_removed: 0
  test_total: 608
---

# Phase 4 Plan 05: Entry-Point Wiring and Integration Tests Summary

Skill loading pipeline wired into both entry points (openclaw.ts, standalone.ts) with non-fatal error handling, core.ts re-exports expanded with full skills API surface, and 14 end-to-end integration tests covering credential gating, integrity verification, version pinning, CANS rules, and audit trail completeness.

## Tasks Completed

### Task 1: Wire skill loading into entry points and update re-exports

- Updated `src/entry/openclaw.ts` with Step 6.5 (clinical skill loading) between hardening engine activation and audit integrity service, wrapped in try/catch with adapter logging for loaded/blocked skills
- Updated `src/entry/standalone.ts` with skill loading after hardening engine activation, returning `skills` array on `ActivateResult` interface; non-fatal error handling via empty catch
- Added `fileURLToPath`/`dirname`/`join` imports for ESM-compatible plugin root resolution via `import.meta.url`
- Updated `src/entry/core.ts` with complete skills module re-exports: types (SkillManifest, SkillLoadResult, ChartTemplate, TemplateSection, VoiceDirectives), schema (SkillManifestSchema, validateManifest), integrity (computeSkillFileHash, computeSkillChecksums, verifySkillIntegrity), version-pin (checkVersionPin, approveVersion), loader (loadClinicalSkills), chart-skill (getTemplate, getAllTemplates, CHART_SKILL_ID, buildChartSkillInstructions, extractVoiceDirectives, buildVoiceInstructions)
- Updated credentials comment from "interface-only -- implementation in Phase 4" to "implementation -- Phase 4"
- Updated `openclaw.plugin.json` skills array from `[]` to `["skills/chart-skill"]`
- Updated doc comments to reflect Phase 4 wiring

### Task 2: End-to-end integration tests

- Created `test/integration/skills.test.ts` with 14 tests across 7 describe blocks
- Test helpers: `makeWorkspace()` (temp dir with .careagent), `makeSkillsDir()`, `addTestSkill()` (computes real SHA-256 hashes with optional tamper), `makeCANS()` (fully valid CANSDocument), `readAuditLog()`
- SKIL-01 Credential gating e2e: MD passes MD/DO requirement, NP blocked from MD/DO, audit has credential_check entries (3 tests)
- SKIL-02 Regular skills: directory with SKILL.md but no manifest not in results (1 test)
- SKIL-03 Integrity verification e2e: correct checksums load, tampered SKILL.md fails with Hash mismatch (2 tests)
- SKIL-04 Version pinning e2e: matching approved_version loads, mismatched blocked, audit has version_check denied, no credential/integrity entries for version-blocked skill (4 tests)
- SKIL-07 Audit trail completeness: successful load produces entries in order (discovery, version_check, credential_check, integrity_check, load) with correct outcomes (1 test)
- Multiple skills mixed outcomes: MD loads MD-requiring skill, blocks Dermatology specialty (1 test)
- CANS rules integration: rules block skill that would otherwise pass by adding privilege requirement (1 test)
- Hash chain integrity: audit.verifyChain() returns valid after skill loading (1 test)

## Commits

| Hash | Message |
|------|---------|
| 22129c5 | feat(04-05): wire clinical skills into entry points with integration tests |

## Verification Results

- `npx vitest run` -- 608 tests pass (42 test files), zero regressions
- `npm run build` -- succeeds, all 4 entry points build cleanly (index, openclaw, standalone, core)
- New integration test file: 14 tests all passing

## Decisions Made

1. **Non-fatal skill loading in both entry points:** Skill loading wrapped in try/catch so a skill error never prevents the plugin from activating. In openclaw.ts, errors are logged to adapter and audit. In standalone.ts, errors are silently caught (skills array remains empty).

2. **import.meta.url path resolution:** Uses `fileURLToPath(import.meta.url)` for ESM-compatible plugin root detection. Resolves `../../` from the entry point to find the `skills/` directory at the package root.

3. **Complete skills API surface on core.ts:** All skills module exports re-exported through core.ts, matching the pattern used for hardening (Phase 3) and credentials (Phase 4). Consumers can import everything from `@careagent/provider-core/core`.

4. **Plugin manifest declares chart-skill:** `openclaw.plugin.json` updated with `"skills": ["skills/chart-skill"]` for OpenClaw skill discovery.

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] test/integration/skills.test.ts exists
- [x] src/entry/openclaw.ts modified with skill loading
- [x] src/entry/standalone.ts modified with skill loading
- [x] src/entry/core.ts modified with skills re-exports
- [x] openclaw.plugin.json modified with chart-skill
- [x] Commit 22129c5 exists in git log
