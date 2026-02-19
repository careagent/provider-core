---
phase: 05-cans-continuous-improvement-and-integration
plan: 01
subsystem: refinement
tags: [observation-store, pattern-matcher, proposal-generator, jsonl, scope-protection]

# Dependency graph
requires:
  - phase: 01-skeleton
    provides: "Audit pipeline, CANS schema, CANS parser, activation gate"
  - phase: 02-onboarding
    provides: "CANS.md generation, integrity hashing"
provides:
  - "Observation, Proposal, DivergencePattern types for refinement engine"
  - "Append-only JSONL observation storage (ObservationStore)"
  - "Proposal lifecycle management with JSON persistence (ProposalQueue)"
  - "Divergence detection with 5+ threshold (detectDivergences)"
  - "Proposal generation with evidence summaries and diff views (generateProposals)"
  - "Two-layer scope field protection (SACROSANCT_FIELDS + isScopeField)"
affects: [05-02, 05-03, entry-points, cli-commands]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Append-only JSONL observation storage", "Two-layer scope field defense-in-depth", "Threshold-based divergence detection with resurfacing logic"]

key-files:
  created:
    - src/refinement/types.ts
    - src/refinement/observation-store.ts
    - src/refinement/proposal-queue.ts
    - src/refinement/pattern-matcher.ts
    - src/refinement/proposal-generator.ts
    - test/unit/refinement/observation-store.test.ts
    - test/unit/refinement/pattern-matcher.test.ts
    - test/unit/refinement/proposal-generator.test.ts
  modified: []

key-decisions:
  - "Append-only JSONL for observations mirrors audit log pattern; JSON for proposals enables random access updates"
  - "Two-layer scope protection: pattern-matcher excludes scope fields, proposal-generator throws on any leak"
  - "Rejected proposal resurfacing requires both count >= RESURFACE_THRESHOLD (10) and count exceeding prior observation count"
  - "JSON.stringify deep comparison for declared/observed values handles objects and arrays"

patterns-established:
  - "JSONL observation storage with category/field_path filtering"
  - "DivergencePattern detection with configurable threshold and existing-proposal awareness"
  - "Defense-in-depth scope field protection across multiple layers"

requirements-completed: [CANS-08]

# Metrics
duration: 3min 38s
completed: 2026-02-19
---

# Phase 5 Plan 01: Refinement Engine Foundations Summary

**JSONL observation store, threshold-based pattern matcher with two-layer scope protection, and proposal generator with evidence summaries and diff views**

## Performance

- **Duration:** 3 min 38 s
- **Started:** 2026-02-19T23:11:27Z
- **Completed:** 2026-02-19T23:15:05Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Five refinement engine modules created: types, observation-store, proposal-queue, pattern-matcher, proposal-generator
- ObservationStore records usage divergences as append-only JSONL in `.careagent/observations.jsonl`
- Pattern matcher detects statistically significant divergences (5+ threshold) while hard-excluding scope fields
- Proposal generator creates human-readable proposals with evidence summaries and field-level diff views
- ProposalQueue manages full lifecycle (pending/accepted/rejected/deferred) with JSON persistence
- Rejected proposal resurfacing at higher threshold (10+) with evidence accumulation requirement
- 32 unit tests across 3 test files, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create refinement types, observation store, and proposal queue** - `74ad1bc` (feat)
2. **Task 2: Create pattern matcher and proposal generator with scope field protection** - `39ca99b` (feat)

## Files Created/Modified
- `src/refinement/types.ts` - ObservationCategory, Observation, DivergencePattern, Proposal types; SACROSANCT_FIELDS and isScopeField; constants
- `src/refinement/observation-store.ts` - Append-only JSONL observation storage with query filtering
- `src/refinement/proposal-queue.ts` - Proposal lifecycle management with JSON persistence
- `src/refinement/pattern-matcher.ts` - Divergence detection with scope exclusion, threshold, and resurfacing logic
- `src/refinement/proposal-generator.ts` - Proposal creation with scope assertion (defense layer 2) and diff view generation
- `test/unit/refinement/observation-store.test.ts` - 8 tests for JSONL append, query filtering, directory creation, clear
- `test/unit/refinement/pattern-matcher.test.ts` - 15 tests for threshold, scope exclusion, resurfacing, sorting, evidence summary
- `test/unit/refinement/proposal-generator.test.ts` - 9 tests for proposal creation, UUID/status, scope assertion, diff views

## Decisions Made
- Append-only JSONL for observations mirrors the audit log pattern; JSON (not JSONL) for proposals since they require random access and in-place status updates
- Two-layer scope protection: pattern-matcher excludes via `isScopeField()` check (defense layer 1), proposal-generator throws error on any scope field leak (defense layer 2)
- Rejected proposal resurfacing requires both count >= RESURFACE_THRESHOLD (10) AND count must exceed the observation count from the previous rejection
- JSON.stringify used for deep comparison of declared/observed values to handle objects, arrays, and primitives uniformly

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All five refinement engine foundation modules ready for the refinement engine orchestrator (Plan 02)
- Types, observation store, and proposal queue provide the data layer
- Pattern matcher and proposal generator provide the analysis logic
- 32 unit tests provide regression safety for subsequent integration

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (74ad1bc, 39ca99b) verified in git log.

---
*Phase: 05-cans-continuous-improvement-and-integration*
*Completed: 2026-02-19*
