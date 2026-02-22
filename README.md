# @careagent/provider-core

Clinical activation layer for AI agents. A TypeScript plugin that transforms any AI agent workspace into a credentialed, auditable, hardened clinical agent governed by the provider's license and the Irreducible Risk Hypothesis.

Part of the [CareAgent](https://github.com/careagent) ecosystem.

## Why

AI agents can draft clinical documentation, prepare orders, and assist with coding — but only under a licensed provider's authority. Today, nothing prevents an AI agent from acting outside a provider's credentialed scope.

**provider-core** makes scope enforcement deterministic. When `CANS.md` is present in the workspace, the plugin activates credential validation, six-layer runtime hardening, clinical skill gating, and append-only audit logging. When `CANS.md` is absent, the plugin takes no action.

## Features

- **CANS.md activation gate** — single file activates the clinical layer; TypeBox schema validation and SHA-256 integrity checking on every load
- **Interactive onboarding** — conversational interview discovers provider identity, credentials, scope, specialty, clinical voice, and autonomy preferences; generates personalized CANS.md
- **Six-layer runtime hardening** — tool policy lockdown, exec allowlist, CANS protocol injection, Docker sandbox, safety guard hook, audit trail integration
- **Clinical skills framework** — credential-gated skill loading with SHA-256 integrity verification and version pinning; chart-skill generates template-constrained documentation in the provider's voice
- **CANS continuous improvement** — refinement engine proposes CANS.md updates based on observed usage patterns; provider approves or rejects every change
- **Append-only audit trail** — hash-chained JSONL log captures every action, blocked action, and state transition
- **Platform portability** — four entry points (default, openclaw, standalone, core) with workspace profiles configurable per host platform
- **Zero runtime dependencies** — all runtime needs from Node.js built-ins and bundled TypeBox

## Install

```bash
openclaw plugins install @careagent/provider-core
openclaw gateway restart
careagent init
```

Requires Node.js >= 22.12.0. See [Installation Guide](docs/installation.md) for full setup.

## Usage

```typescript
// OpenClaw plugin (auto-registered)
import { register } from '@careagent/provider-core';

// Standalone (programmatic)
import { activate } from '@careagent/provider-core/standalone';

// Core library (types and utilities only)
import {
  CANSSchema, AuditEntrySchema,
  createActivationGate, createAuditPipeline,
  createHardeningEngine, loadClinicalSkills,
  createRefinementEngine,
} from '@careagent/provider-core/core';
```

## Development

```bash
git clone https://github.com/careagent/provider-core
cd provider-core
pnpm install

pnpm test           # Run tests with coverage
pnpm typecheck      # Type-check without emitting
pnpm build          # Build to dist/
```

## Project Structure

```
src/
  index.ts            # Package entry point (OpenClaw plugin register)
  entry/              # Entry points (openclaw, standalone, core)
  activation/         # CANS.md parsing, schema validation, activation gate
  adapters/           # PlatformAdapter interface (OpenClaw, standalone)
  audit/              # Hash-chained JSONL audit pipeline
  cli/                # careagent init, status, proposals commands
  credentials/        # Credential validator (license, specialty, privilege)
  hardening/          # Six-layer runtime hardening engine
  onboarding/         # Conversational interview and CANS.md generation
  refinement/         # CANS continuous improvement engine
  skills/             # Skill loader, chart-skill templates, voice adapter
  neuron/             # Neuron client stub (v2 scope)
  protocol/           # Protocol server stub (v2 scope)
  vendor/             # Bundled YAML parser
test/
  unit/               # Unit tests (vitest)
  integration/        # E2E flow, security review, skill loading tests
skills/
  chart-skill/        # Neurosurgery-specific clinical documentation skill
docs/
  architecture.md     # Plugin model, CANS activation, hardening, skills, audit
  installation.md     # Prerequisites, setup, first-run verification
  onboarding.md       # Provider interview and CANS.md generation
  configuration.md    # CANS.md schema, skill manifests, plugin config
```

## Tech Stack

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | ~5.7 | Language |
| Node.js | >=22.12.0 | Runtime |
| pnpm | latest | Package manager |
| vitest | ~4.0 | Testing |
| tsdown | ~0.20 | Build (ESM) |
| @sinclair/typebox | ~0.34 | Runtime schema validation |

## Roadmap

- [x] **Phase 1** — Plugin foundation, clinical activation, and audit pipeline
- [x] **Phase 2** — Onboarding and CLI
- [x] **Phase 2.1** — Architectural alignment
- [x] **Phase 3** — Runtime hardening (six layers)
- [x] **Phase 4** — Clinical skills framework and chart-skill
- [x] **Phase 5** — CANS continuous improvement and integration testing
- [x] **Phase 6** — Documentation and open-source release
- [x] **Phase 7** — Production wiring gap closure
- [x] **Phase 8** — Workspace profile selection wiring

## Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | Plugin model, CANS activation, hardening, skills, audit |
| [Installation](docs/installation.md) | Prerequisites, setup, first-run verification |
| [Onboarding](docs/onboarding.md) | Provider interview and CANS.md generation |
| [Configuration](docs/configuration.md) | CANS.md schema, skill manifests, plugin config |

## Related Repositories

| Repository | Purpose |
|-----------|---------|
| [@careagent/patient-core](https://github.com/careagent/patient-core) | Patient-side CareAgent plugin |
| [@careagent/patient-chart](https://github.com/careagent/patient-chart) | Patient Chart vault |
| [@careagent/neuron](https://github.com/careagent/neuron) | Organization-level Axon node |
| [@careagent/axon](https://github.com/careagent/axon) | Open foundation network layer |
| [@careagent/provider-skills](https://github.com/careagent/provider-skills) | Provider clinical skills registry |
| [@careagent/patient-skills](https://github.com/careagent/patient-skills) | Patient clinical skills registry |

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[Apache 2.0](LICENSE)
