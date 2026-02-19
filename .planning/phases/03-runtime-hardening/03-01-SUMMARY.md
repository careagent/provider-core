---
phase: 03-runtime-hardening
plan: 01
subsystem: hardening
tags: [tdd, tool-policy, exec-allowlist, pure-functions, cans-scope]

# Dependency graph
requires:
  - phase: 02.1-architectural-alignment
    provides: "HardeningEngine stub interface, ToolCallEvent type, CANSDocument schema"
provides:
  - "HardeningEngine.check() signature updated to accept ToolCallEvent"
  - "HardeningLayerFn type alias for pure layer functions"
  - "checkToolPolicy pure function (Layer 1 / HARD-01)"
  - "checkExecAllowlist pure function (Layer 2 / HARD-02)"
affects: [03-02, 03-03, 03-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure stateless layer functions: (event, cans) => HardeningLayerResult"
    - "CANS flag disabled = pass-through (graceful degradation)"
    - "Prohibited trumps permitted (deny-first for safety)"

key-files:
  created:
    - src/hardening/layers/tool-policy.ts
    - src/hardening/layers/exec-allowlist.ts
    - test/unit/hardening/layers/tool-policy.test.ts
    - test/unit/hardening/layers/exec-allowlist.test.ts
  modified:
    - src/hardening/types.ts
    - src/hardening/engine.ts
    - src/hardening/index.ts
    - src/entry/core.ts
    - test/unit/hardening/hardening.test.ts

key-decisions:
  - "HardeningEngine.check() accepts ToolCallEvent instead of raw (toolName, params) -- no consumers exist, breaking change is safe"
  - "Prohibited trumps permitted in tool-policy layer -- safety-first deny model"
  - "Conservative exec allowlist: read-only utilities + git; extensible in future phases"
  - "EXEC_TOOL_NAMES includes both 'Bash' and 'exec' for multi-platform compatibility"

patterns-established:
  - "Pure layer pattern: (event: ToolCallEvent, cans: CANSDocument) => HardeningLayerResult"
  - "Layer pass-through: when CANS flag disabled, return { allowed: true, reason: '<flag> disabled' }"
  - "makeEvent/makeCans test helpers for hardening layer tests"

# Metrics
duration: 191s
completed: 2026-02-19
---

# Phase 03 Plan 01: Hardening Types and Layers 1-2 Summary

**Tool-policy allowlist and exec-allowlist as pure stateless functions with TDD, HardeningLayerFn type system for composable layer checks**

## Performance

- **Duration:** 191s (3 min 11s)
- **Started:** 2026-02-19T15:55:39Z
- **Completed:** 2026-02-19T15:58:50Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Expanded HardeningEngine.check() signature to accept ToolCallEvent (breaking change to stub, safe since no consumers exist)
- Added HardeningLayerFn type alias exported from types.ts, index.ts, and entry/core.ts
- Implemented Layer 1 (tool-policy) with 6 passing tests: allowlist model with prohibited-trumps-permitted safety guarantee
- Implemented Layer 2 (exec-allowlist) with 8 passing tests: conservative read-only binary allowlist with pass-through for non-exec tool calls
- Full test suite: 460 tests passing, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand hardening types and implement Layer 1 (tool-policy) with TDD** - `d2356da` (feat)
2. **Task 2: Implement Layer 2 (exec-allowlist) with TDD** - `f6762ad` (feat)

_TDD flow per task: RED (failing tests) -> GREEN (implementation) -> verify_

## Files Created/Modified
- `src/hardening/types.ts` - Added ToolCallEvent import, updated check() signature, added HardeningLayerFn type alias
- `src/hardening/engine.ts` - Updated stub check() parameter to match new ToolCallEvent signature
- `src/hardening/index.ts` - Added HardeningLayerFn to re-exports
- `src/entry/core.ts` - Added HardeningLayerFn to core entry point re-exports
- `src/hardening/layers/tool-policy.ts` - Layer 1: checkToolPolicy pure function (HARD-01)
- `src/hardening/layers/exec-allowlist.ts` - Layer 2: checkExecAllowlist pure function (HARD-02)
- `test/unit/hardening/layers/tool-policy.test.ts` - 6 test cases covering permit/deny/both/neither/disabled/empty
- `test/unit/hardening/layers/exec-allowlist.test.ts` - 8 test cases covering non-exec/allowlisted/denied/bare/empty/disabled/args/exec-tool
- `test/unit/hardening/hardening.test.ts` - Updated existing check() calls to use ToolCallEvent

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| check() accepts ToolCallEvent instead of (toolName, params) | Structured event type is safer and more extensible; no consumers exist to break |
| Prohibited trumps permitted | Safety-first: if a tool appears in both lists, deny always wins |
| Conservative base allowlist (cat, ls, head, tail, wc, git, grep, find, echo, sort, uniq, diff) | Read-only utilities for safe operation; git included for version control workflows |
| EXEC_TOOL_NAMES = Bash + exec | Multi-platform compatibility: OpenClaw uses 'Bash', other platforms may use 'exec' |
| Allowlist includes bare names + /bin/ + /usr/bin/ paths | Environments vary in how they reference binaries; covering all three forms ensures reliability |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing stub tests for new check() signature**
- **Found during:** Task 1 (types expansion)
- **Issue:** Existing hardening.test.ts called `engine.check('test-tool')` which no longer matches the ToolCallEvent signature
- **Fix:** Updated to `engine.check({ toolName: 'test-tool' })` in two test cases
- **Files modified:** test/unit/hardening/hardening.test.ts
- **Verification:** All 7 existing stub tests still pass
- **Committed in:** d2356da (Task 1 commit)

**2. [Rule 2 - Missing Critical] Exported HardeningLayerFn from entry/core.ts**
- **Found during:** Task 1 (types expansion)
- **Issue:** Plan specified exporting from types.ts and index.ts but not from the core entry point, which is the public API surface
- **Fix:** Added HardeningLayerFn to the type re-export in src/entry/core.ts
- **Files modified:** src/entry/core.ts
- **Verification:** Import available via @careagent/provider-core/core
- **Committed in:** d2356da (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Layers 1 and 2 are pure functions, ready to be composed by the hardening engine (Plan 03)
- HardeningLayerFn type enables type-safe layer registration
- CANS flag disabled = pass-through pattern established for all future layers
- 460 tests passing; layer test patterns (makeEvent/makeCans) reusable for Plans 02-04

## Self-Check: PASSED

All 9 files verified present. Both task commits (d2356da, f6762ad) verified in git log. 460 tests passing.

---
*Phase: 03-runtime-hardening*
*Completed: 2026-02-19*
