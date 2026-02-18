---
phase: 2
plan: "04"
subsystem: onboarding
tags: [workspace-writer, content-generators, file-io, atomic-write, markers]
dependency_graph:
  requires: [2-02]
  provides: [workspace-supplementation]
  affects: [SOUL.md, AGENTS.md, USER.md]
tech_stack:
  added: []
  patterns: [html-comment-markers, atomic-rename-write, pure-function-generators]
key_files:
  created:
    - src/onboarding/workspace-content.ts
    - src/onboarding/workspace-writer.ts
    - test/unit/onboarding/workspace-content.test.ts
    - test/unit/onboarding/workspace-writer.test.ts
  modified: []
decisions:
  - HTML comment markers enable idempotent round-trip supplementation without corrupting user-authored content
  - Atomic write via .tmp rename prevents partial-write corruption
  - Pure function generators with conditional omission (never render empty sections)
metrics:
  duration: 210s
  completed: 2026-02-18
  tasks: 4
  files: 4
---

# Phase 2 Plan 04: Workspace File Supplementation System Summary

**One-liner:** HTML-marker-based idempotent writer injects clinical sections into SOUL.md, AGENTS.md, USER.md using pure content generators from CANSDocument.

## What Was Built

### `src/onboarding/workspace-content.ts`

Three pure functions that generate clinical markdown sections from a `CANSDocument`:

- `generateSoulContent(data, philosophy)` — Produces a SOUL.md section with Clinical Persona, Clinical Philosophy, Scope Awareness, and optional Voice sub-sections. All optional fields (subspecialty, institution, prohibited_actions, clinical_voice) are conditionally omitted.
- `generateAgentsContent(data)` — Produces an AGENTS.md section with Clinical Safety Rules (including SYNTHETIC DATA ONLY warning), Documentation Standards (with autonomy tier table), and Audit Compliance rules.
- `generateUserContent(data)` — Produces a USER.md section with Provider Identity (name, license, optional NPI, specialty, optional subspecialty, optional institution, credential status defaulting to 'active') and Preferences (autonomy tiers).

### `src/onboarding/workspace-writer.ts`

Two exports:

- `supplementFile(existingContent, clinicalSection)` — Pure function. Finds `<!-- CareAgent: BEGIN -->` and `<!-- CareAgent: END -->` markers and replaces between them, or appends if absent, or returns only the marked section if the file is empty. Handles separator logic (double newline when existing content doesn't end with newline).
- `supplementWorkspaceFiles(workspacePath, data, philosophy)` — Reads existing SOUL.md/AGENTS.md/USER.md (or empty string if missing), generates clinical content, supplements, and atomically writes via `.tmp` rename.

## Test Results

- `test/unit/onboarding/workspace-writer.test.ts`: 15 tests — all passing
- `test/unit/onboarding/workspace-content.test.ts`: 32 tests — all passing
- Full suite: 279/279 tests passing (added 68 new tests, all 211 previous still pass)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- FOUND: src/onboarding/workspace-content.ts
- FOUND: src/onboarding/workspace-writer.ts
- FOUND: test/unit/onboarding/workspace-content.test.ts
- FOUND: test/unit/onboarding/workspace-writer.test.ts

Commits verified:
- 342d88b feat(2-04): add clinical content generators for workspace files
- 8e99c5f feat(2-04): add workspace file supplementation writer with HTML markers
- fd89248 test(2-04): add unit tests for workspace writer and content generators
