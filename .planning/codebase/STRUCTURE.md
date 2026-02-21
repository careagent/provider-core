# Codebase Structure

**Analysis Date:** 2026-02-21

## Directory Layout

```
provider-core/
├── src/                        # All source TypeScript
│   ├── index.ts                # Default entry (re-exports openclaw.ts default)
│   ├── entry/                  # Deployment-context entry points
│   │   ├── core.ts             # Pure type/class re-exports (no side effects)
│   │   ├── openclaw.ts         # OpenClaw plugin register() function
│   │   └── standalone.ts       # Library/CLI activate() function
│   ├── adapters/               # Platform abstraction layer
│   │   ├── types.ts            # PlatformAdapter interface (central contract)
│   │   ├── detect.ts           # Duck-typing platform detection
│   │   ├── index.ts            # Re-exports
│   │   ├── openclaw/
│   │   │   └── index.ts        # OpenClaw PlatformAdapter implementation
│   │   └── standalone/
│   │       └── index.ts        # Standalone no-op PlatformAdapter implementation
│   ├── activation/             # CANS.md validation gate
│   │   ├── gate.ts             # ActivationGate class (four-step check)
│   │   ├── cans-schema.ts      # TypeBox CANSDocument schema + derived type
│   │   ├── cans-parser.ts      # YAML frontmatter parser
│   │   └── cans-integrity.ts   # SHA-256 hash store (cans-integrity.json)
│   ├── audit/                  # Append-only, hash-chained audit log
│   │   ├── pipeline.ts         # AuditPipeline (session + trace management)
│   │   ├── writer.ts           # AuditWriter (JSONL + SHA-256 hash chaining)
│   │   ├── entry-schema.ts     # AuditEntry type
│   │   └── integrity-service.ts# Background chain verification (60s interval)
│   ├── hardening/              # Before-tool-call safety guard
│   │   ├── engine.ts           # HardeningEngine factory (orchestrates layers)
│   │   ├── types.ts            # HardeningEngine, HardeningLayerFn interfaces
│   │   ├── canary.ts           # Hook liveness canary (30s timeout warning)
│   │   ├── index.ts            # Re-exports
│   │   └── layers/             # Four stateless layer functions
│   │       ├── tool-policy.ts  # Layer 1: whitelist permitted_actions
│   │       ├── exec-allowlist.ts# Layer 2: binary allowlist for Bash/exec
│   │       ├── cans-injection.ts# Layer 3: inject CAREAGENT_PROTOCOL.md at bootstrap
│   │       └── docker-sandbox.ts# Layer 4: Docker environment detection
│   ├── credentials/            # Provider credential validation
│   │   ├── index.ts            # Re-exports
│   │   ├── types.ts            # CredentialValidator, CredentialCheckResult
│   │   └── validator.ts        # createCredentialValidator factory
│   ├── skills/                 # Clinical skill loading pipeline
│   │   ├── index.ts            # Re-exports
│   │   ├── types.ts            # SkillManifest, SkillLoadResult, ChartTemplate, VoiceDirectives
│   │   ├── loader.ts           # loadClinicalSkills (six-step pipeline)
│   │   ├── manifest-schema.ts  # TypeBox manifest schema
│   │   ├── integrity.ts        # Per-file SHA-256 hash verification
│   │   ├── version-pin.ts      # approved_version enforcement
│   │   └── chart-skill/        # Built-in chart documentation skill
│   │       ├── index.ts        # Template registry, buildChartSkillInstructions
│   │       ├── template-types.ts
│   │       ├── voice-adapter.ts# extractVoiceDirectives, buildVoiceInstructions
│   │       └── templates/
│   │           ├── operative-note.ts
│   │           ├── h-and-p.ts
│   │           └── progress-note.ts
│   ├── refinement/             # Continuous CANS.md improvement engine
│   │   ├── index.ts            # Re-exports
│   │   ├── types.ts            # Observation, Proposal, SACROSANCT_FIELDS, thresholds
│   │   ├── refinement-engine.ts# createRefinementEngine factory + CANS.md write-back
│   │   ├── observation-store.ts# ObservationStore (JSONL append-only)
│   │   ├── proposal-queue.ts   # ProposalQueue (JSONL lifecycle management)
│   │   ├── pattern-matcher.ts  # detectDivergences (threshold + scope exclusion)
│   │   └── proposal-generator.ts# generateProposals from divergence patterns
│   ├── onboarding/             # Interactive CANS.md setup interview
│   │   ├── engine.ts           # runInterview state machine, InterviewStage enum
│   │   ├── stages.ts           # Individual stage handler functions
│   │   ├── defaults.ts         # Default values for interview responses
│   │   ├── cans-generator.ts   # CANS.md YAML content serializer
│   │   ├── workspace-writer.ts # File write logic
│   │   ├── workspace-profiles.ts# Per-platform file lists (openclaw, agents-standard, standalone)
│   │   └── workspace-content.ts# Content generators for SOUL.md, AGENTS.md, USER.md
│   ├── cli/                    # CLI command wiring and terminal I/O
│   │   ├── commands.ts         # registerCLI (careagent init, careagent status)
│   │   ├── init-command.ts     # runInitCommand (runs onboarding interview)
│   │   ├── status-command.ts   # runStatusCommand (activation state display)
│   │   ├── proposals-command.ts# runProposalsCommand (refinement proposal review)
│   │   ├── io.ts               # InterviewIO interface, createTerminalIO
│   │   └── prompts.ts          # Prompt helper functions
│   ├── neuron/                 # Cross-installation network client (stub)
│   │   ├── index.ts            # Re-exports
│   │   ├── types.ts            # NeuronClient, NeuronRegistration interfaces
│   │   └── client.ts           # createNeuronClient (stub — throws "not yet implemented")
│   ├── protocol/               # Cross-installation protocol server (stub)
│   │   ├── index.ts            # Re-exports
│   │   ├── types.ts            # ProtocolServer, ProtocolSession interfaces
│   │   └── server.ts           # createProtocolServer (stub — throws "not yet implemented")
│   └── vendor/                 # Vendored dependencies
│       └── yaml/
│           └── index.ts        # YAML stringification wrapper
├── skills/                     # Deployed skill packages (runtime artifacts)
│   └── chart-skill/
│       ├── skill-manifest.json # Skill manifest (id, version, requires, files, checksums)
│       └── SKILL.md            # Human-readable skill documentation
├── test/                       # Tests (separate from src)
│   ├── unit/                   # Unit tests mirroring src/ structure
│   │   ├── activation/
│   │   ├── adapters/
│   │   │   └── openclaw/
│   │   ├── audit/
│   │   ├── cli/
│   │   ├── credentials/
│   │   ├── hardening/
│   │   │   └── layers/
│   │   ├── neuron/
│   │   ├── onboarding/
│   │   ├── protocol/
│   │   ├── refinement/
│   │   └── skills/
│   ├── integration/            # Integration tests
│   └── fixtures/               # Shared test fixtures
├── dist/                       # Compiled output (generated, not committed)
│   └── entry/                  # Per-entry-point compiled files
├── .careagent/                 # Runtime workspace state (in provider's workspace, not here)
├── .planning/                  # Project planning documents
│   ├── codebase/               # Architecture analysis documents
│   ├── phases/                 # Phase plans by feature area
│   └── research/               # Research notes
├── package.json                # Package manifest with openclaw.extensions field
├── tsconfig.json               # TypeScript config (NodeNext modules, strict)
├── tsdown.config.ts            # Build config (four entry points, ESM only)
├── vitest.config.ts            # Test runner config
├── openclaw.plugin.json        # OpenClaw plugin metadata
└── pnpm-lock.yaml              # Lockfile
```

