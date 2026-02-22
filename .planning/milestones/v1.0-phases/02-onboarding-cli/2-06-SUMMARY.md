---
phase: 2
plan: 06
subsystem: cli-integration
tags: [cli, onboarding, integration-tests, wiring]
dependency_graph:
  requires: [2-01, 2-02, 2-03, 2-04, 2-05]
  provides: [ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05]
  affects: [careagent-init, careagent-status, all-ONBD-requirements]
tech_stack:
  added: []
  patterns: [orchestrator-function, mock-io-testing, tmp-workspace-integration]
key_files:
  created:
    - src/cli/init-command.ts
    - test/integration/onboarding.test.ts
    - test/integration/status.test.ts
  modified:
    - src/cli/commands.ts
decisions:
  - io.close() in finally block ensures process does not hang after interview completion
  - supplementWorkspaceFiles called after reviewLoop to guarantee CANS.md exists first
  - Toggle hardening test checks false (not true) because defaultHardening.docker_sandbox starts true
  - Integration tests use fresh AuditPipeline per test via mkdtempSync workspaces
metrics:
  duration: 249s
  completed: 2026-02-18
  tasks: 4
  files: 4
---

# Phase 2 Plan 06: CLI Wiring and Integration Tests Summary

Wire the init command to the full onboarding flow, wire the status command, and create comprehensive integration tests verifying all five ONBD requirements. This is the final plan for Phase 2.

## One-liner

Full CLI wiring of `careagent init` and `careagent status` with 39 new integration tests covering all ONBD requirements.

## Tasks Completed

### Task 1: src/cli/init-command.ts (feat, bd28358)
Created the init command orchestrator function `runInitCommand(io, workspacePath, audit)`:
1. `runInterview(io)` — collects all 26 interview responses
2. `reviewLoop(io, result, workspacePath, audit)` — generate/preview/edit/approve cycle; writes CANS.md and seeds integrity hash
3. `supplementWorkspaceFiles(workspacePath, result.data, result.philosophy)` — writes SOUL.md, AGENTS.md, USER.md
4. Success summary display
5. `io.close()` in `finally` block to prevent readline from keeping the process alive

### Task 2: src/cli/commands.ts (feat, bd28358)
Updated stub handlers with real implementations:
- `careagent init` handler: creates `createTerminalIO()` and calls `runInitCommand`
- `careagent status` handler: calls `runStatusCommand(workspacePath)`
- Removed underscore prefix from `workspacePath` and `audit` parameters (now used)
- Added imports for `createTerminalIO`, `runInitCommand`, `runStatusCommand`

### Task 3: test/integration/onboarding.test.ts (feat, b6263ea)
39 integration tests across 5 test groups:
- **ONBD-01** (5 tests): Complete interview with `completeInterviewResponses` and `minimalInterviewResponses`; verifies name, license, specialty, scope, autonomy, HIPAA consent collected
- **ONBD-02** (7 tests): CANS.md existence, YAML frontmatter, schema validation via TypeBox, ActivationGate activation, provider name, "# Care Agent Nervous System" heading, philosophy text
- **ONBD-03** (10 tests): SOUL.md / AGENTS.md / USER.md existence and markers; specialty + philosophy in SOUL.md; clinical safety rules in AGENTS.md; name + license in USER.md; pre-existing content preserved; idempotent (no duplicate markers on second init)
- **ONBD-05** (2 tests): Edit provider name during review (response `'1'` in menu, then new name, then `'0'` approve); toggle hardening flag (response `'8'`, then flag index, then `'6'` Done, then `'0'` approve)
- **Post-init verification** (3 tests): `.careagent/cans-integrity.json` exists; `AUDIT.log` contains `cans_generated` entry; audit chain is valid

### Task 4: test/integration/status.test.ts (feat, b6263ea)
11 integration tests for ONBD-04:
- Empty workspace: INACTIVE, N/A, "CANS.md not found" reason
- After init: ACTIVE, provider name, specialty, autonomy tiers (autonomous/supervised/manual), Hardening Layers section, Audit Stats section, "Verified" integrity
- Malformed CANS.md: INACTIVE
- Header: "CareAgent Status"

## Decisions Made

1. **io.close() in finally block** — ensures the `readline` interface is always closed whether the command succeeds, errors, or is interrupted. Without this, the Node.js event loop stays alive indefinitely.

2. **supplementWorkspaceFiles after reviewLoop** — the review loop may loop multiple times before approval. Workspace file supplementation must use the final approved data, which is only available after the review loop exits.

3. **Toggle hardening test assertion direction** — `defaultHardening.docker_sandbox` is `true`. Toggling it during the review loop produces `false`. The test correctly asserts `docker_sandbox: false` rather than `docker_sandbox: true`.

4. **Fresh AuditPipeline per test** — each integration test creates a fresh `AuditPipeline(tmpDir)` with its own `.careagent/AUDIT.log`. This prevents cross-test contamination while testing real audit chain behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected hardening toggle test assertion**
- **Found during:** Task 3 execution (first test run)
- **Issue:** Test expected `docker_sandbox: true` but `defaultHardening.docker_sandbox` starts as `true` — toggling it produces `false`
- **Fix:** Changed assertion to `expect(content).toContain('docker_sandbox: false')`
- **Files modified:** test/integration/onboarding.test.ts
- **Commit:** b6263ea (included in integration test commit)

## Test Results

- **Before plan:** 315 tests passing
- **After plan:** 354 tests passing (+39 new integration tests)
- **Coverage:** 91.15% statements, 84.81% branches, 85.84% functions, 91.51% lines (all above 80% threshold)

## Self-Check: PASSED

Files created:
- /Users/medomatic/Documents/Projects/core/src/cli/init-command.ts: FOUND
- /Users/medomatic/Documents/Projects/core/test/integration/onboarding.test.ts: FOUND
- /Users/medomatic/Documents/Projects/core/test/integration/status.test.ts: FOUND

Commits:
- bd28358: feat(2-06): wire init and status CLI handlers — FOUND
- b6263ea: feat(2-06): add end-to-end integration tests for ONBD requirements — FOUND
