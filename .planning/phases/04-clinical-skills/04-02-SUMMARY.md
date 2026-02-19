---
phase: 04-clinical-skills
plan: 02
subsystem: skills
tags: [skill-framework, manifest-schema, integrity, version-pin, SKIL-03, SKIL-04]
dependency_graph:
  requires: [typebox, node-crypto]
  provides: [skill-types, manifest-schema, integrity-checker, version-pin]
  affects: [skill-loader, chart-skill]
tech_stack:
  added: []
  patterns: [sha256-checksumming, typebox-validation, immutable-update]
key_files:
  created:
    - src/skills/types.ts
    - src/skills/manifest-schema.ts
    - src/skills/integrity.ts
    - src/skills/version-pin.ts
    - test/unit/skills/manifest-schema.test.ts
    - test/unit/skills/integrity.test.ts
    - test/unit/skills/version-pin.test.ts
  modified: []
decisions:
  - "Plain TypeScript interfaces in types.ts, separate TypeBox schema in manifest-schema.ts -- downstream modules import types without TypeBox dependency"
  - "verifySkillIntegrity skips skill-manifest.json entry to avoid self-referential checksum issues"
  - "Fail-fast on first hash mismatch or missing file -- returns immediately with specific reason"
  - "Truncated hashes in mismatch reasons (12 chars + ...) -- consistent with cans-integrity.ts pattern"
  - "approveVersion creates deep copies of requires and files objects to guarantee no mutation"
  - "Version pin check requires pinned=true AND availableVersion provided AND differs from approved -- all three conditions"
metrics:
  duration: 140s
  completed: 2026-02-19T21:24:00Z
  tasks: 2
  files: 7
  tests_added: 39
  tests_removed: 0
  test_total: 543
---

# Phase 4 Plan 02: Skill Framework Core Summary

TypeBox manifest schema with validateManifest(), SHA-256 integrity verification for skill directories, and version pinning logic with immutable approval -- 39 tests across 3 test files.

## Tasks Completed

### Task 1: Skill types and manifest schema
- Created `src/skills/types.ts` with SkillManifest, SkillLoadResult, ChartTemplate, TemplateSection, VoiceDirectives interfaces
- Created `src/skills/manifest-schema.ts` with TypeBox schema enforcing semver version pattern, minLength skill_id, optional credential arrays, and Record<string,string> file checksums
- `validateManifest()` returns discriminated union: `{valid: true, manifest}` or `{valid: false, errors}` with field paths
- 17 tests covering valid manifests, missing fields, invalid formats, extra fields, error reporting

### Task 2: Integrity verification and version pinning
- Created `src/skills/integrity.ts` with three functions: `computeSkillFileHash`, `computeSkillChecksums`, `verifySkillIntegrity`
- SHA-256 pattern reuses same `createHash('sha256').update(content, 'utf-8').digest('hex')` as cans-integrity.ts
- `computeSkillChecksums` sorts filenames for deterministic ordering, skips subdirectories
- `verifySkillIntegrity` skips self-referential skill-manifest.json, fails fast on first mismatch
- Created `src/skills/version-pin.ts` with `checkVersionPin` (three-condition update detection) and `approveVersion` (immutable update)
- 12 integrity tests using real temp directories with mkdtempSync
- 10 version-pin tests covering all pin/unpin combinations and immutability

## Commits

| Hash | Message |
|------|---------|
| 058c436 | feat(04-02): implement skill framework core (types, manifest, integrity, version-pin) |

## Verification Results

- `npx vitest run test/unit/skills/` -- 39 tests pass (3 test files)
- `npx vitest run` -- 543 tests pass (39 test files), zero regressions
- `npm run build` -- succeeds, all 4 entry points build cleanly

## Decisions Made

1. **Separate types from schemas:** Plain TypeScript interfaces in `types.ts` allow downstream modules (loader, chart-skill) to import types without pulling in TypeBox. The schema in `manifest-schema.ts` is only needed for manifest validation at load time.

2. **Self-referential checksum skip:** `verifySkillIntegrity` skips the `skill-manifest.json` entry because the manifest file itself would change after checksums are computed (chicken-and-egg problem).

3. **Fail-fast integrity:** Returns on first mismatch or missing file rather than collecting all errors. This is a security boundary -- one tampered file is sufficient to reject the skill.

4. **Truncated hashes in reasons:** Error messages show `expected abc123def456..., got xyz789abc123...` (12 chars) -- matching the cans-integrity.ts pattern for human-readable diagnostics.

5. **Immutable version approval:** `approveVersion` returns a new manifest with deep-copied `requires` and `files` objects, guaranteeing no mutation of the original.

6. **Three-condition update detection:** `checkVersionPin` only reports `updateAvailable: true` when ALL of: (a) manifest.pinned is true, (b) availableVersion is provided, (c) availableVersion differs from approved. Unpinned skills never report updates.

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] src/skills/types.ts exists
- [x] src/skills/manifest-schema.ts exists
- [x] src/skills/integrity.ts exists
- [x] src/skills/version-pin.ts exists
- [x] test/unit/skills/manifest-schema.test.ts exists
- [x] test/unit/skills/integrity.test.ts exists
- [x] test/unit/skills/version-pin.test.ts exists
- [x] Commit 058c436 exists in git log
