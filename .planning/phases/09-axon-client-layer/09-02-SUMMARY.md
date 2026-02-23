---
phase: 09-axon-client-layer
plan: 02
subsystem: testing
tags: [vitest, unit-test, integration-test, axon, mock-server, fetch-mock, http-client]

# Dependency graph
requires:
  - phase: 09-axon-client-layer
    provides: "AxonClient interface, createAxonClient factory, AxonClientError class (09-01)"
provides:
  - "Unit tests verifying all AxonClient methods and all four error codes with mocked fetch"
  - "Integration tests proving AXON-01 (49 provider types), AXON-02 (physician questionnaire with 13 questions), AXON-04 (graceful CONNECTION_FAILED)"
  - "97% statement coverage for src/axon/ module"
affects: [10-questionnaire-engine, 11-onboarding-flow-v2]

# Tech tracking
tech-stack:
  added: ["@careagent/axon (devDependency, linked local repo)"]
  patterns: [proxy-wrapper-test-server, abort-signal-timeout-testing, mock-fetch-stubbing]

key-files:
  created:
    - test/unit/axon/client.test.ts
    - test/integration/axon.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Used real timers (10ms timeout) instead of fake timers for TIMEOUT test -- avoids AbortController/fake-timer interaction causing unhandled promise rejections"
  - "Created proxy wrapper server adding missing /v1/taxonomy/provider-types and /health endpoints to Axon mock server -- mock server only serves questionnaires and taxonomy actions"
  - "CONNECTION_FAILED test uses dead port (19876) instead of stopping/restarting mock server mid-test -- simpler and avoids flaky teardown issues"

patterns-established:
  - "Proxy test server pattern: wrap @careagent/axon/mock with node:http proxy that adds missing endpoints, forward rest to underlying mock"
  - "Mock fetch pattern: vi.stubGlobal('fetch', mockFn) with createMockResponse helper for unit testing HTTP clients"
  - "Real-timer timeout testing: mock fetch delays longer than client timeoutMs, let AbortController fire naturally"

requirements-completed: [AXON-01, AXON-02, AXON-04]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 9 Plan 02: Axon Client Tests Summary

**24 tests (15 unit + 9 integration) proving Axon client fetches 49 provider types, physician questionnaire with 13 questions, and returns structured AxonClientError on all failure modes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T10:39:49Z
- **Completed:** 2026-02-23T10:43:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 15 unit tests with mocked fetch covering getProviderTypes, getQuestionnaire, checkHealth, and all four error codes (CONNECTION_FAILED, TIMEOUT, HTTP_ERROR, INVALID_RESPONSE)
- 9 integration tests against live Axon mock server proving AXON-01 (49 provider types), AXON-02 (physician questionnaire with 13 questions), AXON-04 (graceful error on unreachable server)
- 97% statement coverage, 100% function coverage for src/axon/ module
- @careagent/axon added as devDependency for mock server and taxonomy access
- Full test suite: 738 tests passing, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add @careagent/axon devDependency and create unit tests** - `68a724f` (test)
2. **Task 2: Create integration tests with Axon mock server** - `f69db13` (test)

**Plan metadata:** `1f95f29` (docs: complete plan)

## Files Created/Modified
- `test/unit/axon/client.test.ts` - 15 unit tests for createAxonClient with mocked fetch, covering happy paths and all four error codes
- `test/integration/axon.test.ts` - 9 integration tests using proxy-wrapped @careagent/axon/mock server, proving all three Phase 9 requirements
- `package.json` - Added @careagent/axon devDependency (linked to local repo)
- `pnpm-lock.yaml` - Updated lockfile for @careagent/axon link

## Decisions Made
- Used real timers with short timeout (10ms) for TIMEOUT test instead of fake timers -- vi.useFakeTimers() interacts poorly with AbortController's native setTimeout, causing unhandled promise rejections
- Created lightweight node:http proxy wrapper that adds /v1/taxonomy/provider-types (from AxonTaxonomy.getProviderTypes()) and /health endpoints to the Axon mock server, since the mock only serves questionnaires and taxonomy actions
- Used a dead port (localhost:19876) for CONNECTION_FAILED integration tests instead of stopping and restarting the mock server mid-test -- simpler and more reliable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unhandled promise rejection in TIMEOUT unit test**
- **Found during:** Task 1 (unit tests)
- **Issue:** Using vi.useFakeTimers() with AbortController caused the mock fetch rejection to fire as an unhandled promise rejection before the client's try/catch could handle it
- **Fix:** Switched to real timers with a 10ms timeout and mock fetch that delays 200ms, letting the AbortController fire naturally without fake timer interaction
- **Files modified:** test/unit/axon/client.test.ts
- **Verification:** All 15 tests pass with zero unhandled errors
- **Committed in:** 68a724f (Task 1 commit)

**2. [Rule 3 - Blocking] Added proxy wrapper server for missing mock server endpoints**
- **Found during:** Task 2 (integration tests)
- **Issue:** Axon mock server does not serve GET /v1/taxonomy/provider-types or GET /health -- these endpoints only exist in the production Axon server
- **Fix:** Created lightweight node:http proxy that adds provider-types (from AxonTaxonomy) and health endpoints, forwarding all other requests to the underlying mock server
- **Files modified:** test/integration/axon.test.ts
- **Verification:** All 9 integration tests pass, provider-types returns 49 entries, health returns ok
- **Committed in:** f69db13 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking issue)
**Impact on plan:** Both deviations were necessary for correct test behavior. No scope creep -- plan anticipated the mock server gap and outlined the proxy approach.

## Issues Encountered
- Axon mock server lacks /v1/taxonomy/provider-types and /health endpoints -- resolved by creating a proxy wrapper as the plan suggested
- AbortController and vi.useFakeTimers() incompatibility in vitest -- resolved by using real timers with short delays

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three Phase 9 requirements (AXON-01, AXON-02, AXON-04) proven by tests
- Axon client module fully tested and ready for Phase 10 (questionnaire engine)
- Phase 10 can consume createAxonClient to fetch taxonomy and questionnaires for onboarding
- Phase 11 (onboarding flow v2) can build on the tested AxonClient foundation

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log. Line counts exceed minimums (unit: 319 >= 120, integration: 254 >= 80).

---
*Phase: 09-axon-client-layer*
*Completed: 2026-02-23*
