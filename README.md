# @careagent/core

> **WARNING: This project is in its infancy. Do not attempt to install CareAgent into your OpenClaw without expecting it to break everything. It goes without saying, but do not use this to care for patients or any human being.**

Clinical activation layer for AI agents.

CareAgent transforms any AI agent workspace into a credentialed, auditable, hardened clinical agent. It is built by a neurosurgeon for daily clinical use and operates under the provider's license and authority, governed by the **Irreducible Risk Hypothesis**: risk stays with the provider, and the AI acts as an extension of their clinical practice.

## How It Works

A provider installs CareAgent, completes an onboarding interview (`careagent init`), and receives a personalized **CANS.md** (Care Agent Nervous System) that activates clinical mode. CANS.md is the universal activation gate — when present and valid, CareAgent enforces scope boundaries, logs every action to an immutable audit trail, and speaks in the provider's clinical voice.

### The Four Atomic Actions

All clinical practice reduces to four actions, each with configurable autonomy tiers (autonomous, supervised, manual):

| Action | Description |
|--------|-------------|
| **Chart** | Clinical documentation (notes, H&P, operative reports) |
| **Order** | Clinical orders (medications, labs, imaging) |
| **Charge** | Billing capture (CPT/ICD coding) |
| **Perform** | Procedure execution (physical actions) |

## Platform Portability

CareAgent is platform-portable. CANS.md works alongside whatever workspace format the host platform uses:

| Platform | Workspace Files | Entry Point |
|----------|----------------|-------------|
| [OpenClaw](https://github.com/nicepkg/openclaw) | SOUL.md + AGENTS.md + USER.md | `@careagent/core` |
| AGENTS.md standard | AGENTS.md | `@careagent/core/standalone` |
| Claude Code (CLAUDE.md) | CLAUDE.md | `@careagent/core/standalone` |
| Library / programmatic | None | `@careagent/core/core` |

### Entry Points

```typescript
// OpenClaw plugin (default) — register(api) called by plugin loader
import register from '@careagent/core';

// Standalone — activate without a host platform
import { activate } from '@careagent/core/standalone';
const { adapter, audit, activation } = activate('/path/to/workspace');

// Core — pure types, schemas, and classes (no side effects)
import { ActivationGate, PlatformAdapter, CANSSchema } from '@careagent/core/core';
```

## Architecture

```
CANS.md (activation gate)
    │
    ├── Adapter Layer ──── OpenClaw / Standalone / Custom
    │
    ├── Activation ─────── Schema validation, integrity verification
    │
    ├── Audit Pipeline ─── Hash-chained JSONL, tamper detection
    │
    ├── Hardening ──────── 6 defense layers (Phase 3, in progress)
    │
    └── Clinical Skills ── Template-constrained, credential-gated (Phase 4)
```

### Key Properties

- **Zero runtime npm dependencies** — uses only Node.js built-ins
- **CANS.md as single activation file** — presence activates clinical mode; absence means standard behavior
- **Immutable audit trail** — every action logged to hash-chained JSONL with tamper detection
- **Adapter insulation** — all platform interactions go through a stable interface, never raw APIs
- **TypeBox schemas** — compile-time type safety for CANS.md validation

## Getting Started

### OpenClaw

```bash
openclaw plugins install @careagent/core
careagent init    # onboarding interview
careagent status  # verify activation
```

### Standalone

```bash
npm install @careagent/core
```

```typescript
import { activate } from '@careagent/core/standalone';

const result = activate(process.cwd());
if (result.activation.active) {
  console.log(`Clinical mode active for ${result.activation.document.provider.name}`);
}
```

## Development

```bash
pnpm install
pnpm test          # 388 tests
pnpm run build     # 4 entry points → dist/
pnpm run typecheck # TypeScript verification
```

### Project Structure

```
src/
  adapters/          # Platform adapter layer (OpenClaw, standalone, detection)
  activation/        # CANS.md schema, parser, integrity, gate
  audit/             # Hash-chained JSONL writer, pipeline, integrity service
  cli/               # careagent init + careagent status commands
  onboarding/        # 9-stage interview, CANS generator, workspace profiles
  entry/             # Platform-specific entry points
  types/             # Public TypeScript types
```

## Current Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Plugin Foundation | Complete | Adapter, activation gate, audit pipeline |
| 2. Onboarding & CLI | Complete | Interview, CANS generation, workspace supplementation |
| Portability | Complete | Multi-platform adapters, workspace profiles, entry points |
| 3. Runtime Hardening | Next | Six defense layers for scope enforcement |
| 4. Clinical Skills | Planned | Template-constrained documentation generation |
| 5. Integration | Planned | CANS continuous improvement, E2E verification |
| 6. Documentation | Planned | Architecture guides, installation docs |

## License

Apache 2.0 — transparency is a structural requirement when providers bear personal liability.
