# Coding Conventions

**Analysis Date:** 2026-02-21

## Naming Patterns

**Files:**
- `kebab-case.ts` everywhere: `cans-schema.ts`, `tool-policy.ts`, `refinement-engine.ts`
- Layer implementations prefixed with check verb: `checkToolPolicy`, `checkExecAllowlist`
- Test files mirror source structure: `src/hardening/engine.ts` → `test/unit/hardening/hardening.test.ts`
- Entry points use plain names: `core.ts`, `openclaw.ts`, `standalone.ts`

**Functions:**
- Factory functions use `create` prefix: `createHardeningEngine()`, `createNeuronClient()`, `createRefinementEngine()`, `createMockIO()`
- Boolean queries use `check` prefix: `checkToolPolicy()`, `checkVersionPin()`, `checkCansInjection()`
- Async handlers named as compound nouns: `onBeforeToolCall`, `onAgentBootstrap`
- Lowercase camelCase for all function names

**Variables:**
- camelCase for locals: `traceId`, `toolCallHandler`, `auditDir`
- SCREAMING_SNAKE_CASE for module-level constants: `LAYER_NAME`, `AUDIT_DIR`, `AUDIT_FILE`, `LAYERS`, `SACROSANCT_FIELDS`, `DEFAULT_DIVERGENCE_THRESHOLD`
- Underscore prefix for private backing state exposed as accessors: `_toolCallHandler`, `_bootstrapHandler`, `_calls`
- Prefixed with `_` in function params to intentionally ignore: `async register(_config)`

**Types/Interfaces:**
- PascalCase for all types: `ActivationResult`, `HardeningEngine`, `AuditLogInput`
- Suffix `Schema` for TypeBox schemas: `CANSSchema`, `ProviderSchema`, `AutonomySchema`
- Suffix `Type` for union type aliases derived from schemas: `AutonomyTierType`, `ActionStateType`
- Suffix `Config` for constructor/factory config objects: `RefinementEngineConfig`, `HardeningConfig`
- Suffix `Result` for function return types: `ActivationResult`, `HardeningLayerResult`, `SkillLoadResult`
- Re-export deprecated aliases with `@deprecated` JSDoc

**Constants:**
- All hardcoded string constants extracted to named module-level constants (e.g. `const LAYER_NAME = 'tool-policy'`)

## Code Style

**Formatting:**
- No Prettier config detected — formatting enforced by TypeScript strict mode and code review
- Single quotes for strings in TypeScript
- 2-space indentation (consistent throughout)
- Trailing commas in multi-line objects and arrays

**Linting:**
- No ESLint config present — TypeScript compiler used as primary lint tool
- `tsconfig.json` enables: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- One explicit `eslint-disable` used only where necessary: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` in `src/adapters/openclaw/index.ts`

## Import Organization

**Order:**
1. Node built-ins with `node:` protocol prefix: `import { readFileSync } from 'node:fs'`
2. External packages: `import { Type } from '@sinclair/typebox'`
3. Internal modules with `.js` extension suffix (required by ESM/NodeNext resolution)

**Path Aliases:**
- None — all imports use relative paths with `.js` extension (NodeNext `moduleResolution`)
- Example: `import { CANSSchema } from './cans-schema.js'`
- Cross-domain imports always use relative paths: `'../activation/cans-schema.js'`

**ESM conventions:**
- All files are ES Modules (`"type": "module"` in `package.json`)
- Import extensions must be `.js` even when source is `.ts` (NodeNext requirement)
- `node:` protocol required for all Node built-in imports

## Error Handling

**Patterns:**
- Errors thrown with descriptive messages tied to phase or system: `'Neuron client not yet implemented (Phase 5)'`, `'Engine not activated'`
- Safety violations use SCREAMING prefixes: `'SAFETY VIOLATION: Cannot modify scope fields'`
- `try/catch` used to wrap filesystem and JSON parsing operations; caught errors converted to `reason` strings
- `err instanceof Error ? err.message : String(err)` pattern for unknown error types
- Functions that can fail return result objects `{ valid: boolean, reason?: string }` rather than throwing
- Platform adapter wraps all host API calls in try/catch for graceful degradation

**Error object shape conventions:**
- Validation failures: `{ valid: false, reason: string, errors?: Array<{path, message}> }`
- Load results: `{ skillId: string, loaded: boolean, reason?: string }`
- Layer results: `{ layer: string, allowed: boolean, reason?: string }`

## Logging

**Framework:** Platform adapter `log()` method (delegates to host platform or `console`)

**Patterns:**
- All significant decisions written to audit pipeline, not console
- `console.log` only used in `src/cli/io.ts` (display output) and `src/cli/status-command.ts` (CLI output)
- `console[level]()` fallback in adapter when host API is unavailable
- Structured audit entries (JSON) preferred over free-form strings

## Comments

**When to Comment:**
- Module-level JSDoc blocks on every file explaining purpose, requirements covered (e.g. `HARD-01..07`, `CANS-02..05`), and implementation notes
- Section dividers using `// ---------------------------------------------------------------------------` with labels
- Inline comments for non-obvious logic (e.g. `// Step 1: Discovery`, numbered pipeline steps)
- `@deprecated` JSDoc on type aliases being phased out
- Phase references in stub implementations: `// Phase 5 will replace this`

**JSDoc style:**
- `@param name - Description` format
- `@returns` for non-obvious return values
- Multi-line JSDoc blocks for public factory functions and complex methods

## Function Design

**Size:** Functions are focused and short. The largest function (`applyProposal`) is ~65 lines with numbered step comments. Pipeline steps are typically 10–20 lines.

**Parameters:**
- Prefer named config objects for 3+ parameters: `createRefinementEngine({ workspacePath, audit, sessionId })`
- Two-argument functions (event, cans) for pure layer checker functions
- `Omit<Type, 'field1' | 'field2'>` used for partial input types

**Return Values:**
- Factory functions return interface types, not concrete classes
- Pure layer functions: always return `HardeningLayerResult`
- Methods that mutate return `void`
- Async functions typed explicitly: `Promise<string>`, `Promise<void>`

## Module Design

**Exports:**
- Each subsystem has an `index.ts` that re-exports the public API
- `src/entry/core.ts` is the main public re-export barrel
- Types and values exported separately: `export type { ... }` and `export { ... }`
- Internal helpers are not exported from `index.ts`

**Barrel Files:**
- `src/hardening/index.ts`, `src/refinement/index.ts`, `src/skills/index.ts` etc. provide domain-level barrels
- `src/entry/core.ts` provides the top-level library surface
- Entry points `src/entry/openclaw.ts` and `src/entry/standalone.ts` are separate export targets for platform-specific consumers

**Class vs. Function factories:**
- Classes used when stateful and multiple instances expected: `AuditPipeline`, `ObservationStore`, `ProposalQueue`, `ActivationGate`
- Factory functions (`create*`) used when returning an interface (not a class): `createHardeningEngine()`, `createRefinementEngine()`
- Pure stateless functions for layer checkers: `checkToolPolicy(event, cans)`

---

*Convention analysis: 2026-02-21*
