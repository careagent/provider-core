---
phase: 03-runtime-hardening
plan: 04
subsystem: hardening
tags: [engine-wiring, entry-points, integration-tests, audit-trail, canary, end-to-end]

# Dependency graph
requires:
  - phase: 03-runtime-hardening
    plan: "03"
    provides: "createHardeningEngine real implementation, setupCanary, 4-layer composition"
  - phase: 03-runtime-hardening
    plan: "01"
    provides: "checkToolPolicy (Layer 1), checkExecAllowlist (Layer 2)"
  - phase: 03-runtime-hardening
    plan: "02"
    provides: "checkCansInjection (Layer 3), checkDockerSandbox (Layer 4), injectProtocol"
provides:
  - "Engine-wired openclaw.ts replacing inline canary with engine.activate()"
  - "Engine activation in standalone.ts degraded mode with HardeningEngine on ActivateResult"
  - "Complete hardening public API surface via core.ts re-exports"
  - "10 end-to-end integration tests covering HARD-01 through HARD-07"
  - "Phase 3 complete: all 7 hardening requirements implemented and tested"
affects: [phase-4-credentials, phase-5-integration, runtime-activation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Engine wiring: createHardeningEngine().activate() replaces inline hook registration"
    - "Degraded mode: standalone entry point exposes engine for programmatic layer checks"
    - "Full-stack integration testing: real AuditPipeline + engine + mock adapter in temp workspaces"

key-files:
  created:
    - test/integration/hardening.test.ts
  modified:
    - src/entry/openclaw.ts
    - src/entry/standalone.ts
    - src/entry/core.ts

key-decisions:
  - "Engine replaces inline canary entirely: no backward-compat shim needed since canary was internal"
  - "Standalone exposes engine as optional on ActivateResult interface for programmatic use"
  - "Integration tests use real AuditPipeline (not mocks) for true end-to-end audit verification"

patterns-established:
  - "Engine wiring pattern: createHardeningEngine() -> activate({ cans, adapter, audit }) in entry point"
  - "Integration test mock API: captures handlers dictionary for direct invocation without OpenClaw"
  - "Audit log assertion: read AUDIT.log as JSON lines, filter by action, assert fields"

# Metrics
duration: 226s
completed: 2026-02-19
---

# Phase 3 Plan 04: Entry Point Wiring and Integration Tests Summary

**Hardening engine wired into openclaw.ts (replacing inline canary) and standalone.ts (degraded mode), with 10 end-to-end integration tests verifying all HARD-01 through HARD-07 requirements**

## Performance

- **Duration:** 226s (3 min 46s)
- **Started:** 2026-02-19T16:07:27Z
- **Completed:** 2026-02-19T16:11:13Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Replaced inline canary in openclaw.ts with engine.activate() -- the hardening engine now owns all hook registration (before_tool_call, agent:bootstrap) and canary lifecycle
- Added engine activation in standalone.ts when CANS is active -- degraded mode where hooks no-op but layers 1-4 still evaluate programmatically
- Updated core.ts to export complete hardening API: all 4 layer functions, setupCanary, detectDocker, extractProtocolRules, injectProtocol, CanaryHandle type
- Created 10 end-to-end integration tests that exercise the full hardening flow: CANS -> engine -> layers -> audit -> canary
- Full test suite: 486 tests passing across 36 files (10 new hardening integration tests)
- Build succeeds with all 4 entry points

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire engine into entry points and update core re-exports** - `117eceb` (feat)
2. **Task 2: End-to-end hardening integration tests** - `4a4d710` (feat)
3. **Task 3: Final verification and test suite health check** - verification only, no code changes

## Files Created/Modified
- `src/entry/openclaw.ts` - Replaced inline canary (Steps 6+8) with engine.activate() (Step 6 only)
- `src/entry/standalone.ts` - Added engine activation in degraded mode, exposed HardeningEngine on ActivateResult
- `src/entry/core.ts` - Re-exports all hardening layers, canary, detectDocker, CanaryHandle type
- `test/integration/hardening.test.ts` - 10 end-to-end tests for HARD-01 through HARD-07

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Engine replaces inline canary entirely | Canary was internal implementation; engine owns the complete hook lifecycle now |
| Standalone exposes engine as optional on ActivateResult | Programmatic consumers can call engine.check() directly for layer evaluation |
| Integration tests use real AuditPipeline, not mocks | True end-to-end verification of audit entries written to disk with hash chaining |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed require() to ESM import in test 10**
- **Found during:** Task 2 (Integration tests)
- **Issue:** `require('../../src/index.js')` fails in ESM/Vitest context; needed static import
- **Fix:** Changed to ESM `import register from '../../src/index.js'` at top of file
- **Files modified:** test/integration/hardening.test.ts
- **Verification:** All 10 tests pass
- **Committed in:** 4a4d710 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial module system fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (Runtime Hardening) is COMPLETE: all HARD-01 through HARD-07 requirements implemented and tested
- 486 tests passing across 36 test files with zero regressions
- Build succeeds with all 4 entry points (index, openclaw, standalone, core)
- Hardening engine is the integration point for all safety layers
- Ready for Phase 4 (Credentials/Skills) to build on the hardened runtime

## Self-Check: PASSED

All 4 files verified present on disk. Both task commits (117eceb, 4a4d710) verified in git log. Inline canary (hookCanaryFired) confirmed removed from openclaw.ts. createHardeningEngine present in both entry points. checkToolPolicy exported from core.ts. 486 tests passing across 36 files.

---
*Phase: 03-runtime-hardening*
*Completed: 2026-02-19*
