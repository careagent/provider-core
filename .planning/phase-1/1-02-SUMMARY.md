---
phase: 1
plan: 02
subsystem: adapter, types, cans-schema
tags: [adapter, types, typebox, cans, schema, provider, scope, autonomy, hardening]
dependency-graph:
  requires: [1-01]
  provides: [CareAgentPluginAPI, CANSSchema, CANSDocument, adapter-types, valid-cans-fixture]
  affects: [1-03, 1-04, 1-05, 1-06]
tech-stack:
  added: ["@sinclair/typebox (devDependency, used for schema definition and validation)"]
  patterns: ["adapter pattern for API insulation", "TypeBox schemas with Static type extraction", "try/catch graceful degradation on every external call"]
key-files:
  created:
    - src/adapter/types.ts
    - src/adapter/openclaw-adapter.ts
    - src/types/index.ts
    - src/types/cans.ts
    - src/activation/cans-schema.ts
    - test/unit/adapter/openclaw-adapter.test.ts
    - test/unit/activation/cans-schema.test.ts
    - test/fixtures/valid-cans-data.ts
  modified: []
decisions:
  - "Adapter wraps every OpenClaw call in try/catch for graceful degradation"
  - "Workspace resolution uses 3-level fallback: api.workspaceDir > api.config.workspaceDir > api.context.workspaceDir > process.cwd()"
  - "clinical_voice is Optional at the CANS root; all other top-level sections are required"
  - "ProviderLicense.type uses Union of Literals rather than string enum for TypeBox pattern safety"
  - "Test fixture uses const assertions for literal type safety"
metrics:
  duration: 165s
  completed: "2026-02-18T03:51:00Z"
  tasks: 2
  files-created: 8
  files-modified: 0
  tests-added: 40
  tests-total: 42
requirements: [PLUG-04, CANS-02, CANS-03, CANS-04, CANS-05]
---

# Phase 1 Plan 02: Adapter Layer, Shared Types, and CANS.md TypeBox Schema Summary

Adapter layer insulates all CareAgent code from OpenClaw internals with try/catch on every API call; complete CANS.md TypeBox schema covers provider identity, scope of practice, autonomy tiers, hardening flags, and consent configuration.

## Tasks Completed

### Task 1: Adapter layer and shared types (bf67b33)

Created the adapter boundary between CareAgent and OpenClaw:

- **src/adapter/types.ts**: CareAgentPluginAPI interface with 7 methods (getWorkspacePath, onBeforeToolCall, onAgentBootstrap, registerCliCommand, registerBackgroundService, registerSlashCommand, log), plus ToolCallEvent, ToolCallResult, ToolCallHandler, BootstrapHandler, BootstrapContext, CliCommandConfig, ServiceConfig, SlashCommandConfig types
- **src/adapter/openclaw-adapter.ts**: `createAdapter(api: unknown)` function that translates CareAgentPluginAPI calls to raw OpenClaw API, with every call wrapped in try/catch. Workspace path resolves through 3 fallback levels. Log falls back to console when api.log is unavailable.
- **src/types/index.ts**: Re-exports all adapter types for clean imports from `@careagent/provider-core`
- **test/unit/adapter/openclaw-adapter.test.ts**: 20 tests covering adapter creation, workspace path resolution, graceful degradation when API methods are missing, and console fallback logging

### Task 2: CANS.md TypeBox schema (4316dd4)

Created the complete CANS.md frontmatter schema:

- **src/activation/cans-schema.ts**: TypeBox schemas for ProviderLicense (CANS-02), Provider identity (CANS-02), Scope of practice (CANS-03), Autonomy tiers (CANS-04), Hardening flags (CANS-05), Consent (CANS-05), ClinicalVoice (optional), and the composite CANSSchema. All sub-schemas exported individually.
- **src/types/cans.ts**: Re-exports CANSSchema and CANSDocument type
- **test/fixtures/valid-cans-data.ts**: Neurosurgeon fixture with full provider identity, scope, autonomy, hardening, and consent for reuse across test suites
- **test/unit/activation/cans-schema.test.ts**: 20 tests covering valid document acceptance, missing required fields, invalid license types, state length constraints, NPI format validation, empty arrays, autonomy tier validation, error reporting with paths, and optional field omission

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Every OpenClaw API call wrapped in try/catch | OpenClaw releases daily with breaking changes; graceful degradation prevents plugin crashes |
| 3-level workspace path fallback | Different OpenClaw versions expose workspace path at different locations on the API object |
| clinical_voice is Optional, all other root sections required | Clinical voice is populated during onboarding (Phase 2); provider, scope, autonomy, hardening, consent are required for activation |
| Union of Literals for license type | TypeBox pattern safety: string enums would allow any string at runtime, literals enforce exact match |
| const assertions in test fixture | Ensures fixture literal values match TypeBox Literal types without extra casting |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

```
pnpm build -- PASSED (199ms)
pnpm test  -- PASSED (42/42 tests, 180ms)
```

## Files Created

| File | Purpose |
|------|---------|
| src/adapter/types.ts | CareAgentPluginAPI interface and all adapter types |
| src/adapter/openclaw-adapter.ts | Translation layer with graceful degradation |
| src/types/index.ts | Type re-exports (adapter + CANS) |
| src/types/cans.ts | CANS type re-exports |
| src/activation/cans-schema.ts | Complete CANS.md TypeBox schema |
| test/unit/adapter/openclaw-adapter.test.ts | 20 adapter tests |
| test/unit/activation/cans-schema.test.ts | 20 schema validation tests |
| test/fixtures/valid-cans-data.ts | Reusable valid CANS document fixture |

## Self-Check: PASSED

All 8 created files verified on disk. Both commit hashes (bf67b33, 4316dd4) verified in git log.