## Directory Purposes

**`src/entry/`:**
- Purpose: Deployment-context wiring. Selects the adapter and activation path for the runtime environment.
- Contains: Three entry points (openclaw, standalone, core). No business logic — only composition.
- Key files: `src/entry/openclaw.ts` (plugin registration), `src/entry/standalone.ts` (library activate())

**`src/adapters/`:**
- Purpose: Platform isolation. All host platform APIs pass through here.
- Contains: The `PlatformAdapter` interface (`types.ts`) and two implementations.
- Key files: `src/adapters/types.ts` (the central contract), `src/adapters/openclaw/index.ts` (live implementation)

**`src/activation/`:**
- Purpose: Guards all clinical functionality behind CANS.md validation.
- Contains: Gate logic, TypeBox schema, YAML parser, integrity checker.
- Key files: `src/activation/gate.ts` (ActivationGate), `src/activation/cans-schema.ts` (CANSDocument type)

**`src/audit/`:**
- Purpose: Tamper-evident audit trail. Logs every significant action with session/trace IDs.
- Contains: Pipeline (high-level API), Writer (low-level JSONL + hashing), background integrity service.
- Key files: `src/audit/pipeline.ts` (AuditPipeline), `src/audit/writer.ts` (AuditWriter)

**`src/hardening/`:**
- Purpose: Runtime safety enforcement via before-tool-call hook.
- Contains: Engine factory, four layer functions, canary.
- Key files: `src/hardening/engine.ts` (orchestrator), `src/hardening/layers/tool-policy.ts` (Layer 1)

