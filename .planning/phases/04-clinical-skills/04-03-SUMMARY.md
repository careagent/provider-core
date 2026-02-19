---
phase: "04"
plan: "03"
subsystem: chart-skill
tags: [clinical-templates, voice-adapter, skill-manifest, neurosurgery]
dependency-graph:
  requires: [04-02]
  provides: [chart-skill, operative-note-template, h-and-p-template, progress-note-template, voice-adapter]
  affects: [skill-loader, system-prompt-injection]
tech-stack:
  added: []
  patterns: [template-constrained-generation, voice-adapter-bridge, spread-conditional-mapping]
key-files:
  created:
    - src/skills/chart-skill/template-types.ts
    - src/skills/chart-skill/templates/operative-note.ts
    - src/skills/chart-skill/templates/h-and-p.ts
    - src/skills/chart-skill/templates/progress-note.ts
    - src/skills/chart-skill/voice-adapter.ts
    - src/skills/chart-skill/index.ts
    - skills/chart-skill/SKILL.md
    - skills/chart-skill/skill-manifest.json
    - test/unit/skills/chart-skill.test.ts
  modified: []
decisions:
  - "Three neurosurgery-specific templates with specialty sections (Neuromonitoring, Neurological Examination, Implants/Hardware)"
  - "Voice adapter uses spread-conditional pattern to omit undefined fields from directives"
  - "SKILL.md lives in repo root skills/ directory (LLM instructions), TypeScript source in src/skills/ (code)"
metrics:
  duration: 146s
  completed: "2026-02-19"
---

# Phase 4 Plan 03: Chart-Skill Templates and Voice Adapter Summary

Three neurosurgery-specific clinical note templates (operative note with 17 sections, H&P with 14 sections, progress note with 6 SOAP sections), a voice adapter bridging CANS ClinicalVoice to VoiceDirectives with instruction builder, SKILL.md with template-constrained LLM rules, and SHA-256-verified skill manifest.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Clinical note templates and voice adapter | fc9d5d8 | template-types.ts, operative-note.ts, h-and-p.ts, progress-note.ts, voice-adapter.ts |
| 2 | Chart-skill index, SKILL.md, manifest, and tests | fc9d5d8 | index.ts, SKILL.md, skill-manifest.json, chart-skill.test.ts |

## What Was Built

### Templates (src/skills/chart-skill/templates/)

- **Operative Note** (`operative-note`): 17 sections (12 required, 5 optional). Neurosurgery-specific: Implants/Hardware, Fluids/Drains, Neuromonitoring.
- **History and Physical** (`h-and-p`): 14 sections (12 required, 2 optional). Neurosurgery-specific: Neurological Examination with detailed neuro assessment.
- **Progress Note** (`progress-note`): 6 SOAP sections (all required). Neurosurgery-specific: Neurological Status for focused neuro exam.

### Voice Adapter (src/skills/chart-skill/voice-adapter.ts)

- `extractVoiceDirectives(voice?)`: Maps CANS snake_case fields to camelCase VoiceDirectives. Uses spread-conditional pattern for clean undefined omission.
- `buildVoiceInstructions(directives)`: Generates multi-line instruction string with tone, documentation style, eponym preference, abbreviation style, and mandatory safety line.

### Chart-Skill Index (src/skills/chart-skill/index.ts)

- `CHART_SKILL_ID`: Const identifier for the skill.
- `getTemplate(id)`: O(1) lookup from Record-based registry.
- `getAllTemplates()`: Returns all three templates.
- `buildChartSkillInstructions(voice?)`: Complete instruction text for system prompt injection.

### SKILL.md (skills/chart-skill/SKILL.md)

Template-constrained LLM instructions with five rules: all required sections present, exact headers, N/A for empty optionals, never fabricate data, neurosurgery-specific sections required.

### Manifest (skills/chart-skill/skill-manifest.json)

SHA-256 integrity hash for SKILL.md. Requires MD or DO license. Pinned at version 1.0.0.

## Verification

- 23 new tests passing in chart-skill.test.ts
- 566 total tests passing across 40 test files (was 543)
- Build succeeds with all 4 entry points
- SKILL.md hash verified against manifest in tests

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Three neurosurgery-specific templates with specialty sections** -- Neuromonitoring (operative note), Neurological Examination (H&P), Neurological Status (progress note), and Implants/Hardware (operative note) are the neurosurgery differentiators.
2. **Voice adapter uses spread-conditional pattern** -- Same pattern used throughout the codebase (Decision from Phase 1 Plan 04). Cleanly omits undefined fields without explicit if-checks.
3. **SKILL.md in repo root skills/, TypeScript in src/skills/** -- Clean separation between LLM-facing instructions (loaded at runtime from disk) and TypeScript source code (compiled and bundled).

## Self-Check: PASSED

- All 9 created files verified present on disk
- Commit fc9d5d8 verified in git log
- 566 tests passing, build succeeds
