# Architecture

**Analysis Date:** 2026-02-21

## Pattern Overview

**Overall:** Plugin-based clinical activation layer with adapter-isolated platform coupling

**Key Characteristics:**
- A CANS.md document (YAML frontmatter in Markdown) is the single source of truth for all clinical configuration: provider identity, scope, autonomy tiers, voice, consent, and authorized skills
- All host platform interaction is mediated through a `PlatformAdapter` interface — CareAgent code never touches OpenClaw APIs directly
- Activation is gate-driven: the entire clinical stack only activates if CANS.md is present, valid against a TypeBox schema, and passes a SHA-256 integrity check
- Hardening is deterministic (always on, hardcoded) — not configurable via CANS.md
- Three independent defense layers protect scope fields from modification (pattern-matcher, proposal-generator, refinement-engine)

## Layers

**Entry Points:**
- Purpose: Select and wire the appropriate activation path for the deployment context
- Location: `src/entry/`
- Contains: `openclaw.ts` (OpenClaw plugin registration), `standalone.ts` (library/CLI `activate()` function), `core.ts` (pure type re-exports, no side effects)
- Depends on: All subsystems — adapters, activation, audit, hardening, skills, refinement
- Used by: Host platforms (OpenClaw plugin loader), library consumers, CLI tools

**Adapter Layer:**
- Purpose: Isolates all host platform coupling behind a stable interface. CareAgent code never imports from `openclaw` directly.
- Location: `src/adapters/`
- Contains: `types.ts` (PlatformAdapter interface), `detect.ts` (duck-typing platform detection), `openclaw/index.ts` (OpenClaw implementation), `standalone/index.ts` (no-op stub implementation)
- Depends on: Nothing internal (only adapter types)
- Used by: All other subsystems that need to interact with the host platform

**Activation Layer:**
- Purpose: Validates CANS.md before clinical mode is permitted — presence, frontmatter parse, TypeBox schema validation, SHA-256 integrity check
- Location: `src/activation/`
- Contains: `gate.ts` (ActivationGate class, four-step check), `cans-schema.ts` (TypeBox schema, CANSDocument type), `cans-parser.ts` (YAML frontmatter parser), `cans-integrity.ts` (SHA-256 hash store read/write)
- Depends on: `@sinclair/typebox` (dev dependency, bundled)
- Used by: Entry points, refinement engine (for write-back validation)

**Audit Layer:**
- Purpose: Append-only, SHA-256 hash-chained JSONL audit log. Active even before CANS.md exists. Includes a background integrity verification service.
- Location: `src/audit/`
- Contains: `pipeline.ts` (AuditPipeline — session management, trace IDs, convenience methods), `writer.ts` (AuditWriter — hash chaining, JSONL append), `entry-schema.ts` (AuditEntry type), `integrity-service.ts` (60-second background chain verification)
- Depends on: Node.js built-ins only (`node:crypto`, `node:fs`)
- Used by: All other subsystems — every significant action is audited

**Hardening Layer:**
- Purpose: Before-tool-call safety guard. Four sequential layers, short-circuits on first deny. Also injects clinical protocol into agent bootstrap context.
- Location: `src/hardening/`
- Contains: `engine.ts` (HardeningEngine factory, LAYERS pipeline, canary wiring), `layers/tool-policy.ts` (HARD-01: whitelist-only permitted_actions check), `layers/exec-allowlist.ts` (HARD-02: shell binary allowlist), `layers/cans-injection.ts` (HARD-03: CAREAGENT_PROTOCOL.md injected at bootstrap), `layers/docker-sandbox.ts` (HARD-04: Docker environment detection), `canary.ts` (HARD-07: hook liveness detection, warns after 30s if hook never fired)
- Depends on: Adapter layer, activation layer (CANSDocument), audit layer
- Used by: Entry points (activated after CANS.md passes gate)