**`src/skills/`:**
- Purpose: Clinical skill loading with credential gating, integrity verification, and version pinning.
- Contains: Loader pipeline, manifest schema, integrity checker, chart-skill implementation.
- Key files: `src/skills/loader.ts` (loadClinicalSkills), `src/skills/chart-skill/index.ts`

**`src/refinement/`:**
- Purpose: Self-improving CANS.md — observes usage divergences and proposes updates.
- Contains: Engine factory (with CANS.md write-back), observation store, proposal queue, pattern matcher.
- Key files: `src/refinement/refinement-engine.ts`, `src/refinement/pattern-matcher.ts`

**`src/onboarding/`:**
- Purpose: First-run setup flow that creates CANS.md and workspace files.
- Contains: State machine interview, stage handlers, content generators, workspace profiles.
- Key files: `src/onboarding/engine.ts` (runInterview), `src/onboarding/workspace-profiles.ts`

**`src/cli/`:**
- Purpose: Terminal I/O and command registration with host platform.
- Contains: CLI registration, command handlers, I/O abstractions.
- Key files: `src/cli/commands.ts` (registerCLI), `src/cli/io.ts` (InterviewIO interface)

**`skills/`:**
- Purpose: Deployed skill packages scanned by `loadClinicalSkills` at runtime. Each subdirectory with a `skill-manifest.json` is treated as a clinical skill.
- Contains: `chart-skill/` with manifest and SKILL.md.
- Key files: `skills/chart-skill/skill-manifest.json`

**`test/`:**
- Purpose: All tests, organized to mirror `src/` subdirectory structure.
- Contains: `unit/` (per-module unit tests), `integration/` (cross-module tests), `fixtures/` (shared test data).

## Key File Locations

**Entry Points:**
- `src/index.ts`: Default package entry — re-exports OpenClaw register function
- `src/entry/openclaw.ts`: OpenClaw plugin `register(api)` function
- `src/entry/standalone.ts`: Library `activate(workspacePath?)` function
- `src/entry/core.ts`: Pure type re-exports (no side effects)

**Configuration:**
- `package.json`: Declares `openclaw.extensions`, four `exports` conditions, peer dependency on `openclaw`
- `tsconfig.json`: TypeScript settings (NodeNext, strict mode, no unused locals/params)
- `tsdown.config.ts`: Build with four entry points, ESM-only output, external `openclaw`
- `vitest.config.ts`: Test runner configuration
- `openclaw.plugin.json`: Plugin metadata consumed by OpenClaw (id, name, skills list)

**Central Contracts:**
- `src/adapters/types.ts`: `PlatformAdapter` interface — the boundary between CareAgent and host platform
- `src/activation/cans-schema.ts`: `CANSSchema` and `CANSDocument` — the clinical configuration contract
- `src/hardening/types.ts`: `HardeningEngine`, `HardeningLayerFn` — hardening subsystem contracts

**Core Logic:**
- `src/activation/gate.ts`: Four-step CANS.md validation
- `src/hardening/engine.ts`: Hardening layer orchestration
- `src/skills/loader.ts`: Six-step skill loading pipeline
- `src/refinement/refinement-engine.ts`: Refinement engine and CANS.md write-back
- `src/refinement/pattern-matcher.ts`: Divergence detection algorithm

**Testing:**
- `test/unit/`: Unit tests matching `src/` subdirectory names
- `test/fixtures/`: Shared test data (CANS.md samples, mock observations, etc.)
- `test/integration/`: Cross-module integration tests

## Naming Conventions

**Files:**
- `kebab-case` throughout: `cans-schema.ts`, `tool-policy.ts`, `refinement-engine.ts`
- Filename describes the primary export or responsibility: `gate.ts` exports `ActivationGate`, `pipeline.ts` exports `AuditPipeline`
- Layer functions named `check-*.ts` inside `layers/`: `exec-allowlist.ts`, `tool-policy.ts`
- Factory files named after what they create: `engine.ts` exports `createHardeningEngine`
- Barrel files always named `index.ts`

