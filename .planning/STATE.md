# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** A provider installs CareAgent, onboards via questionnaire, and interacts with a personalized clinical agent that knows their specialty, respects scope boundaries, and logs every action.
**Current focus:** Phase 9 — Axon Client Layer

## Current Position

Phase: 9 of 11 (Axon Client Layer)
Plan: 1 of 2 in current phase (09-01 complete)
Status: Executing
Last activity: 2026-02-23 — 09-01 Axon Client Types and HTTP Factory complete

Progress: v2.0 [█░░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- v1.0: 35 plans in 5 days (7 plans/day avg)
- v2.0: 1 plan in 1 day

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 09    | 01   | 2min     | 3     | 4     |

## Accumulated Context

### Decisions

- v2.0 roadmap: 3 phases (not 4+) — requirements cluster into 3 natural delivery boundaries; no artificial splits
- Axon consumed at runtime, not bundled — provider-core fetches taxonomy and questionnaires from Axon repo, no copy/paste of data files
- All Axon response types locally defined — no @careagent/axon import dependency, clean HTTP boundary
- Used native fetch() with AbortController — no external HTTP library needed
- Four structured error codes cover all Axon client failure modes (connection, HTTP status, invalid JSON, timeout)

### Pending Todos

None yet.

### Blockers/Concerns

- Axon uses filesystem-based loading (readFileSync) — provider-core needs an adapter that can reach Axon's data directory or import Axon as a dependency
- CANS schema v2.0 already exists at src/activation/cans-schema.ts — may need fields like scope.practice_setting and scope.supervision_level added

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 09-01-PLAN.md (Axon Client Types and HTTP Factory)
Resume file: None