**Skills Layer:**
- Purpose: Clinical skill loading with six-step validation pipeline: discovery, manifest validation, version pin check, credential check, CANS.md authorization check, integrity verification
- Location: `src/skills/`
- Contains: `loader.ts` (loadClinicalSkills), `manifest-schema.ts` (TypeBox manifest schema), `integrity.ts` (SHA-256 per-file hash verification), `version-pin.ts` (approved_version enforcement), `types.ts` (SkillManifest, SkillLoadResult, ChartTemplate, VoiceDirectives), `chart-skill/` (built-in chart documentation skill with 3 templates)
- Depends on: Activation layer (CANSDocument), credentials layer, audit layer
- Used by: Entry points (loaded after hardening engine is activated)

**Credentials Layer:**
- Purpose: Validates provider credentials (license, specialty, privilege) against skill manifest requirements
- Location: `src/credentials/`
- Contains: `validator.ts` (createCredentialValidator factory), `types.ts` (CredentialValidator interface, CredentialCheckResult)
- Depends on: Nothing internal (takes CANSDocument and skill requirements as inputs)
- Used by: Skills loader

**Refinement Layer:**
- Purpose: Continuous improvement engine — records usage observations, detects divergences from CANS.md declarations, generates proposals for provider review, applies accepted proposals back to CANS.md
- Location: `src/refinement/`
- Contains: `refinement-engine.ts` (RefinementEngine factory, CANS.md write-back logic), `observation-store.ts` (append-only JSONL in `.careagent/observations.jsonl`), `pattern-matcher.ts` (detectDivergences — groups observations, threshold filtering, scope field exclusion), `proposal-generator.ts` (generateProposals from divergence patterns), `proposal-queue.ts` (ProposalQueue — JSONL persistence in `.careagent/proposals.jsonl`), `types.ts` (Observation, DivergencePattern, Proposal, SACROSANCT_FIELDS)
- Depends on: Activation layer (cans-parser, CANSSchema for write-back validation), audit layer, vendor/yaml
- Used by: Entry points

**Onboarding Layer:**
- Purpose: Interactive CLI interview that collects provider information and writes CANS.md plus platform-specific workspace files (SOUL.md, AGENTS.md, USER.md)
- Location: `src/onboarding/`
- Contains: `engine.ts` (runInterview state machine, InterviewStage enum), `stages.ts` (individual stage handlers), `defaults.ts` (default values), `cans-generator.ts` (CANS.md content serialization), `workspace-writer.ts` (file write logic), `workspace-profiles.ts` (per-platform file list: openclaw, agents-standard, standalone), `workspace-content.ts` (content generators for SOUL.md, AGENTS.md, USER.md)
- Depends on: Activation layer (CANSDocument type), CLI layer (InterviewIO)
- Used by: CLI layer (init command)

**CLI Layer:**
- Purpose: Terminal commands registered with the host platform and interactive I/O abstractions
- Location: `src/cli/`
- Contains: `commands.ts` (registerCLI — wires `careagent init` and `careagent status`), `init-command.ts` (runInitCommand), `status-command.ts` (runStatusCommand), `proposals-command.ts` (runProposalsCommand for refinement review), `io.ts` (InterviewIO interface, createTerminalIO), `prompts.ts` (prompt helpers)
- Depends on: Adapter layer, onboarding layer, refinement layer, audit layer
- Used by: Entry points (commands registered at startup)

**Stub Layers (future phases):**
- `src/neuron/` — NeuronClient interface and stub factory (planned: cross-installation discovery)
- `src/protocol/` — ProtocolServer interface and stub factory (planned: cross-installation sessions)

## Data Flow

**OpenClaw Plugin Activation Flow:**

