---
phase: 1
plan: 03
subsystem: activation
tags: [yaml-parser, frontmatter, integrity, activation-gate, sha256]
dependency-graph:
  requires: [project-scaffold, build-pipeline, cans-schema, valid-cans-fixture]
  provides: [yaml-vendor, frontmatter-parser, integrity-check, activation-gate]
  affects: [register-wiring, integration-tests]
tech-stack:
  added: [yaml-2.8]
  patterns: [vendored-dependency, first-load-trust, four-step-activation]
key-files:
  created:
    - src/vendor/yaml/index.ts
    - src/activation/cans-parser.ts
    - src/activation/cans-integrity.ts
    - src/activation/gate.ts
    - test/unit/activation/cans-parser.test.ts
    - test/unit/activation/cans-integrity.test.ts
    - test/unit/activation/gate.test.ts
    - test/fixtures/valid-cans.md
    - test/fixtures/malformed-cans.md
    - test/fixtures/tampered-cans.md
  modified:
    - package.json
    - pnpm-lock.yaml
key-decisions:
  - "Vendored yaml via src/vendor/yaml/index.ts for centralized, replaceable YAML parsing"
  - "First-load trust model: first verifyIntegrity call stores hash, subsequent calls compare"
  - "AuditCallback type decouples gate from audit pipeline (injected at construction)"
requirements: [CANS-01, CANS-06, CANS-07]
metrics:
  duration: 198s
  completed: 2026-02-18
---

# Phase 1 Plan 03: CANS Parser, Activation Gate, and Integrity Check Summary

Vendored YAML 1.2 parser, frontmatter extraction, SHA-256 integrity checking with first-load trust, and four-step ActivationGate (presence, parse, validate, integrity).

## What Was Built

### Task 1: Vendor YAML Parser and Frontmatter Parser

**Vendored YAML** (`src/vendor/yaml/index.ts`): Centralized re-export of the `yaml` package (ISC license, zero dependencies). tsdown bundles this into the dist output since it is not in the `external` list. This makes YAML parsing replaceable from a single location.

**Frontmatter Parser** (`src/activation/cans-parser.ts`): Extracts YAML frontmatter from `---` delimited blocks in markdown files. Returns a typed `ParsedFrontmatter` result with the parsed object, remaining body text, and optional error message. Uses YAML 1.2 (avoids the Norway problem where `NO` is coerced to `false`).

**Tests** (10 cases): Valid parsing, missing delimiters, empty blocks, invalid YAML, array rejection, body extraction, YAML 1.2 `NO` preservation, leading whitespace, nested objects.

### Task 2: Integrity Checking and Activation Gate

**Integrity Checker** (`src/activation/cans-integrity.ts`): SHA-256 hash computation and verification using Node.js `node:crypto` built-in. Implements a first-load trust model:
- First call: stores the content hash in `.careagent/cans-integrity.json` and returns `{ valid: true, isFirstLoad: true }`
- Subsequent calls: compares current content hash against stored hash
- `updateKnownGoodHash()` allows explicit hash updates (for authorized CANS.md changes)

**Activation Gate** (`src/activation/gate.ts`): The `ActivationGate` class performs a four-step check:
1. **Presence**: CANS.md exists in workspace
2. **Parse**: Frontmatter extraction succeeds
3. **Validate**: TypeBox schema validation passes
4. **Integrity**: SHA-256 hash matches stored value

Each failure mode emits a structured audit entry via the injected `AuditCallback`, decoupling the gate from the audit pipeline implementation.

**Test Fixtures**:
- `valid-cans.md`: Complete valid CANS document matching the TypeBox schema
- `malformed-cans.md`: Invalid `license.type: RN` and `autonomy.chart: auto`
- `tampered-cans.md`: Valid schema but different content (name changed)

**Tests** (24 cases across 2 files): Hash consistency, first-load trust, tamper detection, corrupted store handling, hash updates, gate presence/parse/validate/integrity checks, audit callback verification, typed field accessibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ESM-incompatible require() in integrity test**
- **Found during:** Task 2
- **Issue:** Used `const { mkdirSync } = require('node:fs')` in a test, which fails in ESM mode
- **Fix:** Added `mkdirSync` to the top-level ESM import from `node:fs`
- **Files modified:** test/unit/activation/cans-integrity.test.ts
- **Commit:** d9efea9

## Verification Results

- Build: PASSED (`pnpm build` -- tsdown bundles yaml into output)
- Tests: 87 total, 87 passed (34 new activation tests + 53 existing)
- New test files: cans-parser (10), cans-integrity (7), gate (7) + 10 existing cans-schema tests

## Commits

| Hash | Message |
|------|---------|
| a00a947 | feat(1-03): vendor YAML parser and create frontmatter parser |
| d9efea9 | feat(1-03): add integrity checking and activation gate |

## Self-Check: PASSED

All 11 created files verified present. Both commit hashes (a00a947, d9efea9) verified in git history.
