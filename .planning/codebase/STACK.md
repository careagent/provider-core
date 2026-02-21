# Technology Stack

**Analysis Date:** 2026-02-21

## Languages

**Primary:**
- TypeScript 5.7 - All source code in `src/` and `test/`

**Secondary:**
- JSON - Skill manifests (`skills/chart-skill/skill-manifest.json`), plugin metadata (`openclaw.plugin.json`)
- YAML - CANS.md frontmatter (parsed/written at runtime via vendored `yaml` library)
- Markdown - CANS.md documents, SKILL.md skill definition files

## Runtime

**Environment:**
- Node.js >=22.12.0 (enforced in `package.json` `engines` field; development machine runs v22.22.0)

**Package Manager:**
- pnpm 10.23.0
- Lockfile: `pnpm-lock.yaml` present and committed

## Module System

**Format:** ESM only (`"type": "module"` in `package.json`)
- All imports use `.js` extensions on `.ts` source files (NodeNext resolution)
- `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`

## Frameworks

**Testing:**
- Vitest 4.0 — test runner and assertion library
- Config: `vitest.config.ts`
- Coverage: `@vitest/coverage-v8` 4.0 (V8-based coverage, 80% threshold on all metrics)

**Build:**
- tsdown 0.20 — TypeScript bundler (wraps Rollup/esbuild)
- Config: `tsdown.config.ts`
- Output: `dist/` in ESM format only
- Source maps and `.d.ts` declaration files emitted alongside JS

## Key Dependencies

**Critical (devDependencies — bundled at build time):**
- `@sinclair/typebox` ~0.34.0 — runtime schema definition and validation for CANS.md documents and skill manifests; used throughout `src/activation/cans-schema.ts`, `src/audit/entry-schema.ts`, `src/skills/manifest-schema.ts`; `Value.Check` and `Value.Errors` patterns used for validation
- `yaml` ^2.8.2 — YAML parser/stringifier for CANS.md frontmatter; vendored via `src/vendor/yaml/index.ts` and bundled into dist (zero runtime dependency); used in `src/activation/cans-parser.ts` and `src/refinement/refinement-engine.ts`
- `typescript` ~5.7.0 — compiler
- `vitest` ~4.0.0 — test runner
- `@vitest/coverage-v8` ~4.0.0 — coverage provider
- `tsdown` ~0.20.0 — build tool

**Runtime dependencies:** Zero. The published package has no `dependencies` field. All third-party code is bundled into `dist/` at build time. Only `node:` built-ins are used at runtime.

**Peer Dependencies:**
- `openclaw` >=2026.1.0 (optional) — the AI agent host platform; accessed only via the adapter pattern in `src/adapters/openclaw/index.ts`; typed as `unknown` since CareAgent cannot depend on OpenClaw types

## Node.js Built-ins Used

All external I/O goes through Node.js built-ins exclusively:
- `node:fs` — file reads/writes for CANS.md, audit log, observations store, proposal queue, skill files
- `node:crypto` — SHA-256 hashing (`createHash`) and `randomUUID` for session/trace IDs
- `node:path` — path joining and directory resolution
- `node:url` — `fileURLToPath` for resolving `import.meta.url` to filesystem paths
- `node:readline/promises` — interactive CLI prompts in `src/cli/io.ts`
- `node:process` — `stdin`, `stdout`, `process.cwd()`, `process.env.CONTAINER`

## Configuration

**TypeScript:**
- `tsconfig.json` — strict mode, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`; target ES2023; excludes `test/` from compilation (tests use Vitest directly)

**Build:**
- `tsdown.config.ts` — four entry points: `src/index.ts`, `src/entry/openclaw.ts`, `src/entry/standalone.ts`, `src/entry/core.ts`; `openclaw` is externalized (not bundled)

**Testing:**
- `vitest.config.ts` — globals enabled, tests in `test/**/*.test.ts`, coverage threshold 80% on lines/branches/functions/statements, `src/vendor/**` excluded from coverage

**Coverage output:** `coverage/` directory (gitignored pattern expected)
**Build output:** `dist/` directory

## Platform Requirements

**Development:**
- Node.js >=22.12.0
- pnpm (version 10.x used)

**Production / Deployment:**
- Distributed as an npm package (`@careagent/provider-core`)
- Consumed either as an OpenClaw plugin (host platform discovers via `openclaw.extensions` in `package.json`) or as a standalone library
- Exports four entry points: default/openclaw, `/openclaw`, `/standalone`, `/core`
- Runtime: any Node.js >=22.12.0 environment; no external services required

---

*Stack analysis: 2026-02-21*