1. OpenClaw loads `dist/index.js`, calls `register(api)`
2. `createAdapter(api)` wraps the raw OpenClaw API behind `PlatformAdapter`
3. `new AuditPipeline(workspacePath)` starts audit logging (always active)
4. `registerCLI(adapter, workspacePath, audit)` registers `careagent init` and `careagent status`
5. `new ActivationGate(workspacePath, auditCallback).check()` runs four-step CANS.md validation
6. If inactive: logs reason to audit, calls `adapter.log('info', ...)`, returns early
7. If active: `createHardeningEngine().activate({ cans, adapter, audit })` registers `before_tool_call` handler and `agent:bootstrap` handler
8. `loadClinicalSkills(skillsDir, cans, validator, audit)` runs six-step skill loading pipeline
9. `createRefinementEngine({ workspacePath, audit, sessionId })` creates refinement engine; `careagent proposals` CLI command registered
10. `createAuditIntegrityService(audit, adapter)` registered as background service (60-second chain verification)

**Before-Tool-Call Hardening Flow:**

1. Host platform fires `before_tool_call` event with `ToolCallEvent`
2. Canary marks hook as verified (one-time first-fire notification to audit)
3. HardeningEngine.check() runs four layers in sequence:
   - Layer 1 (tool-policy): is `toolName` in `cans.scope.permitted_actions`?
   - Layer 2 (exec-allowlist): if Bash/exec tool, is first token in binary allowlist?
   - Layer 3 (cans-injection): pass-through (injection happened at bootstrap)
   - Layer 4 (docker-sandbox): Docker environment check
4. First denied layer: audit log `outcome: 'denied'`, return `{ block: true, blockReason }`
5. All layers pass: audit log each `outcome: 'allowed'`, return `{ block: false }`

**Refinement Proposal Flow:**

1. External code calls `refinement.observe({ category, field_path, declared_value, observed_value })`
2. Observation persisted to `.careagent/observations.jsonl`
3. `refinement.generateProposals()` reads all observations, calls `detectDivergences()` (threshold: 5 divergences)
4. Scope fields (scope, scope.*) excluded at pattern-matcher (defense layer 1) and proposal-generator (defense layer 2)
5. New proposals added to `.careagent/proposals.jsonl`; each creation audited
6. Provider reviews via `careagent proposals` CLI command
7. `resolveProposal(id, 'accept')` triggers `applyProposal()`: reads CANS.md, applies dot-path change, validates schema, writes file, updates integrity hash; scope field check at apply (defense layer 3)
8. Resolution (accept/reject/defer) audited with `action_state: provider-approved/rejected/modified`

**State Management:**
- All persistent state is file-based in the workspace `.careagent/` directory:
  - `.careagent/AUDIT.log` — SHA-256 hash-chained JSONL audit entries
  - `.careagent/cans-integrity.json` — known-good SHA-256 hash of CANS.md
  - `.careagent/observations.jsonl` — refinement usage observations
  - `.careagent/proposals.jsonl` — refinement proposal lifecycle state
- No in-process shared state between sessions; all state recovered from files on startup

## Key Abstractions

**PlatformAdapter (`src/adapters/types.ts`):**
- Purpose: Stable interface boundary — all CareAgent subsystems depend on this, never on OpenClaw types
- Examples: `src/adapters/openclaw/index.ts`, `src/adapters/standalone/index.ts`
- Pattern: Factory function (`createAdapter(api)`) returns interface implementation; OpenClaw wraps with try/catch for graceful degradation; standalone uses no-ops

**ActivationGate (`src/activation/gate.ts`):**
- Purpose: Four-step CANS.md validation gating all clinical functionality
- Examples: Used in both `src/entry/openclaw.ts` and `src/entry/standalone.ts`
- Pattern: Class with `check(): ActivationResult` method; returns `{ active: boolean, document: CANSDocument | null, reason?: string }`

**AuditPipeline (`src/audit/pipeline.ts`):**
- Purpose: High-level audit API — wraps AuditWriter with session management, trace IDs, and convenience methods
- Pattern: Class constructor takes workspacePath; all methods are synchronous; AuditWriter handles JSONL + hash chaining

