---
phase: 2
plan: "03"
subsystem: onboarding
tags: [cans-generator, review-loop, yaml, typescript, vitest]
dependency_graph:
  requires:
    - 2-02  # Interview engine (InterviewResult, InterviewState, runSingleStage, runInterview)
    - 1-03  # CANS schema and integrity (CANSSchema, CANSDocument, updateKnownGoodHash)
    - 1-04  # Audit pipeline (AuditPipeline.log)
    - 2-01  # CLI I/O (InterviewIO, createMockIO)
  provides:
    - generateCANSContent   # Validates + serializes CANSDocument into full CANS.md file content
    - generatePreview       # Human-readable summary for review display
    - reviewLoop            # Iterative preview-edit-approve cycle
  affects:
    - src/onboarding/cans-generator.ts
    - src/onboarding/review.ts
tech_stack:
  added: []
  patterns:
    - TypeBox Value.Check + Value.Errors for pre-serialization validation
    - YAML frontmatter + markdown body assembly pattern
    - Iterative review loop with stage-dispatch editing
    - Inner toggle loop for boolean flag management
key_files:
  created:
    - src/onboarding/cans-generator.ts
    - src/onboarding/review.ts
    - test/unit/onboarding/cans-generator.test.ts
    - test/unit/onboarding/review.test.ts
  modified: []
decisions:
  - Validate before YAML stringify so errors are TypeBox-typed not YAML parse errors
  - Philosophy stored in markdown body only, not YAML frontmatter (separate from data)
  - updateKnownGoodHash called immediately after writeFileSync to atomically seed integrity
  - MENU_TO_STAGE record for O(1) dispatch of edit choices to InterviewStage
  - Inner toggleHardeningLoop as separate async function for clarity and testability
  - onUpdate callback pattern in toggleHardeningLoop to avoid mutation through closure
metrics:
  duration: 219s
  completed: "2026-02-18"
  tasks_completed: 4
  files_created: 4
  tests_added: 35
---

# Phase 2 Plan 03: CANS.md Generator and Review Loop Summary

**One-liner:** TypeBox-validated CANS.md generator with iterative preview-edit-approve review loop writing frontmatter + markdown body.

## Tasks Completed

| Task | File | Description |
|------|------|-------------|
| 1 | src/onboarding/cans-generator.ts | generateCANSContent and generatePreview functions |
| 2 | src/onboarding/review.ts | reviewLoop with full edit-section and hardening-toggle support |
| 3 | test/unit/onboarding/cans-generator.test.ts | 21 tests for generator |
| 4 | test/unit/onboarding/review.test.ts | 14 tests for review loop |

## What Was Built

### `src/onboarding/cans-generator.ts`

`generateCANSContent(data, philosophy)`:
1. Validates data with `Value.Check(CANSSchema, data)` — returns `{ success: false, errors }` on failure
2. Stringifies to YAML via `stringifyYAML`
3. Generates markdown body with Provider Summary, Clinical Philosophy, Autonomy Configuration table, Hardening Configuration section
4. Assembles `---\n{yaml}---\n\n{body}` format
5. Returns `{ success: true, content, document }`

`generatePreview(data, philosophy)`: Human-readable summary showing provider info, truncated philosophy, autonomy tiers with ON/OFF values, consent flags.

### `src/onboarding/review.ts`

`reviewLoop(io, result, workspacePath, audit)`:
- Presents 10-option review menu (approve, 7 edit sections, toggle hardening, start over)
- Choice 0: generates final CANS.md, writes to workspace, seeds integrity hash, logs audit event, returns
- Choices 1-7: builds InterviewState from current data, calls runSingleStage, merges result back
- Choice 8: inner `toggleHardeningLoop` — presents flagged list, toggles selected flag, loops until Done
- Choice 9: full `runInterview` re-run, replaces all current data

`toggleHardeningLoop(io, currentData, onUpdate)`: Inner loop using onUpdate callback to surface the updated Hardening object without direct mutation through a shared reference.

## Test Coverage

### cans-generator.test.ts (21 tests)
- Valid data: success=true, content format (starts `---\n`, contains `---\n\n`)
- Markdown body presence: `# Care Agent Nervous System`, philosophy in body
- Round-trip: parseFrontmatter + Value.Check passes on generated content
- document field returned on success
- All hardening flags present in content
- Philosophy in body (not in YAML frontmatter)
- Optional fields omitted when not present (subspecialty, institution, npi)
- subspecialty and institution appear in body when present
- Error cases: missing required field, invalid license type, errors have path+message

### review.test.ts (14 tests)
- Approve immediately: CANS.md written to workspace
- Round-trip validation: parseFrontmatter + Value.Check passes
- Integrity: .careagent/cans-integrity.json created
- Audit: .careagent/AUDIT.log contains 'cans_generated'
- Edit provider + approve: new name in written CANS.md + round-trip validation
- Edit autonomy + approve: new tiers in frontmatter + round-trip validation
- Toggle hardening + approve: toggled flag value verified + round-trip + toggle of docker_sandbox
- Audit details: provider name and specialty in audit log
- Integrity file: has 64-char SHA-256 hex hash field

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created:
- src/onboarding/cans-generator.ts — FOUND
- src/onboarding/review.ts — FOUND
- test/unit/onboarding/cans-generator.test.ts — FOUND
- test/unit/onboarding/review.test.ts — FOUND

Commits:
- 595a45c: feat(2-03): add CANS.md generator and review-edit loop
- 9e2f255: test(2-03): add generator and review loop tests (35 tests)

Tests: 293 passing (was 258 before this plan, +35 new)

## Self-Check: PASSED
