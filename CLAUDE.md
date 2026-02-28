# CLAUDE.md -- @careagent/provider-core

## Project Overview

Provider-core is the **clinical activation layer** for provider-facing AI agents in the CareAgent ecosystem. It governs how a provider's AI agent activates (via CANS.md), what clinical skills it can load, how tool calls are hardened through a 6-layer security pipeline, and how the system refines its own configuration through usage observation. It runs as either an OpenClaw plugin or a standalone agent.

## The Irreducible Risk Hypothesis

Clinical AI agents carry irreducible risk of harm. Provider-core manages this risk through **defense in depth**: CANS.md activation gating (no CANS = no activation), 6-layer runtime hardening (every tool call passes through all layers before execution), credential-gated clinical skill loading, append-only audit logging, and a refinement engine that can only propose changes to non-scope CANS fields (scope fields are immutable at runtime). Every security decision is deterministic and hardcoded -- never configurable via CANS.

## Directory Structure

```
provider-core/
  skills/                # Skill subdirectories with skill-manifest.json
  openclaw.plugin.json   # OpenClaw plugin descriptor
  src/
    activation/          # CANS.md parser, TypeBox schema, integrity checker, gate
    adapters/            # Platform adapters (openclaw/, standalone/)
      detect.ts          # Auto-detect runtime environment
    audit/               # Append-only audit pipeline + entry schema
    axon/                # Axon registry client
    cli/                 # CLI commands (init, status, proposals)
    credentials/         # Credential validator (NPI, licensure)
    entry/               # Entry points (openclaw.ts, standalone.ts, core.ts)
    hardening/           # 6-layer security engine
      layers/            # tool-policy, exec-allowlist, cans-injection, docker-sandbox
      engine.ts          # Layer orchestrator (short-circuit-on-deny)
      canary.ts          # before_tool_call canary
    neuron/              # Neuron client
    onboarding/          # Provider onboarding wizard (workspace writer, CANS generator)
    protocol/            # Protocol server (WebSocket)
    refinement/          # Usage observation, pattern matching, proposal generation
    skills/              # Clinical skill loader (6-step pipeline)
      chart-skill/       # Built-in chart documentation skill
    vendor/yaml/         # YAML serializer (for CANS.md write-back)
    index.ts             # Barrel export
  test/
    fixtures/            # Test data
    integration/         # Integration tests
    unit/                # Unit tests mirroring src/ structure
```

## Commands

```bash
pnpm build             # Build with tsdown
pnpm dev               # Watch mode: tsdown --watch
pnpm test              # Run tests: vitest run
pnpm test:watch        # Watch mode: vitest
pnpm test:coverage     # Coverage: vitest run --coverage
pnpm typecheck         # Type check: tsc --noEmit
pnpm clean             # Remove dist/
```

## Code Conventions

- **ESM-only** -- `"type": "module"` in package.json. All imports use `.js` extensions.
- **TypeBox for all schemas** -- `@sinclair/typebox` (devDependency). CANS schema in `src/activation/cans-schema.ts`. Audit entry schema in `src/audit/entry-schema.ts`. Skill manifest schema in `src/skills/manifest-schema.ts`.
- **TypeScript types derived from TypeBox** -- `type Foo = Static<typeof FooSchema>`. Do NOT define standalone interfaces when a TypeBox schema exists.
- **Barrel exports** -- every subdirectory has an `index.ts`. Three entry points: `./openclaw`, `./standalone`, `./core`.
- **Naming**: PascalCase for classes and schemas (suffix `Schema`), camelCase for functions, UPPER_SNAKE for constants.
- **Semicolons** -- this repo uses semicolons (unlike axon which omits them).
- **Node.js >= 22.12.0** required.
- **pnpm** as package manager.
- **Vitest** for testing. ~729 tests.

## Anti-Patterns

- **Do NOT make hardening configurable via CANS.** Hardening is always on, deterministic, and hardcoded in the plugin. It is never toggled by user configuration.
- **Do NOT allow refinement proposals to modify scope fields.** The refinement engine checks `isScopeField()` and rejects any proposal targeting identity, credential, or security-critical fields.
- **Do NOT skip the activation gate.** If CANS.md is missing, malformed, or fails integrity check, the agent must not activate. There is no fallback mode.
- **Do NOT load clinical skills without credential validation.** The 6-step skill loading pipeline requires credential check, version pin verification, and SHA-256 integrity verification.
- **Do NOT use relative imports without `.js` extension.** ESM requires explicit extensions.
- **Do NOT add runtime dependencies** without careful consideration. OpenClaw is an optional peer dependency.

## Key Technical Details

### CANS.md Activation Gate (4-step pipeline)

`src/activation/gate.ts` -- the `ActivationGate.check()` method:

1. **Presence** -- CANS.md must exist in the workspace directory
2. **Parse** -- YAML frontmatter extraction via `parseFrontmatter()`
3. **Validate** -- TypeBox schema validation via `Value.Check(CANSSchema, ...)`
4. **Integrity** -- SHA-256 hash comparison via `verifyIntegrity()`

The CANS schema requires `identity_type: 'provider'` for provider-core activation.

### 6-Layer Runtime Hardening

`src/hardening/engine.ts` -- layers execute in order, short-circuit on first deny:

1. **Tool Policy** -- allowlist of permitted tool names
2. **Exec Allowlist** -- restrict shell/exec commands to approved patterns
3. **CANS Injection** -- inject protocol rules from CANS.md into tool context
4. **Docker Sandbox** -- enforce container isolation for code execution
5-6. (Reserved for patient-core extensions: consent-gate, data-minimization)

A `canary` check runs before each tool call to detect engine health.

### Clinical Skill Loading (6 steps)

`src/skills/loader.ts`:

1. **Discovery** -- scan skill subdirectories for `skill-manifest.json`
2. **Manifest validation** -- parse and validate via TypeBox schema
2.5. **Version pin check** -- block if version != approved_version
3. **Credential check** -- validate provider credentials against manifest requirements
4. **CANS rules augmentation** -- merge CANS.md `skills.rules` with manifest
5. **Integrity verification** -- SHA-256 file hash comparison
6. **Registration** -- skill is ready for loading

### Refinement Engine

`src/refinement/refinement-engine.ts` -- observes tool usage patterns, detects divergences from CANS configuration, generates proposals for CANS.md updates (with provider approval), and writes accepted changes back to CANS.md. Scope fields (identity, credentials, security) are protected and cannot be modified by proposals.

### Append-Only Audit

`src/audit/pipeline.ts` + `src/audit/writer.ts` -- every activation, hardening decision, skill load, and refinement event is logged. Entries follow the TypeBox `AuditEntrySchema`.

### Platform Adapters

- **OpenClaw** (`src/adapters/openclaw/`) -- runs as an OpenClaw plugin (peer dep `>=2026.1.0`)
- **Standalone** (`src/adapters/standalone/`) -- runs as an independent Node.js process
- Auto-detection via `src/adapters/detect.ts`
