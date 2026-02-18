---
phase: 2
plan: "05"
subsystem: cli
tags: [status-command, activation-gate, audit-stats, cans-integrity, chain-verification]
dependency_graph:
  requires: [1-03, 1-04]
  provides: [careagent-status-command]
  affects: [src/cli/status-command.ts]
tech_stack:
  added: []
  patterns: [no-side-effect-integrity-check, hash-comparison-without-store-creation, audit-chain-verification]
key_files:
  created:
    - src/cli/status-command.ts
    - test/unit/cli/status-command.test.ts
  modified: []
decisions:
  - Integrity check in status bypasses gate side effect by reading store directly and comparing hashes manually
  - formatStatus calls ActivationGate with no-op audit callback — status is read-only, not audited
  - checkIntegrity function three-state logic covers No CANS.md / No hash stored / Verified or MISMATCH
metrics:
  duration: 192s
  completed: 2026-02-18
  tasks: 2
  files: 2
---

# Phase 2 Plan 05: careagent status Command Summary

**One-liner:** Read-only status reporter combining ActivationGate result, hardening flags, autonomy tiers, audit chain stats, and CANS.md hash verification without triggering gate side effects.

## What Was Built

### `src/cli/status-command.ts`

Exports three public functions and one interface:

**`AuditStats` interface** — `{ totalEntries, chainValid, chainError?, lastTimestamp }` — structured representation of audit log health.

**`readAuditStats(workspacePath)`** — reads `.careagent/AUDIT.log`, counts non-empty lines as entries, parses the last line's `timestamp` field, and calls `AuditWriter.verifyChain()` to confirm hash chain integrity. Returns zeroed stats when log is absent or empty. Catches all file I/O errors and returns `chainValid: false` with the error message.

**`formatStatus(workspacePath)`** — the core rendering function:
1. Creates `ActivationGate` with no-op audit callback and calls `check()`
2. Calls `readAuditStats`
3. Calls internal `checkIntegrity` — reads CANS.md, computes SHA-256, compares to stored hash without calling `verifyIntegrity` (which has a first-load store-creation side effect)
4. Renders a multi-section ASCII status report: header, Clinical Mode (ACTIVE/INACTIVE with reason), provider identity (name/license/specialty/subspecialty/institution), Autonomy Tiers (chart/order/charge/perform), Hardening Layers (six flags as on/off), Audit Stats (total entries, chain valid, last entry timestamp), Integrity (CANS.md hash status)

**`runStatusCommand(workspacePath)`** — calls `formatStatus` and prints with `console.log`. Entry point for the CLI handler.

**`checkIntegrity` (internal)** — three-state logic:
- CANS.md missing → "No CANS.md"
- Store missing → "No hash stored"
- Both present → compare hashes: "Verified" or "MISMATCH"

### `test/unit/cli/status-command.test.ts`

22 tests covering:
- `readAuditStats`: absent log, empty log, 3-entry chain, chain validity
- `formatStatus`: header presence, INACTIVE mode, N/A last entry, "No CANS.md" when empty workspace, "No hash stored" when CANS.md exists but store absent (malformed CANS bypasses gate integrity step), edge-case store-without-CANS, malformed CANS reason, ACTIVE mode with provider/license/subspecialty/institution, all four autonomy tier labels and values, all six hardening flag labels and values, Verified hash, entry count, chain valid Yes, last timestamp non-N/A

## Key Design Decisions

**Integrity without side effects.** `verifyIntegrity` from `cans-integrity.ts` creates the integrity store on first call (first-load trust model). Calling it from the status command would silently seed the store, making a read-only status operation have write side effects. Instead, `checkIntegrity` reads CANS.md, calls `computeHash`, reads the store JSON directly, and compares hashes. This is safe, read-only, and produces accurate results.

**No-op audit callback.** `formatStatus` passes `() => {}` as the audit callback to `ActivationGate`. The status command is for human inspection, not audited system events. Logging activation checks to the audit trail every time someone runs `careagent status` would pollute the audit log with noise.

**Malformed CANS → "No hash stored" path.** When CANS.md is present but fails parse or validation, `ActivationGate.check()` returns early without reaching the integrity step — so the store is never created. `checkIntegrity` then correctly reports "No hash stored" because the file exists but the store does not.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/cli/status-command.ts` exists
- [x] `test/unit/cli/status-command.test.ts` exists
- [x] Commit 773b8f6 exists: `feat(phase-2-05): implement careagent status command`
- [x] All 315 tests pass (293 pre-existing + 22 new)
- [x] Build passes
