---
phase: 1
plan: 05
subsystem: plugin-wiring, audit-integrity
tags: [register, activation, audit, integrity-service, canary-hook]
dependency-graph:
  requires: [adapter, activation-gate, audit-pipeline]
  provides: [plugin-entry-point, audit-integrity-service, hook-canary]
  affects: [src/index.ts, src/audit/integrity-service.ts]
tech-stack:
  added: []
  patterns: [dependency-injection, background-service, canary-pattern, early-return-on-inactive]
key-files:
  created:
    - src/audit/integrity-service.ts
    - test/unit/audit/integrity-service.test.ts
  modified:
    - src/index.ts
    - test/smoke.test.ts
decisions:
  - AuditCallback injection wires gate errors to pipeline without circular imports
  - CLI registered before activation check so commands work without CANS.md
  - Integrity service checks chain on startup then every 60s via setInterval
  - Hook canary uses closure + setTimeout(30s) to detect missing before_tool_call wiring
metrics:
  duration: 172s
  completed: 2026-02-18
---

# Phase 1 Plan 05: Plugin Registration Wiring and Audit Integrity Service Summary

Wire register(api) to connect adapter, activation gate, and audit pipeline; add background integrity service for audit chain monitoring.

## What Was Built

### register() Entry Point (src/index.ts)

The plugin entry point now performs an 8-step initialization sequence:

1. **Create adapter** from raw OpenClaw API object
2. **Start audit pipeline** (always active, even without CANS.md)
3. **Register CLI command** `careagent` (placeholder for Phase 2)
4. **Check activation gate** (presence -> parse -> validate -> integrity)
5. **Log activation result** (active with provider details, or inactive with reason)
6. **Register before_tool_call canary** (verifies hook wiring via closure)
7. **Register audit integrity service** (background periodic chain verification)
8. **Schedule canary status check** (30s delayed warning if hook never fires)

When CANS.md is absent or invalid, the function returns early after step 4 with an audit log entry recording the reason. When active, all subsystems are wired and the provider's name and specialty are logged.

### Audit Integrity Background Service (src/audit/integrity-service.ts)

`createAuditIntegrityService(audit, adapter)` returns a `ServiceConfig` with:

- **id:** `careagent-audit-integrity`
- **start():** Runs immediate integrity check, then schedules periodic checks every 60 seconds
- **stop():** Clears the interval timer

On startup and every interval tick, the service calls `audit.verifyChain()`. If the hash chain is broken, it logs an error through both the adapter logger and the audit pipeline itself, creating an audit trail of integrity violations.

## Key Implementation Details

- **Dependency injection:** ActivationGate receives an `AuditCallback` that wraps `audit.log()`, avoiding circular imports between activation and audit subsystems
- **Early return pattern:** Inactive mode exits after logging, so active-only subsystems (canary, integrity service) never initialize unnecessarily
- **Canary pattern:** A closure-scoped boolean tracks whether `before_tool_call` ever fires; after 30 seconds, if it hasn't, the adapter logs a warning about degraded safety guard
- **CLI before activation:** The `careagent` CLI command is registered before the activation check, so it's available even when CANS.md doesn't exist (needed for `careagent init` in Phase 2)

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| test/unit/audit/integrity-service.test.ts | 7 | PASS |
| test/smoke.test.ts | 2 | PASS |
| All existing tests | 85 | PASS |
| **Total** | **94** | **PASS** |

New integrity service tests cover: ServiceConfig shape, startup check, broken chain detection on startup, periodic check with fake timers, stop() clears interval, valid chain produces no errors.

Updated smoke test uses temp directory and verifies register() accepts a mock API without throwing.

## Commits

| Hash | Message |
|------|---------|
| 90cd6f6 | feat: wire plugin register() and add audit integrity service |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed integrity service periodic check test**
- **Found during:** Task 2 (integrity service tests)
- **Issue:** Original test tampered with a single-entry audit log (genesis entry with `prev_hash: null`). Changing the content of a single entry doesn't break the hash chain because there's no subsequent entry whose `prev_hash` would mismatch.
- **Fix:** Write two entries before tampering, then modify the first entry so the second entry's `prev_hash` no longer matches the hash of the tampered first entry.
- **Files modified:** test/unit/audit/integrity-service.test.ts
- **Commit:** 90cd6f6

## Requirements Covered

- **PLUG-03:** Plugin `register(api)` entry point registers CLI commands, hooks, agent tools, and background services
- **AUDT-06:** Audit background service monitors log integrity and reports anomalies

## Self-Check: PASSED

All files exist, all commits verified.
