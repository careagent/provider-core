---
phase: 03-runtime-hardening
plan: 03
subsystem: hardening
tags: [tdd, engine, canary, short-circuit, audit-integration, adapter-hooks]

# Dependency graph
requires:
  - phase: 03-runtime-hardening
    plan: "01"
    provides: "checkToolPolicy (Layer 1), checkExecAllowlist (Layer 2), HardeningLayerFn type"
  - phase: 03-runtime-hardening
    plan: "02"
    provides: "checkCansInjection (Layer 3), checkDockerSandbox (Layer 4), injectProtocol, extractProtocolRules"
provides:
  - "createHardeningEngine() real implementation replacing stub"
  - "Engine.check() composes 4 layers with short-circuit-on-deny"
  - "Engine.activate() wires onBeforeToolCall and onAgentBootstrap hooks"
  - "Engine.injectProtocol() extracts CANS rules as string array"
  - "setupCanary() hook liveness detection with 30s timeout (HARD-07)"
  - "Updated hardening/index.ts with layers, canary, detectDocker exports"
affects: [03-04-PLAN, integration-tests, runtime-activation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Engine orchestrator: compose pure layer functions with short-circuit-on-deny"
    - "Per-layer audit logging with trace IDs for correlated events"
    - "Hook canary with unref'd timer for degradation detection"
    - "Idempotent markVerified() guards against duplicate audit entries"

key-files:
  created:
    - src/hardening/canary.ts
    - test/unit/hardening/canary.test.ts
  modified:
    - src/hardening/engine.ts
    - src/hardening/index.ts
    - test/unit/hardening/hardening.test.ts

key-decisions:
  - "Engine iterates LAYERS array in fixed order; short-circuits on first deny"
  - "Every layer result audit-logged (not just denies) for full traceability"
  - "Canary timer unref'd to avoid keeping Node.js alive on clean shutdown"
  - "before_tool_call handler marks canary verified before running check()"

patterns-established:
  - "Engine orchestrator pattern: array of HardeningLayerFn composed with short-circuit"
  - "Mock adapter pattern: _toolCallHandler / _bootstrapHandler accessors for test hook invocation"
  - "Mock audit pattern: _calls array for asserting audit entry sequences"
  - "Fake timers for canary timeout testing"

# Metrics
duration: 180s
completed: 2026-02-19
---

# Phase 3 Plan 03: Hardening Engine Orchestrator and Canary Summary

**Engine orchestrator composing 4 layers with short-circuit-on-deny, full per-layer audit logging, adapter hook wiring, and hook liveness canary with 30s timeout**

## Performance

- **Duration:** 180s (3 min)
- **Started:** 2026-02-19T16:01:47Z
- **Completed:** 2026-02-19T16:04:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced stub engine with real implementation composing all 4 hardening layers in sequence
- Short-circuit-on-deny: first denying layer halts evaluation, only 1 audit entry logged (not 4)
- Every layer result (allow and deny) audit-logged with trace IDs for correlated event groups
- activate() registers both onBeforeToolCall and onAgentBootstrap hooks via PlatformAdapter
- Hook liveness canary (HARD-07): 30s timeout warns provider when before_tool_call never fires
- Canary markVerified() is idempotent; timer is unref'd for clean Node.js shutdown
- 23 new tests (14 engine + 9 canary) replacing 7 stub tests; 476 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement engine orchestrator with TDD** - `4c64538` (feat)
2. **Task 2: Implement canary module (HARD-07) with TDD** - `58b8983` (feat)

_TDD flow per task: RED (failing tests) -> GREEN (implementation) -> verify_

## Files Created/Modified
- `src/hardening/engine.ts` - Real engine orchestrator: activate, check, injectProtocol with 4-layer composition
- `src/hardening/canary.ts` - Hook liveness canary with 30s timeout and audit logging (HARD-07)
- `src/hardening/index.ts` - Updated re-exports: layers, canary, detectDocker, extractProtocolRules
- `test/unit/hardening/hardening.test.ts` - 14 comprehensive engine tests replacing 7 stub tests
- `test/unit/hardening/canary.test.ts` - 9 canary tests with fake timers for timeout behavior

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Engine iterates LAYERS array in fixed order; short-circuits on first deny | Predictable evaluation order; deny-fast reduces unnecessary computation |
| Every layer result audit-logged (not just denies) | Full traceability for compliance; allows forensic review of what was allowed and why |
| Canary timer unref'd | Prevents background timer from keeping Node.js process alive after plugin cleanup |
| before_tool_call handler marks canary verified before running check() | Canary tracks hook liveness, not check outcomes; verification happens regardless of allow/deny |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Engine is the core integration point for all hardening; ready for Plan 04 (integration/activation wiring)
- All 4 layers composed and tested: tool-policy, exec-allowlist, cans-injection, docker-sandbox
- Canary monitors hook wiring at runtime; degradation is logged, not silent
- 476 tests passing across 35 test files; zero regressions
- Only Plan 04 remains in Phase 3

## Self-Check: PASSED

All 5 files verified present. Both task commits (4c64538, 58b8983) verified in git log. 476 tests passing.

---
*Phase: 03-runtime-hardening*
*Completed: 2026-02-19*
