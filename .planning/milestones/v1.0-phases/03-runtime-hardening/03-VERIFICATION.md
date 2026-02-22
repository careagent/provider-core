---
phase: 03-runtime-hardening
verified: 2026-02-19T16:15:24Z
status: passed
score: 5/5 phase-level success criteria verified
re_verification: false
---

# Phase 03: Runtime Hardening Verification Report

**Phase Goal:** Six defense layers prevent any agent action outside the provider's credentialed scope, with graceful degradation when individual layers are unavailable
**Verified:** 2026-02-19T16:15:24Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When CANS.md is active, only tools required for the provider's clinical functions are permitted; all other tools are denied | VERIFIED | checkToolPolicy in tool-policy.ts enforces allowlist; prohibited_actions trumps permitted; 6 unit tests + integration tests 1-3 pass |
| 2 | All shell execution routes through allowlist mode with only pre-approved binary paths permitted | VERIFIED | checkExecAllowlist in exec-allowlist.ts blocks non-allowlisted binaries (e.g. curl blocked, git allowed); 8 unit tests + integration tests 4-5 pass |
| 3 | CANS.md clinical hard rules appear in the agent's system prompt via the host platform's hook mechanism, and the agent references them in its reasoning | VERIFIED | injectProtocol() calls context.addFile('CAREAGENT_PROTOCOL.md', ...) via onAgentBootstrap hook; content includes provider name, scope boundaries, "NEVER act outside these scope boundaries" directive; 11 unit tests + integration test 6 pass |
| 4 | The safety guard intercepts tool invocations via the host platform's hook mechanism and validates against CANS.md scope; if the hook is not wired, a canary test detects this at startup and warns the provider | VERIFIED | engine.activate() registers onBeforeToolCall handler that calls check() and returns {block:true} on deny; setupCanary() fires 30s timeout warning with audit entry if hook never fires; 9 canary unit tests + 14 engine unit tests + integration test 9 pass |
| 5 | Every hardening layer decision (allow, deny, ask) is recorded in AUDIT.log with the specific layer that made the decision | VERIFIED | engine.check() logs every layer result (both allow and deny) with trace_id; denied entries have blocking_layer and blocked_reason fields; integration test 8 verifies 9 audit entries across 3 tool calls (4+1+4 with short-circuit) |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/hardening/types.ts` | HardeningEngine interface with check(ToolCallEvent), HardeningLayerFn type | VERIFIED | ToolCallEvent-based check(), HardeningLayerFn exported |
| `src/hardening/layers/tool-policy.ts` | Layer 1: checkToolPolicy pure function | VERIFIED | 47 lines, full implementation with prohibited-trumps-permitted logic |
| `src/hardening/layers/exec-allowlist.ts` | Layer 2: checkExecAllowlist pure function | VERIFIED | 78 lines, BASE_ALLOWLIST Set with /bin/, /usr/bin/ paths and bare names |
| `src/hardening/layers/cans-injection.ts` | Layer 3: extractProtocolRules, injectProtocol, checkCansInjection | VERIFIED | 78 lines, all 3 functions implemented, calls context.addFile |
| `src/hardening/layers/docker-sandbox.ts` | Layer 4: detectDocker, checkDockerSandbox | VERIFIED | 92 lines, 3 signals checked (/.dockerenv, /proc/1/cgroup, CONTAINER env), report-only |
| `src/hardening/engine.ts` | Real engine orchestrator: activate(), check(), injectProtocol() | VERIFIED | 110 lines, 4-layer LAYERS array, short-circuit-on-deny, per-layer audit logging |
| `src/hardening/canary.ts` | Hook liveness canary with 30s timeout | VERIFIED | 62 lines, idempotent markVerified(), timer unref'd, audit on verify and timeout |
| `src/hardening/index.ts` | Re-exports all layers, engine, canary | VERIFIED | All exports present: createHardeningEngine, all layer fns, setupCanary, detectDocker |
| `src/entry/openclaw.ts` | Engine-wired plugin (no inline canary) | VERIFIED | engine.activate() at Step 6; hookCanaryFired removed entirely |
| `src/entry/standalone.ts` | Engine activation in degraded mode | VERIFIED | createHardeningEngine().activate() when CANS active; engine? on ActivateResult |
| `src/entry/core.ts` | Complete hardening public API re-exports | VERIFIED | All 4 layer fns, createHardeningEngine, setupCanary, CanaryHandle, detectDocker exported |
| `test/unit/hardening/layers/tool-policy.test.ts` | Layer 1 unit tests (6) | VERIFIED | 6 tests passing |
| `test/unit/hardening/layers/exec-allowlist.test.ts` | Layer 2 unit tests (8) | VERIFIED | 8 tests passing |
| `test/unit/hardening/layers/cans-injection.test.ts` | Layer 3 unit tests (11) | VERIFIED | 11 tests passing |
| `test/unit/hardening/layers/docker-sandbox.test.ts` | Layer 4 unit tests (9) | VERIFIED | 9 tests passing |
| `test/unit/hardening/hardening.test.ts` | Engine orchestrator tests (14) | VERIFIED | 14 tests passing, no stub tests remain |
| `test/unit/hardening/canary.test.ts` | Canary lifecycle tests (9) | VERIFIED | 9 tests passing with fake timers |
| `test/integration/hardening.test.ts` | End-to-end integration tests (10) | VERIFIED | 10 tests passing covering HARD-01 through HARD-07 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/hardening/layers/tool-policy.ts` | `src/activation/cans-schema.ts` | `import type { CANSDocument }`, `cans.scope.permitted_actions` | WIRED | Line 15 import, line 37 usage |
| `src/hardening/layers/exec-allowlist.ts` | `src/adapters/types.ts` | `import type { ToolCallEvent }`, `event.params?.command` | WIRED | Line 19 import, line 54 usage |
| `src/hardening/layers/cans-injection.ts` | `src/adapters/types.ts` | `import type { BootstrapContext }`, `context.addFile` | WIRED | Line 11 import, line 60 usage |
| `src/hardening/layers/docker-sandbox.ts` | `node:fs` | `existsSync` for `/.dockerenv` detection | WIRED | Line 11 import, line 38 usage |
| `src/hardening/engine.ts` | `src/hardening/layers/tool-policy.ts` | `import { checkToolPolicy }`, used in LAYERS array | WIRED | Line 14 import, line 23 in LAYERS |
| `src/hardening/engine.ts` | `src/hardening/layers/exec-allowlist.ts` | `import { checkExecAllowlist }` | WIRED | Line 15 import, line 24 in LAYERS |
| `src/hardening/engine.ts` | `src/audit/pipeline.ts` | `audit.log()` and `audit.createTraceId()` | WIRED | Lines 41, 49, 62 |
| `src/hardening/engine.ts` | `src/adapters/types.ts` | `adapter.onBeforeToolCall()` and `adapter.onAgentBootstrap()` | WIRED | Lines 87, 97 |
| `src/entry/openclaw.ts` | `src/hardening/engine.ts` | `import { createHardeningEngine }`, `engine.activate()` | WIRED | Line 17 import, line 67-68 activation |
| `test/integration/hardening.test.ts` | `src/entry/openclaw.ts` | `register(api)` with mock API capturing before_tool_call handler | WIRED | Line 33 import, line 378 invocation |

