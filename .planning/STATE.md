# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** A provider installs CareAgent, onboards via questionnaire, and interacts with a personalized clinical agent that knows their specialty, respects scope boundaries, and logs every action.
**Current focus:** Phase 9 — Axon Client Layer

## Current Position

Phase: 9 of 11 (Axon Client Layer)
Plan: 0 of 0 in current phase (not yet planned)
Status: Ready to plan
Last activity: 2026-02-23 — v2.0 roadmap created (3 phases, 16 requirements)

Progress: v2.0 [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- v1.0: 35 plans in 5 days (7 plans/day avg)
- v2.0: Not started

## Accumulated Context

### Decisions

- v2.0 roadmap: 3 phases (not 4+) — requirements cluster into 3 natural delivery boundaries; no artificial splits
- Axon consumed at runtime, not bundled — provider-core fetches taxonomy and questionnaires from Axon repo, no copy/paste of data files

### Pending Todos

None yet.

### Blockers/Concerns

- Axon uses filesystem-based loading (readFileSync) — provider-core needs an adapter that can reach Axon's data directory or import Axon as a dependency
- CANS schema v2.0 already exists at src/activation/cans-schema.ts — may need fields like scope.practice_setting and scope.supervision_level added

## Session Continuity

Last session: 2026-02-23
Stopped at: v2.0 roadmap created, ready to plan Phase 9
Resume file: None