**Directories:**
- `kebab-case` for all directories
- Directory names match the subsystem name: `activation/`, `hardening/`, `refinement/`
- Adapter implementations in named subdirectories: `adapters/openclaw/`, `adapters/standalone/`
- Templates in `templates/` subdirectory inside the skill directory

**Exports:**
- Classes: `PascalCase` (e.g., `ActivationGate`, `AuditPipeline`, `ObservationStore`)
- Factories: `create` prefix + `PascalCase` noun (e.g., `createHardeningEngine`, `createRefinementEngine`)
- Pure functions: `camelCase` verb phrase (e.g., `detectDivergences`, `loadClinicalSkills`, `checkToolPolicy`)
- Schemas: `PascalCase` + `Schema` suffix (e.g., `CANSSchema`, `SkillManifestSchema`)
- Types: `PascalCase` (e.g., `CANSDocument`, `HardeningLayerResult`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `SACROSANCT_FIELDS`, `DEFAULT_DIVERGENCE_THRESHOLD`)

## Where to Add New Code

**New Hardening Layer:**
- Implementation: `src/hardening/layers/<layer-name>.ts` — export a pure function `checkXxx(event, cans): HardeningLayerResult`
- Register: Add to `LAYERS` array in `src/hardening/engine.ts`
- Export: Add to `src/hardening/index.ts`
- Tests: `test/unit/hardening/layers/<layer-name>.test.ts`

**New Clinical Skill:**
- Runtime package: `skills/<skill-id>/` with `skill-manifest.json` and `SKILL.md`
- Source implementation: `src/skills/<skill-id>/` with `index.ts` and supporting files
- Export types from `src/skills/index.ts`
- Tests: `test/unit/skills/<skill-id>.test.ts`

**New CLI Command:**
- Handler: `src/cli/<command-name>-command.ts` exporting `run<CommandName>Command`
- Registration: Add `adapter.registerCliCommand(...)` call in `src/cli/commands.ts` or in the entry point for phase-gated commands
- Tests: `test/unit/cli/<command-name>-command.test.ts`

**New Platform Adapter:**
- Implementation: `src/adapters/<platform-name>/index.ts` implementing `PlatformAdapter`
- Detection: Add platform identifier to `detectPlatform()` in `src/adapters/detect.ts`
- Entry point: Add `src/entry/<platform-name>.ts` following the pattern of `src/entry/openclaw.ts`
- Build: Add entry to `tsdown.config.ts` and `exports` in `package.json`

**New Onboarding Stage:**
- Stage handler: Add to `src/onboarding/stages.ts`
- Register: Add `InterviewStage` enum value in `src/onboarding/engine.ts` and add to `STAGE_HANDLERS` map and `STAGE_SEQUENCE`

**New Utility:**
- Shared helpers that don't belong to a subsystem: `src/vendor/` for vendored code, or add to the nearest relevant subsystem's `index.ts`
- Do not create a separate `utils/` directory — utilities belong with the subsystem that owns them

## Special Directories

**`.careagent/` (in provider's workspace):**
- Purpose: Runtime state written by CareAgent during operation. Not in this repo — created in the provider's working directory.
- Generated: Yes
- Committed: No — belongs in the provider's workspace `.gitignore`
- Contents: `AUDIT.log`, `cans-integrity.json`, `observations.jsonl`, `proposals.jsonl`

**`dist/`:**
- Purpose: Compiled JavaScript output from tsdown build
- Generated: Yes (`pnpm build`)
- Committed: No (in `.gitignore`)
- Contents: ESM `.js` files + `.d.ts` declarations + source maps for all four entry points

**`coverage/`:**
- Purpose: Vitest coverage reports
- Generated: Yes (`pnpm test:coverage`)
- Committed: No
- Contents: Per-module coverage HTML/LCOV output

**`.planning/`:**
- Purpose: Architecture analysis, phase plans, research notes for GSD workflow
- Generated: No (human/AI authored)
- Committed: Yes
- Contents: `codebase/` (this document), `phases/` (phase plans), `research/`

**`skills/` (at repo root):**
- Purpose: Deployed skill package directory scanned by `loadClinicalSkills` at runtime. Distinct from `src/skills/` which contains the skill framework source code.
- Generated: Partially (manifests are hand-authored; checksums computed from actual files)
- Committed: Yes — these are runtime artifacts distributed with the package

---

*Structure analysis: 2026-02-21*