**CANSDocument (`src/activation/cans-schema.ts`):**
- Purpose: The canonical clinical configuration type, derived from TypeBox schema via `Static<typeof CANSSchema>`
- Pattern: TypeBox schema is the single source of truth; type inference via `Static<>` ensures schema and type stay synchronized

**HardeningEngine (`src/hardening/types.ts`, `src/hardening/engine.ts`):**
- Purpose: Orchestrates four stateless layer functions with short-circuit-on-deny semantics
- Pattern: `createHardeningEngine()` factory returns engine object; `activate()` wires adapter hooks; each layer is a pure function `(event, cans) => HardeningLayerResult`

**RefinementEngine (`src/refinement/refinement-engine.ts`):**
- Purpose: Top-level API composing ObservationStore, ProposalQueue, pattern matcher, and proposal generator
- Pattern: `createRefinementEngine(config)` factory; all state persisted to files; CANS.md write-back validates against CANSSchema before writing

## Entry Points

**OpenClaw Plugin Entry (`src/entry/openclaw.ts`):**
- Location: `src/entry/openclaw.ts`, compiled to `dist/entry/openclaw.js`
- Triggers: OpenClaw plugin loader via `openclaw.extensions` field in `package.json`
- Responsibilities: Calls `register(api)` to wire the complete stack — adapter, audit, CLI, activation gate, hardening, skills, refinement, audit integrity service

**Standalone Entry (`src/entry/standalone.ts`):**
- Location: `src/entry/standalone.ts`, compiled to `dist/entry/standalone.js`
- Triggers: Programmatic call to `activate(workspacePath?)` by library consumers
- Responsibilities: Returns `ActivateResult` object with adapter, audit, activation result, and optionally engine, skills, and refinement

**Core Entry (`src/entry/core.ts`):**
- Location: `src/entry/core.ts`, compiled to `dist/entry/core.js`
- Triggers: Direct import of `@careagent/provider-core/core`
- Responsibilities: Pure type and class re-exports — no registration, no activation side effects

**Default Entry (`src/index.ts`):**
- Location: `src/index.ts`, compiled to `dist/index.js`
- Triggers: Default import of `@careagent/provider-core` (also used by OpenClaw via `openclaw.extensions`)
- Responsibilities: Re-exports the OpenClaw plugin `register` function as default export

## Error Handling

**Strategy:** Fail-safe with explicit audit logging for every failure; hard failures (invalid CANS.md) halt activation; soft failures (skill loading errors, adapter hook failures) log warnings and continue

**Patterns:**
- Activation Gate: returns structured `ActivationResult` with `reason` string; does not throw; each failure mode produces a distinct audit entry
- Hardening Engine: never throws from `check()`; `activate()` throws only if called before `activate()` (programming error guard)
- OpenClaw Adapter: every platform API call wrapped in try/catch; logs warn and falls back to safe default (e.g., `console.log`, `process.cwd()`)
- Skill Loader: per-skill errors produce `{ loaded: false, reason }` results; the loader never throws; individual skill failures do not block other skills
- RefinementEngine `applyProposal()`: throws on scope field violation (`SAFETY VIOLATION: Cannot modify scope fields`) and on schema validation failure — these are hard errors blocking CANS.md write

## Cross-Cutting Concerns

**Logging:** All logging goes through `adapter.log(level, message, data)`. This routes to OpenClaw's native logger in plugin mode and to `console[level]` in standalone mode. Never call `console.log` directly in subsystem code.

**Validation:** TypeBox is used for all schema validation (CANSDocument, SkillManifest). Validation errors use `Value.Check()` / `Value.Errors()` pattern consistently.

**Authentication:** No authentication layer. Clinical authorization is entirely CANS.md-driven: credential types/degrees/licenses/specialty declared in YAML, enforced at skill load time by `CredentialValidator`.

---

*Architecture analysis: 2026-02-21*
