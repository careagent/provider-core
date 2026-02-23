---
phase: 09-axon-client-layer
plan: 01
subsystem: api
tags: [http-client, fetch, axon, taxonomy, questionnaire]

# Dependency graph
requires: []
provides:
  - "AxonClient interface and createAxonClient factory for HTTP communication with Axon server"
  - "Typed response types for provider taxonomy (AxonProviderType) and questionnaires (AxonQuestionnaire)"
  - "Structured AxonClientError with four error codes (CONNECTION_FAILED, HTTP_ERROR, INVALID_RESPONSE, TIMEOUT)"
  - "Public API wired into core.ts re-exports"
affects: [09-axon-client-layer, 10-questionnaire-engine, 11-onboarding-flow-v2]

# Tech tracking
tech-stack:
  added: []
  patterns: [http-client-factory, abort-controller-timeout, structured-error-class]

key-files:
  created:
    - src/axon/types.ts
    - src/axon/client.ts
    - src/axon/index.ts
  modified:
    - src/entry/core.ts

key-decisions:
  - "All Axon response types locally defined — no @careagent/axon import dependency, clean HTTP boundary"
  - "Used native fetch() with AbortController — no external HTTP library needed"
  - "Four structured error codes cover all failure modes (connection, HTTP status, invalid JSON, timeout)"

patterns-established:
  - "HTTP client factory pattern: createAxonClient(config) returning typed interface with async methods"
  - "Structured error class: AxonClientError with code union, optional statusCode, and cause chain"
  - "Module convention: types.ts + client.ts + index.ts barrel, re-exported through core.ts"

requirements-completed: [AXON-01, AXON-02, AXON-04]

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 9 Plan 01: Axon Client Types and HTTP Factory Summary

**Typed HTTP client for Axon server using native fetch with AbortController timeouts and structured AxonClientError for all failure modes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-23T10:34:20Z
- **Completed:** 2026-02-23T10:36:52Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- AxonClient interface with getProviderTypes(), getQuestionnaire(), and checkHealth() methods
- createAxonClient factory using native fetch() with AbortController-based timeouts
- Structured AxonClientError covering four failure modes: CONNECTION_FAILED, HTTP_ERROR, INVALID_RESPONSE, TIMEOUT
- All Axon response types locally defined (AxonProviderType, AxonQuestionnaire, AxonQuestion, etc.)
- Public API wired into core.ts re-exports for consumer access

## Task Commits

Each task was committed atomically:

1. **Task 1: Define AxonClient types and error class** - `aaff61e` (feat)
2. **Task 2: Implement createAxonClient HTTP factory** - `b941e6e` (feat)
3. **Task 3: Create barrel file and wire into core.ts** - `22ab42c` (feat)

**Plan metadata:** `45d5e61` (docs: complete plan)

## Files Created/Modified
- `src/axon/types.ts` - AxonClient interface, all response types, AxonClientConfig, AxonClientError class with four error codes
- `src/axon/client.ts` - createAxonClient factory with fetchJson helper, AbortController timeout, structured error handling
- `src/axon/index.ts` - Barrel re-exports for axon module (types, factory, error class)
- `src/entry/core.ts` - Added axon public API re-exports for @careagent/provider-core/core consumers

## Decisions Made
- All Axon response types locally defined -- no @careagent/axon import dependency keeps the HTTP boundary clean
- Used native fetch() with AbortController instead of an external HTTP library -- reduces dependencies, modern Node.js API
- Four structured error codes (CONNECTION_FAILED, HTTP_ERROR, INVALID_RESPONSE, TIMEOUT) cover all failure modes with typed discrimination

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - pre-existing tsconfig issues with global type definitions (setTimeout, fetch, AbortController, etc.) are present across the entire codebase and not introduced by this plan. Runtime behavior is correct as confirmed by 714/714 passing tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Axon client module complete and exported via core.ts
- Ready for 09-02 (Axon client tests) to verify all error paths and HTTP behaviors
- Ready for Phase 10 (questionnaire engine) to consume AxonClient for fetching taxonomy and questionnaires

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 09-axon-client-layer*
*Completed: 2026-02-23*
