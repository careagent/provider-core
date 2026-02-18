---
phase: 2
plan: "02"
subsystem: onboarding
tags: [interview-engine, stage-handlers, state-machine, cli, onboarding]
dependency_graph:
  requires: [2-01]
  provides: [2-03]
  affects: [src/onboarding/]
tech_stack:
  added: []
  patterns: [stage-handler-pattern, state-machine, recursive-reprompt, spread-conditional]
key_files:
  created:
    - src/onboarding/defaults.ts
    - src/onboarding/engine.ts
    - src/onboarding/stages.ts
    - test/unit/onboarding/engine.test.ts
    - test/unit/onboarding/stages.test.ts
  modified: []
decisions:
  - "Stage dispatch via STAGE_HANDLERS record (not switch) — O(1) lookup, easily extensible"
  - "Mandatory re-prompt loops for welcome and consent acknowledgment — non-negotiable safety"
  - "Spread-conditional for optional CANS fields — prevents undefined in JSON output"
  - "InterviewState uses Partial<CANSDocument> until consentStage completes data"
  - "runInterview casts final data as CANSDocument — safe because all stages complete all fields"
metrics:
  duration: 203s
  completed: "2026-02-18"
  tasks: 5
  files: 5
---

# Phase 2 Plan 02: Interview Engine and Stage Handlers Summary

**One-liner:** Nine-stage onboarding interview engine with state machine orchestrator, mandatory HIPAA acknowledgment loops, and typed-literal output for all CANS fields.

## What Was Built

Three source files and two test files implementing the complete interview engine:

### `src/onboarding/defaults.ts`
Default values for CANS document fields. `defaultHardening` has all six flags `true` (non-negotiable). `defaultConsent` initializes all three flags to `false` and is overwritten by `consentStage`. `defaultAutonomy` provides safe starting tiers for the four atomic actions.

### `src/onboarding/engine.ts`
State machine orchestrator with:
- `InterviewStage` enum (WELCOME, IDENTITY, CREDENTIALS, SPECIALTY, SCOPE, PHILOSOPHY, VOICE, AUTONOMY, CONSENT, COMPLETE)
- `InterviewState` — carries `stage`, `data: Partial<CANSDocument>`, and `philosophy: string`
- `InterviewResult` — final output: `data: CANSDocument` and `philosophy`
- `runInterview(io)` — orchestrates 9 stages sequentially
- `runSingleStage(stage, state, io)` — dispatches to handler via `STAGE_HANDLERS` record

### `src/onboarding/stages.ts`
Nine stage handlers covering the full interview flow:
- `welcomeStage` — HIPAA warning banner with mandatory `askConfirm` loop
- `identityStage` — provider name + optional NPI with 10-digit regex validation + re-prompt
- `credentialsStage` — license type (typed literal via `askLicenseType`), state (uppercase), number, `verified: false`
- `specialtyStage` — specialty, optional subspecialty/institution, comma-split privileges, credential status
- `scopeStage` — permitted/prohibited/limitations with comma-split and optional-field omission
- `philosophyStage` — stores text in `state.philosophy` (not in `data`)
- `voiceStage` — tone (optional), documentation style (typed literal), eponyms (boolean), abbreviations (typed literal)
- `autonomyStage` — four tiers via `askAutonomyTier`
- `consentStage` — three mandatory confirmation loops, sets `hardening: defaultHardening`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Stage dispatch via `STAGE_HANDLERS` record | O(1) lookup; adding stages requires only a new handler + record entry |
| Mandatory re-prompt loops for welcome/consent | Non-negotiable acknowledgments — cannot skip |
| Spread-conditional `{...(x !== undefined ? {key: x} : {})}` | Prevents `undefined` properties in JSON; clean for optional CANS fields |
| `state.philosophy` separate from `state.data` | Philosophy is prose, not CANS YAML; stored separately for CANS.md generation in Plan 03 |
| Final `as CANSDocument` cast in `runInterview` | Safe because all 9 stages guarantee all required fields are set |

## Tests

40 new tests across two files:
- `test/unit/onboarding/engine.test.ts` — 10 tests: full interview result, all CANS fields present, correct values, `runSingleStage` dispatch
- `test/unit/onboarding/stages.test.ts` — 30 tests: each stage tested individually with correct mock responses, re-prompt loops verified, optional field omission confirmed

**Total: 211 tests passing (171 pre-existing + 40 new)**

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

File existence:
- [x] src/onboarding/defaults.ts — FOUND
- [x] src/onboarding/engine.ts — FOUND
- [x] src/onboarding/stages.ts — FOUND
- [x] test/unit/onboarding/engine.test.ts — FOUND
- [x] test/unit/onboarding/stages.test.ts — FOUND

Commits:
- [x] d965152 — feat(2-02): defaults.ts
- [x] 07a125d — feat(2-02): engine.ts
- [x] c543132 — feat(2-02): stages.ts
- [x] a39a0b0 — test(2-02): tests

## Self-Check: PASSED
