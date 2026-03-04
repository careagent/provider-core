# @careagent/provider-core

> Source: [github.com/careagent/provider-core](https://github.com/careagent/provider-core)

A clinical activation layer for AI agents — a TypeScript plugin that transforms AI agent workspaces into credentialed, auditable, hardened clinical agents governed by provider licenses and the Irreducible Risk Hypothesis. Part of the CareAgent ecosystem.

## Core Problem

AI agents can draft clinical documentation, prepare orders, and assist with coding — but only under a licensed provider's authority. Today, nothing prevents an AI agent from acting outside a provider's credentialed scope.

## Key Features

- **CANS.md activation gate** with TypeBox schema validation and SHA-256 integrity checking
- **Interactive onboarding** conducting conversational interviews to generate personalized CANS.md files
- **Six-layer runtime hardening** including tool policy lockdown, exec allowlist, CANS protocol injection, Docker sandbox, safety guards, and audit integration
- **Clinical skills framework** with credential-gated loading and SHA-256 verification
- **Chart-skill** for template-constrained documentation in provider voice
- **CANS continuous improvement** engine proposing updates based on usage patterns
- **Append-only audit trail** capturing actions via hash-chained JSONL logging
- **Platform portability** with four entry points and configurable workspace profiles
- **Self-contained and sandboxed** — operates entirely within the host agent framework with no external service dependencies. CareAgent is sandboxed inside the host agent; the CareAgent ecosystem is sandboxed from the broader system.

## Installation

```bash
openclaw plugins install @careagent/provider-core
openclaw gateway restart
careagent init
```

Requires Node.js >= 22.12.0.

## Tech Stack

TypeScript (~5.7), Node.js (>=22.12.0), pnpm, vitest (~4.0), tsdown (~0.20), @sinclair/typebox (~0.34).

## License

Apache 2.0