---

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|---------|
| HARD-01: Tool policy lockdown | SATISFIED | checkToolPolicy enforces permitted_actions allowlist with prohibited_actions deny; integration tests 1-3 verify |
| HARD-02: Exec allowlist mode | SATISFIED | checkExecAllowlist enforces BASE_ALLOWLIST of pre-approved binary paths; integration tests 4-5 verify |
| HARD-03: CANS protocol injection via bootstrap hook | SATISFIED | injectProtocol() writes CAREAGENT_PROTOCOL.md via context.addFile; onAgentBootstrap hook registered in engine.activate(); integration test 6 verifies |
| HARD-04: Docker sandbox detection | SATISFIED | detectDocker() checks /.dockerenv, /proc/1/cgroup, CONTAINER env; report-only (never blocks); 9 unit tests verify |
| HARD-05: Safety guard via before_tool_call hook | SATISFIED | engine.activate() registers onBeforeToolCall handler that evaluates all 4 layers; returns {block:true, blockReason} on deny; integration test 7 verifies 4 audit entries per allowed call |
| HARD-06: Audit trail integration | SATISFIED | Every layer result (allow and deny) logged with layer name, trace_id; denied entries have blocking_layer and blocked_reason; integration test 8 verifies |
| HARD-07: Canary for hook liveness | SATISFIED | setupCanary() sets 30s timeout; markVerified() called on first before_tool_call; adapter.log('warn') and audit.log('error') if hook never fires; integration test 9 verifies canary audit entry |

All 7 HARD requirements: SATISFIED

---

### Anti-Patterns Found

None. Full scan of src/hardening/ and src/entry/ files found:
- No TODO/FIXME/PLACEHOLDER comments
- No `return null` or empty returns masking implementations
- No `hookCanaryFired` inline canary remnant in openclaw.ts
- No stub tests ("not yet implemented") in test/unit/hardening/hardening.test.ts

---

### Human Verification Required

None required for programmatic checks. The following items have behavioral aspects that could benefit from manual spot-check but are not blockers:

1. **Test:** CANS protocol content quality — invoke bootstrap handler and read CAREAGENT_PROTOCOL.md content to confirm it reads naturally as a clinical scope document
   - Expected: Provider name, specialty, scope boundaries, autonomy tiers, and "NEVER act outside..." directive appear in a readable format
   - Why human: Content quality and clinical clarity are subjective, though token length (<2000 chars) is verified by test

2. **Test:** Canary degradation warning message clarity — simulate missing hook by waiting 30s
   - Expected: Provider receives clear "[CareAgent] before_tool_call hook did NOT fire. Safety Guard is degraded." log message
   - Why human: Message readability for a non-engineer provider is subjective

---

## Test Suite Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| test/unit/hardening/layers/tool-policy.test.ts | 6 | PASSED |
| test/unit/hardening/layers/exec-allowlist.test.ts | 8 | PASSED |
| test/unit/hardening/layers/cans-injection.test.ts | 11 | PASSED |
| test/unit/hardening/layers/docker-sandbox.test.ts | 9 | PASSED |
| test/unit/hardening/hardening.test.ts | 14 | PASSED |
| test/unit/hardening/canary.test.ts | 9 | PASSED |
| test/integration/hardening.test.ts | 10 | PASSED |
| **Hardening subtotal** | **67** | **ALL PASSED** |
| Full suite (36 test files) | 486 | ALL PASSED |

**Build:** Clean build with all 4 entry points (index, openclaw, standalone, core) — 707ms

---

## Gaps Summary

No gaps. All 5 observable truths verified. All 7 HARD requirements satisfied. All 17 required artifacts exist, are substantive implementations (no stubs), and are wired into the system. The engine correctly:

- Composes all 4 layers in sequence with short-circuit-on-deny
- Registers both adapter hooks (before_tool_call, agent:bootstrap) on activation
- Audit-logs every layer decision with trace_id correlation
- Writes blocking_layer and blocked_reason on denied decisions
- Detects hook wiring failure via 30s canary timeout with provider warning
- Gracefully degrades (pass-through) when individual CANS flags are disabled

---

_Verified: 2026-02-19T16:15:24Z_
_Verifier: Claude (gsd-verifier)_
