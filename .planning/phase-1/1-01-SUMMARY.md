---
phase: 1
plan: 01
subsystem: plugin-foundation
tags: [scaffold, build-toolchain, plugin-manifest, entry-point]
dependency-graph:
  requires: []
  provides: [project-scaffold, build-pipeline, test-pipeline, plugin-manifest, register-stub]
  affects: [all-phase-1-plans]
tech-stack:
  added: [typescript-5.7, tsdown-0.20, vitest-4.0, typebox-0.34]
  patterns: [esm-only, zero-runtime-deps, peer-dep-openclaw]
key-files:
  created:
    - package.json
    - tsconfig.json
    - tsdown.config.ts
    - vitest.config.ts
    - .gitignore
    - .npmrc
    - openclaw.plugin.json
    - src/index.ts
    - test/smoke.test.ts
  modified: []
decisions:
  - outExtensions config added to tsdown to produce .js/.d.ts instead of default .mjs/.d.mts
metrics:
  duration: 191s
  completed: 2026-02-18T03:44:32Z
requirements: [PLUG-01, PLUG-02, PLUG-05]
---

# Phase 1 Plan 01: Project Scaffold and Plugin Manifest Summary

ESM project scaffold with tsdown build, vitest test suite, zero runtime npm dependencies, and OpenClaw plugin manifest with stub register function.

## What Was Built

### Task 1: Project scaffold and build toolchain
- `package.json` with `@careagent/provider-core` identity, zero runtime dependencies (`dependencies: {}`), OpenClaw peer dependency, ESM-only config, Node >=22.12.0 engine requirement
- `tsconfig.json` targeting ES2023/NodeNext with strict mode and all recommended checks
- `tsdown.config.ts` producing ESM bundle with `.js`/`.d.ts` output extensions, sourcemaps, and DTS generation
- `vitest.config.ts` with v8 coverage provider and 80% threshold gates on lines/branches/functions/statements
- `.gitignore` excluding node_modules, dist, coverage, tsbuildinfo, .DS_Store
- `.npmrc` with `shamefully-hoist=false` and `strict-peer-dependencies=false`
- All devDependencies installed via pnpm

### Task 2: Plugin manifest and entry point stub
- `openclaw.plugin.json` declaring plugin ID, name, description, empty configSchema/skills/commands/hooks
- `src/index.ts` with default-exported `register(api: unknown): void` stub function
- `test/smoke.test.ts` with two assertions: register is a function, register accepts argument without throwing
- Build verified: `dist/index.js` and `dist/index.d.ts` produced
- Tests verified: 2/2 passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tsdown output file extensions**
- **Found during:** Task 2 (build step)
- **Issue:** tsdown 0.20 defaults to `.mjs`/`.d.mts` output extensions, but `package.json` exports reference `./dist/index.js` and `./dist/index.d.ts`
- **Fix:** Added `outExtensions: () => ({ js: '.js', dts: '.d.ts' })` to `tsdown.config.ts`
- **Files modified:** tsdown.config.ts
- **Commit:** 5ca735d

## Verification Results

| Check | Result |
|-------|--------|
| pnpm install | PASS |
| pnpm build (dist/index.js + dist/index.d.ts) | PASS |
| pnpm test (2/2 tests) | PASS |
| Zero runtime dependencies | PASS |

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 02daf8d | chore(1-01): initialize project scaffold and build toolchain |
| 2 | 5ca735d | feat(1-01): add plugin manifest, entry point stub, and smoke test |

## Self-Check: PASSED

All 9 created files verified on disk. Both commit hashes (02daf8d, 5ca735d) found in git log. Build outputs (dist/index.js, dist/index.d.ts) confirmed.
