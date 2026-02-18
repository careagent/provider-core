# Phase 1: Plugin Foundation, Clinical Activation, and Audit Pipeline

**Phase:** 01-foundation
**Plans:** 6 plans in 5 waves
**Requirements:** PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, CANS-01, CANS-02, CANS-03, CANS-04, CANS-05, CANS-06, CANS-07, AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05, AUDT-06

---

## Wave Structure

| Wave | Plans | Parallel | Autonomous |
|------|-------|----------|------------|
| 1 | Plan 01 (Project Scaffold) | solo | yes |
| 2 | Plan 02 (Adapter + Types + CANS Schema) | solo | yes |
| 3 | Plan 03 (Activation Gate), Plan 04 (Audit Pipeline) | parallel | yes, yes |
| 4 | Plan 05 (Plugin Wiring + Audit Service) | solo | yes |
| 5 | Plan 06 (Test Suite + Verification) | solo | yes |

## Requirement Coverage

| Plan | Requirements |
|------|-------------|
| 01 | PLUG-01, PLUG-02, PLUG-05 |
| 02 | PLUG-04, CANS-02, CANS-03, CANS-04, CANS-05 |
| 03 | CANS-01, CANS-06, CANS-07 |
| 04 | AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05 |
| 05 | PLUG-03, AUDT-06 |
| 06 | (verification of all 18 requirements) |

---

## Plan 01: Project Scaffold and Plugin Manifest

```yaml
phase: 01-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tsconfig.json
  - tsdown.config.ts
  - vitest.config.ts
  - openclaw.plugin.json
  - src/index.ts
  - .gitignore
autonomous: true
requirements: [PLUG-01, PLUG-02, PLUG-05]

must_haves:
  truths:
    - "pnpm install completes without errors"
    - "pnpm build produces dist/index.js and dist/index.d.ts"
    - "package.json has zero runtime dependencies (dependencies field is empty object)"
    - "openclaw.plugin.json declares plugin ID and configSchema reference"
    - "package.json openclaw.extensions points to dist/index.js"
  artifacts:
    - path: "package.json"
      provides: "Plugin manifest with openclaw.extensions, peerDependencies, zero runtime deps"
      contains: "openclaw"
    - path: "openclaw.plugin.json"
      provides: "Plugin metadata for OpenClaw discovery"
      contains: "careagent"
    - path: "tsdown.config.ts"
      provides: "Build configuration for ESM output"
      contains: "defineConfig"
    - path: "vitest.config.ts"
      provides: "Test configuration with V8 coverage"
      contains: "v8"
    - path: "src/index.ts"
      provides: "Plugin entry point stub"
      exports: ["default"]
  key_links:
    - from: "package.json"
      to: "dist/index.js"
      via: "openclaw.extensions field"
      pattern: "openclaw.*extensions.*dist/index"
    - from: "tsdown.config.ts"
      to: "src/index.ts"
      via: "entry point"
      pattern: "entry.*src/index"
```

### Objective

Create the complete project scaffold for @careagent/core: package.json with zero runtime dependencies and OpenClaw peer dependency, TypeScript configuration targeting Node 22 ESM, tsdown build config, Vitest test config, and a stub entry point that exports a register function.

Purpose: Everything in Phase 1 depends on a buildable, testable project. This plan creates the skeleton.
Output: A project that runs `pnpm install`, `pnpm build`, and `pnpm test` without errors.

### Context

```
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phase-1/RESEARCH.md (Standard Stack section, Plugin Manifest section, tsdown Configuration section, Vitest Configuration section)
@.planning/research/STACK.md (Package Structure section, Package.json Structure section)
```

### Tasks

#### Task 1: Initialize project and configure build toolchain

**Type:** auto
**Files:**
- `package.json`
- `tsconfig.json`
- `tsdown.config.ts`
- `vitest.config.ts`
- `.gitignore`
- `.npmrc`

**Action:**

1. Create `package.json` with the following exact structure:
   ```json
   {
     "name": "@careagent/core",
     "version": "0.1.0",
     "description": "Clinical activation layer for OpenClaw personal AI assistant",
     "license": "Apache-2.0",
     "type": "module",
     "openclaw": {
       "extensions": ["./dist/index.js"]
     },
     "exports": {
       ".": {
         "import": "./dist/index.js",
         "types": "./dist/index.d.ts"
       }
     },
     "engines": {
       "node": ">=22.12.0"
     },
     "peerDependencies": {
       "openclaw": ">=2026.1.0"
     },
     "devDependencies": {
       "typescript": "~5.7.0",
       "tsdown": "~0.20.0",
       "vitest": "~4.0.0",
       "@vitest/coverage-v8": "~4.0.0",
       "@sinclair/typebox": "~0.34.0"
     },
     "dependencies": {},
     "scripts": {
       "build": "tsdown",
       "dev": "tsdown --watch",
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage",
       "typecheck": "tsc --noEmit",
       "clean": "rm -rf dist"
     }
   }
   ```
   CRITICAL: `dependencies` must be an empty object `{}`. All runtime needs come from Node.js built-ins, OpenClaw peer dep, and CareAgent's own code. Do NOT add `openclaw` to devDependencies yet -- it requires VPS installation. TypeBox is a devDependency because it will be bundled by tsdown into the output (or available at runtime through OpenClaw's peer dependency).

2. Create `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2023",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "lib": ["ES2023"],
       "outDir": "dist",
       "rootDir": "src",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true,
       "noImplicitReturns": true,
       "noFallthroughCasesInSwitch": true
     },
     "include": ["src/**/*.ts"],
     "exclude": ["node_modules", "dist", "test"]
   }
   ```

3. Create `tsdown.config.ts`:
   ```typescript
   import { defineConfig } from 'tsdown';

   export default defineConfig({
     entry: ['src/index.ts'],
     format: ['esm'],
     dts: true,
     clean: true,
     sourcemap: true,
     external: ['openclaw', 'openclaw/*'],
   });
   ```
   Note: Use `'openclaw/*'` glob to externalize all openclaw subpath imports.

4. Create `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       include: ['test/**/*.test.ts'],
       coverage: {
         provider: 'v8',
         include: ['src/**/*.ts'],
         exclude: ['src/vendor/**'],
         thresholds: {
           lines: 80,
           branches: 80,
           functions: 80,
           statements: 80,
         },
       },
     },
   });
   ```

5. Create `.gitignore`:
   ```
   node_modules/
   dist/
   coverage/
   *.tsbuildinfo
   .DS_Store
   ```

6. Create `.npmrc`:
   ```
   shamefully-hoist=false
   strict-peer-dependencies=false
   ```
   The `strict-peer-dependencies=false` is needed because openclaw peer dep will not be installed in dev (VPS-only).

7. Run `pnpm install` to install devDependencies.

**Verify:**
```bash
pnpm install && echo "PASS: install" || echo "FAIL: install"
cat package.json | node -e "const p=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(Object.keys(p.dependencies).length === 0 ? 'PASS: zero deps' : 'FAIL: has deps')"
```

**Done:** `pnpm install` succeeds. `package.json` has `dependencies: {}`. All dev dependencies are installed. Build and test scripts are defined.

---

#### Task 2: Create plugin manifest and entry point stub

**Type:** auto
**Files:**
- `openclaw.plugin.json`
- `src/index.ts`

**Action:**

1. Create directory `src/`.

2. Create `openclaw.plugin.json`:
   ```json
   {
     "id": "@careagent/core",
     "name": "CareAgent",
     "description": "Clinical activation layer — transforms OpenClaw into a credentialed, auditable clinical agent",
     "version": "0.1.0",
     "configSchema": {},
     "skills": [],
     "commands": [],
     "hooks": []
   }
   ```
   The `configSchema` starts as an empty object. It will be populated with TypeBox schema in Plan 02 when the adapter layer is built. The `skills`, `commands`, and `hooks` arrays are empty stubs -- Plan 05 wires the actual registrations.

3. Create `src/index.ts`:
   ```typescript
   /**
    * @careagent/core — Clinical activation layer for OpenClaw
    *
    * This is the plugin entry point. OpenClaw discovers this via the
    * `openclaw.extensions` field in package.json and calls the default
    * export with the plugin API.
    *
    * Phase 1 wires: Adapter, Activation Gate, Audit Pipeline.
    * Later phases add: Onboarding, Hardening, Skills, CLI.
    */
   export default function register(api: unknown): void {
     // Will be implemented in Plan 05 after all subsystems are built.
     // Stub ensures the build succeeds and the plugin loads without error.
     console.log('[CareAgent] Plugin loaded (stub — not yet wired)');
   }
   ```
   The function takes `api: unknown` intentionally -- the adapter layer (Plan 02) will define our own typed interface. We do NOT import from `openclaw/plugin-sdk` until we verify the correct import path on VPS.

4. Run `pnpm build` and verify it produces `dist/index.js` and `dist/index.d.ts`.

5. Create a minimal smoke test at `test/smoke.test.ts`:
   ```typescript
   import { describe, it, expect } from 'vitest';

   describe('@careagent/core', () => {
     it('exports a register function', async () => {
       const mod = await import('../src/index.js');
       expect(typeof mod.default).toBe('function');
     });

     it('register function accepts an argument without throwing', () => {
       const mod = require('../src/index.js');
       // Should not throw when called with a mock API
       expect(() => mod.default({})).not.toThrow();
     });
   });
   ```

6. Run `pnpm test` and verify the smoke test passes.

**Verify:**
```bash
pnpm build && ls dist/index.js dist/index.d.ts && echo "PASS: build" || echo "FAIL: build"
pnpm test && echo "PASS: test" || echo "FAIL: test"
```

**Done:** `pnpm build` produces `dist/index.js` and `dist/index.d.ts`. `pnpm test` passes. The plugin entry point exports a default register function. `openclaw.plugin.json` declares the plugin ID and metadata.

---

## Plan 02: Adapter Layer, Shared Types, and CANS Schema

```yaml
phase: 01-foundation
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/adapter/types.ts
  - src/adapter/openclaw-adapter.ts
  - src/types/index.ts
  - src/types/cans.ts
  - src/activation/cans-schema.ts
autonomous: true
requirements: [PLUG-04, CANS-02, CANS-03, CANS-04, CANS-05]

must_haves:
  truths:
    - "CareAgent code never imports from openclaw directly — only through the adapter"
    - "CANS schema defines provider identity with name, NPI, license (type/state/number), specialty, institution, privileges, credential status"
    - "CANS schema defines scope of practice with permitted and prohibited actions"
    - "CANS schema defines autonomy tiers (autonomous/supervised/manual) for chart, order, charge, perform"
    - "CANS schema defines hardening flags (booleans per layer) and consent configuration"
    - "TypeBox schema compiles and exports a Static type"
  artifacts:
    - path: "src/adapter/types.ts"
      provides: "CareAgent-internal interface for all OpenClaw interactions"
      contains: "CareAgentPluginAPI"
    - path: "src/adapter/openclaw-adapter.ts"
      provides: "Translation layer from OpenClaw API to CareAgent interface"
      exports: ["createAdapter"]
    - path: "src/activation/cans-schema.ts"
      provides: "Complete TypeBox schema for CANS.md frontmatter"
      exports: ["CANSSchema", "CANSDocument"]
    - path: "src/types/index.ts"
      provides: "Shared CareAgent type re-exports"
    - path: "src/types/cans.ts"
      provides: "CANS document type and related types"
  key_links:
    - from: "src/adapter/openclaw-adapter.ts"
      to: "src/adapter/types.ts"
      via: "implements CareAgentPluginAPI"
      pattern: "CareAgentPluginAPI"
    - from: "src/activation/cans-schema.ts"
      to: "@sinclair/typebox"
      via: "TypeBox Type builders"
      pattern: "import.*Type.*from.*typebox"
```

### Objective

Build the adapter layer that insulates all CareAgent code from OpenClaw internals, define shared types, and create the complete CANS.md TypeBox schema covering provider identity, scope of practice, autonomy tiers, and hardening configuration.

Purpose: The adapter layer prevents OpenClaw breaking changes from cascading through CareAgent. The CANS schema is the type foundation that the activation gate (Plan 03) validates against.
Output: Typed interfaces for OpenClaw interaction, complete CANS.md schema with TypeScript types.

### Context

```
@.planning/PROJECT.md
@.planning/phase-1/RESEARCH.md (Pattern 1: Adapter Layer, Pattern 4: TypeBox Schema-First CANS.md, YAML Parsing Decision)
@.planning/research/ARCHITECTURE.md (Component 2: Activation Gate, CANS.md structure)
@.planning/research/PITFALLS.md (Pitfall 3: OpenClaw Breaking Changes, Pitfall 9: CANS.md Brittleness)
@src/index.ts (from Plan 01)
```

### Tasks

#### Task 1: Adapter layer and shared types

**Type:** auto
**Files:**
- `src/adapter/types.ts`
- `src/adapter/openclaw-adapter.ts`
- `src/types/index.ts`

**Action:**

1. Create `src/adapter/types.ts` defining CareAgent's own interface for OpenClaw interactions. This is the ONLY place OpenClaw concepts are defined in CareAgent terms:

   Define these interfaces:
   - `CareAgentPluginAPI` — the main interface with methods:
     - `getWorkspacePath(): string` — returns the workspace directory path
     - `onBeforeToolCall(handler: ToolCallHandler): void` — register before_tool_call hook
     - `onAgentBootstrap(handler: BootstrapHandler): void` — register agent:bootstrap hook
     - `registerCliCommand(config: CliCommandConfig): void` — register a CLI command
     - `registerBackgroundService(config: ServiceConfig): void` — register a background service
     - `registerSlashCommand(config: SlashCommandConfig): void` — register a slash command
     - `log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void` — structured logging

   - `ToolCallEvent` — `{ toolName: string; method?: string; params?: Record<string, unknown>; sessionKey?: string }`
   - `ToolCallResult` — `{ block: boolean; blockReason?: string }`
   - `ToolCallHandler` — `(call: ToolCallEvent) => ToolCallResult`
   - `BootstrapHandler` — `(context: BootstrapContext) => void`
   - `BootstrapContext` — `{ addFile(name: string, content: string): void }`
   - `CliCommandConfig` — `{ name: string; description: string; handler: (...args: unknown[]) => void | Promise<void> }`
   - `ServiceConfig` — `{ id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }`
   - `SlashCommandConfig` — `{ name: string; description: string; handler: (args: string) => void | Promise<void> }`

   Export ALL interfaces and types. These are CareAgent-owned types — they intentionally do NOT import from OpenClaw.

2. Create `src/adapter/openclaw-adapter.ts` that implements the translation:

   Export a `createAdapter(api: unknown): CareAgentPluginAPI` function.

   Inside, cast `api` to `any` (we do not trust OpenClaw's types to be stable). Implement each method by calling the corresponding OpenClaw API, with try/catch wrapping for graceful degradation:

   - `getWorkspacePath()`: Try `api.workspaceDir`, then `api.config?.workspaceDir`, then `api.context?.workspaceDir`, fallback to `process.cwd()`. Log which path was resolved.
   - `onBeforeToolCall(handler)`: Wrap in try/catch. If registration fails, log warning "before_tool_call hook registration failed — safety guard will be degraded."
   - `onAgentBootstrap(handler)`: Register via `api.on('agent:bootstrap', ...)` or `registerPluginHooksFromDir` pattern. Try/catch with degradation warning.
   - `registerCliCommand(config)`: Call `api.registerCli(({ program }) => { program.command(config.name).description(config.description).action(config.handler) }, { commands: [config.name] })`.
   - `registerBackgroundService(config)`: Call `api.registerService({ id: config.id, start: config.start, stop: config.stop })`.
   - `registerSlashCommand(config)`: Call `api.registerCommand({ name: config.name, description: config.description, handler: config.handler })`.
   - `log(level, message, data)`: Call `api.log?.(level, message, data)` if available, otherwise `console[level](...)`.

   IMPORTANT: Every OpenClaw interaction is wrapped in try/catch. This is the adapter's primary value — upstream changes break here, not throughout CareAgent.

3. Create `src/types/index.ts` that re-exports from adapter types and will later re-export CANS types:
   ```typescript
   export type {
     CareAgentPluginAPI,
     ToolCallEvent,
     ToolCallResult,
     ToolCallHandler,
     BootstrapHandler,
     BootstrapContext,
     CliCommandConfig,
     ServiceConfig,
     SlashCommandConfig,
   } from '../adapter/types.js';
   ```

4. Create `test/unit/adapter/openclaw-adapter.test.ts`:
   Test the adapter with a mock API object:
   - `createAdapter({})` does not throw
   - `getWorkspacePath()` returns `process.cwd()` when no workspace properties exist on the mock
   - `getWorkspacePath()` returns the workspace path when `api.workspaceDir` is set
   - `onBeforeToolCall()` does not throw when `api.on` is missing (graceful degradation)
   - `registerCliCommand()` calls `api.registerCli` when available
   - `log()` falls back to console when `api.log` is missing

**Verify:**
```bash
pnpm build && pnpm test
```

**Done:** Adapter layer exports `createAdapter`. All CareAgent code can interact with OpenClaw through `CareAgentPluginAPI` without direct OpenClaw imports. Adapter tests pass confirming graceful degradation.

---

#### Task 2: CANS.md TypeBox schema

**Type:** auto
**Files:**
- `src/activation/cans-schema.ts`
- `src/types/cans.ts`

**Action:**

1. Create `src/activation/cans-schema.ts` with the complete CANS.md frontmatter TypeBox schema:

   Import `Type` and `Static` from `@sinclair/typebox`.

   Define these sub-schemas:

   **Provider License (CANS-02):**
   ```typescript
   const ProviderLicenseSchema = Type.Object({
     type: Type.Union([
       Type.Literal('MD'), Type.Literal('DO'),
       Type.Literal('NP'), Type.Literal('PA'),
       Type.Literal('CRNA'), Type.Literal('CNM'),
       Type.Literal('PhD'), Type.Literal('PsyD'),
     ]),
     state: Type.String({ minLength: 2, maxLength: 2, description: 'US state abbreviation' }),
     number: Type.String({ minLength: 1, description: 'License number' }),
     verified: Type.Boolean({ description: 'Always false in dev — future Axon verification' }),
   });
   ```

   **Provider Identity (CANS-02):**
   ```typescript
   const ProviderSchema = Type.Object({
     name: Type.String({ minLength: 1 }),
     npi: Type.Optional(Type.String({ pattern: '^[0-9]{10}$', description: 'National Provider Identifier' })),
     license: ProviderLicenseSchema,
     specialty: Type.String({ minLength: 1 }),
     subspecialty: Type.Optional(Type.String()),
     institution: Type.Optional(Type.String()),
     privileges: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: 'Institutional privileges' }),
     credential_status: Type.Optional(Type.Union([
       Type.Literal('active'),
       Type.Literal('pending'),
       Type.Literal('expired'),
     ])),
   });
   ```

   **Scope of Practice (CANS-03):**
   ```typescript
   const ScopeSchema = Type.Object({
     permitted_actions: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
     prohibited_actions: Type.Optional(Type.Array(Type.String())),
     institutional_limitations: Type.Optional(Type.Array(Type.String())),
   });
   ```

   **Autonomy Tiers (CANS-04):**
   ```typescript
   const AutonomyTier = Type.Union([
     Type.Literal('autonomous'),
     Type.Literal('supervised'),
     Type.Literal('manual'),
   ]);

   const AutonomySchema = Type.Object({
     chart: AutonomyTier,
     order: AutonomyTier,
     charge: AutonomyTier,
     perform: AutonomyTier,
   });
   ```

   **Hardening Flags (CANS-05):**
   ```typescript
   const HardeningSchema = Type.Object({
     tool_policy_lockdown: Type.Boolean(),
     exec_approval: Type.Boolean(),
     cans_protocol_injection: Type.Boolean(),
     docker_sandbox: Type.Boolean(),
     safety_guard: Type.Boolean(),
     audit_trail: Type.Boolean(),
   });
   ```

   **Consent Configuration (CANS-05):**
   ```typescript
   const ConsentSchema = Type.Object({
     hipaa_warning_acknowledged: Type.Boolean(),
     synthetic_data_only: Type.Boolean(),
     audit_consent: Type.Boolean(),
   });
   ```

   **Clinical Voice (optional, for onboarding phase):**
   ```typescript
   const ClinicalVoiceSchema = Type.Optional(Type.Object({
     tone: Type.Optional(Type.String()),
     documentation_style: Type.Optional(Type.String()),
     eponyms: Type.Optional(Type.Boolean()),
     abbreviations: Type.Optional(Type.String()),
   }));
   ```

   **Complete CANS Schema:**
   ```typescript
   export const CANSSchema = Type.Object({
     version: Type.String({ description: 'CANS.md schema version' }),
     provider: ProviderSchema,
     scope: ScopeSchema,
     autonomy: AutonomySchema,
     hardening: HardeningSchema,
     consent: ConsentSchema,
     clinical_voice: ClinicalVoiceSchema,
   });

   export type CANSDocument = Static<typeof CANSSchema>;
   ```

   Also export sub-schemas for use by other components:
   ```typescript
   export {
     ProviderSchema, ProviderLicenseSchema,
     ScopeSchema, AutonomySchema, AutonomyTier,
     HardeningSchema, ConsentSchema, ClinicalVoiceSchema,
   };
   ```

   Note: `scope`, `hardening`, and `consent` are REQUIRED fields (not Optional). A CANS.md without these sections is incomplete and must fail validation. `clinical_voice` is Optional because it is populated during onboarding (Phase 2) and may not exist in manually created CANS.md files.

2. Create `src/types/cans.ts`:
   ```typescript
   export type { CANSDocument } from '../activation/cans-schema.js';
   export { CANSSchema } from '../activation/cans-schema.js';
   ```

3. Update `src/types/index.ts` to also export CANS types:
   ```typescript
   export * from './cans.js';
   ```

4. Create `test/unit/activation/cans-schema.test.ts`:

   Import `Value` from `@sinclair/typebox/value` and `CANSSchema` from the module.

   Test cases:
   - Valid complete CANS data passes `Value.Check(CANSSchema, data)` — use a fixture with all required fields filled
   - Missing `provider.name` fails validation
   - Invalid `provider.license.type` (e.g., "RN" which is not in the union) fails validation
   - Invalid `provider.license.state` (e.g., "California" — too long) fails validation
   - Missing `autonomy.chart` fails validation
   - Invalid autonomy tier (e.g., "auto" instead of "autonomous") fails validation
   - Missing `scope.permitted_actions` fails validation
   - `Value.Errors(CANSSchema, invalidData)` returns error objects with `path` and `message` properties — verify error messages are useful
   - Optional `clinical_voice` can be omitted
   - Optional `provider.npi` can be omitted
   - Invalid NPI format (e.g., "123" — not 10 digits) fails validation

5. Create `test/fixtures/valid-cans-data.ts` exporting a valid CANS frontmatter object for reuse across tests:
   ```typescript
   export const validCANSData = {
     version: '1.0',
     provider: {
       name: 'Dr. Test Provider',
       npi: '1234567890',
       license: { type: 'MD', state: 'TX', number: 'A12345', verified: false },
       specialty: 'Neurosurgery',
       subspecialty: 'Spine',
       institution: 'University Medical Center',
       privileges: ['neurosurgical procedures', 'spine surgery'],
       credential_status: 'active',
     },
     scope: {
       permitted_actions: ['chart_operative_note', 'chart_progress_note', 'chart_h_and_p'],
       prohibited_actions: ['prescribe_controlled_substances'],
       institutional_limitations: ['no_pediatric_cases'],
     },
     autonomy: {
       chart: 'autonomous',
       order: 'supervised',
       charge: 'supervised',
       perform: 'manual',
     },
     hardening: {
       tool_policy_lockdown: true,
       exec_approval: true,
       cans_protocol_injection: true,
       docker_sandbox: false,
       safety_guard: true,
       audit_trail: true,
     },
     consent: {
       hipaa_warning_acknowledged: true,
       synthetic_data_only: true,
       audit_consent: true,
     },
   };
   ```

**Verify:**
```bash
pnpm build && pnpm test
```

**Done:** CANS schema validates all required fields. TypeBox errors provide path and message for debugging. Provider identity, scope, autonomy tiers, hardening flags, and consent config all have typed schemas. Valid fixture data passes; invalid data fails with descriptive errors.

---

## Plan 03: CANS Parser, Activation Gate, and Integrity Check

```yaml
phase: 01-foundation
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/vendor/yaml/index.ts
  - src/activation/cans-parser.ts
  - src/activation/cans-integrity.ts
  - src/activation/gate.ts
  - test/fixtures/valid-cans.md
  - test/fixtures/malformed-cans.md
  - test/fixtures/tampered-cans.md
autonomous: true
requirements: [CANS-01, CANS-06, CANS-07]

must_haves:
  truths:
    - "CANS.md presence in workspace activates clinical mode; absence returns null"
    - "Malformed CANS.md is rejected with clear error messages explaining what is wrong"
    - "CANS.md integrity is checked via SHA-256 hash on every load"
    - "First load stores hash as known-good; subsequent loads compare against it"
    - "Tampered CANS.md (hash mismatch) triggers warning and returns null"
  artifacts:
    - path: "src/vendor/yaml/index.ts"
      provides: "Vendored YAML parser (zero npm dep)"
    - path: "src/activation/cans-parser.ts"
      provides: "Frontmatter extraction and YAML parsing"
      exports: ["parseFrontmatter"]
    - path: "src/activation/cans-integrity.ts"
      provides: "SHA-256 integrity checking for CANS.md"
      exports: ["computeHash", "verifyIntegrity", "updateKnownGoodHash"]
    - path: "src/activation/gate.ts"
      provides: "Binary activation gate: CANS.md present+valid+intact = active, else null"
      exports: ["ActivationGate"]
  key_links:
    - from: "src/activation/gate.ts"
      to: "src/activation/cans-parser.ts"
      via: "parseFrontmatter call"
      pattern: "parseFrontmatter"
    - from: "src/activation/gate.ts"
      to: "src/activation/cans-schema.ts"
      via: "Value.Check(CANSSchema)"
      pattern: "Value\\.Check.*CANSSchema"
    - from: "src/activation/gate.ts"
      to: "src/activation/cans-integrity.ts"
      via: "verifyIntegrity call"
      pattern: "verifyIntegrity"
    - from: "src/activation/cans-parser.ts"
      to: "src/vendor/yaml/index.ts"
      via: "YAML parse import"
      pattern: "vendor/yaml"
```

### Objective

Build the complete activation subsystem: vendor a YAML parser, create the frontmatter parser, implement SHA-256 integrity checking, and wire the ActivationGate class that performs the four-step check (presence, parse, validate, integrity).

Purpose: This is the binary gate that determines if clinical mode is active. It must be rock-solid — malformed or tampered CANS.md files must never activate.
Output: `ActivationGate.check()` returns a typed `CANSDocument` or null.

### Context

```
@.planning/phase-1/RESEARCH.md (Pattern 2: Binary Activation Gate, Pattern 5: Frontmatter Extraction, YAML Parsing Decision)
@.planning/research/PITFALLS.md (Pitfall 2: YAML Implicit Type Coercion, Pitfall 9: CANS.md Brittleness)
@src/activation/cans-schema.ts (from Plan 02)
@src/adapter/types.ts (from Plan 02)
```

### Tasks

#### Task 1: Vendor YAML parser and create frontmatter parser

**Type:** auto
**Files:**
- `src/vendor/yaml/index.ts`
- `src/activation/cans-parser.ts`

**Action:**

1. Vendor the `yaml` npm package for CANS.md parsing. This is needed because Node.js has no built-in YAML parser and we have a zero-runtime-dep constraint.

   Run: `pnpm add -D yaml@^2.8.0`

   Create `src/vendor/yaml/index.ts` that re-exports the parse function from the `yaml` package. This is NOT copying source files — tsdown will bundle the import into the output at build time, making it part of CareAgent's own code. The `yaml` package has zero dependencies itself (ISC license).

   ```typescript
   // Vendored YAML parser — bundled by tsdown into dist output.
   // The yaml package (ISC license) is zero-dependency.
   // This exists so YAML parsing is centralized and replaceable.
   export { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
   ```

   Add `yaml` to `tsdown.config.ts` as a NON-external dependency (remove it from `external` if present, or explicitly ensure it is NOT in the external list). This ensures tsdown bundles it into the output. Update the external list to only be: `external: ['openclaw', 'openclaw/*']`.

   IMPORTANT: The `yaml` package defaults to YAML 1.2, which avoids the Norway problem (YAML 1.1 parses `NO` as `false`). Do NOT configure it for YAML 1.1.

2. Create `src/activation/cans-parser.ts`:

   ```typescript
   import { parseYAML } from '../vendor/yaml/index.js';

   export interface ParsedFrontmatter {
     frontmatter: Record<string, unknown> | null;
     body: string;
     error?: string;
   }

   export function parseFrontmatter(content: string): ParsedFrontmatter {
     const trimmed = content.trimStart();

     // Check for opening delimiter
     if (!trimmed.startsWith('---')) {
       return { frontmatter: null, body: content, error: 'No YAML frontmatter found (missing opening ---)' };
     }

     // Find closing delimiter — must be on its own line
     const endIndex = trimmed.indexOf('\n---', 3);
     if (endIndex === -1) {
       return { frontmatter: null, body: content, error: 'No closing --- delimiter found for YAML frontmatter' };
     }

     const yamlBlock = trimmed.slice(3, endIndex).trim();
     const body = trimmed.slice(endIndex + 4).trim();

     if (!yamlBlock) {
       return { frontmatter: null, body, error: 'YAML frontmatter block is empty' };
     }

     try {
       const parsed = parseYAML(yamlBlock);
       if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
         return { frontmatter: null, body, error: 'YAML frontmatter must be an object (not array or scalar)' };
       }
       return { frontmatter: parsed as Record<string, unknown>, body };
     } catch (e: unknown) {
       const message = e instanceof Error ? e.message : String(e);
       return { frontmatter: null, body: content, error: `YAML parse error: ${message}` };
     }
   }
   ```

3. Create `test/unit/activation/cans-parser.test.ts`:

   Test cases:
   - Valid frontmatter with `---` delimiters returns parsed object and body
   - Content without `---` returns `frontmatter: null` with "missing opening" error
   - Content with opening `---` but no closing returns `frontmatter: null` with "no closing" error
   - Empty frontmatter block returns `frontmatter: null` with "empty" error
   - Invalid YAML (e.g., `{{{`) returns `frontmatter: null` with "YAML parse error" message
   - YAML array (e.g., `- item1\n- item2`) returns `frontmatter: null` (must be object)
   - Body text after frontmatter is correctly extracted
   - YAML 1.2 behavior: `NO` remains a string, not converted to `false`

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/activation/cans-parser.test.ts
```

**Done:** Frontmatter parser extracts YAML from `---` delimited blocks, handles all error cases with descriptive messages, and uses YAML 1.2 to avoid implicit type coercion.

---

#### Task 2: Integrity checking and activation gate

**Type:** auto
**Files:**
- `src/activation/cans-integrity.ts`
- `src/activation/gate.ts`
- `test/fixtures/valid-cans.md`
- `test/fixtures/malformed-cans.md`
- `test/fixtures/tampered-cans.md`
- `test/unit/activation/cans-integrity.test.ts`
- `test/unit/activation/gate.test.ts`

**Action:**

1. Create `src/activation/cans-integrity.ts`:

   Use Node.js `node:crypto` and `node:fs` built-ins (zero dependencies).

   ```typescript
   import { createHash } from 'node:crypto';
   import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
   import { join, dirname } from 'node:path';

   const CAREAGENT_DIR = '.careagent';
   const INTEGRITY_FILE = 'cans-integrity.json';

   export function computeHash(content: string): string {
     return createHash('sha256').update(content, 'utf-8').digest('hex');
   }

   export function getIntegrityStorePath(workspacePath: string): string {
     return join(workspacePath, CAREAGENT_DIR, INTEGRITY_FILE);
   }

   export function verifyIntegrity(
     workspacePath: string,
     content: string,
   ): { valid: boolean; reason?: string; isFirstLoad?: boolean } {
     const storePath = getIntegrityStorePath(workspacePath);
     const currentHash = computeHash(content);

     if (!existsSync(storePath)) {
       // First load — store hash as known-good, trust it
       const storeDir = dirname(storePath);
       mkdirSync(storeDir, { recursive: true });
       writeFileSync(storePath, JSON.stringify({
         hash: currentHash,
         timestamp: new Date().toISOString(),
       }));
       return { valid: true, isFirstLoad: true };
     }

     try {
       const stored = JSON.parse(readFileSync(storePath, 'utf-8'));
       if (stored.hash === currentHash) {
         return { valid: true };
       }
       return {
         valid: false,
         reason: `SHA-256 hash mismatch — CANS.md may have been tampered with. Expected ${stored.hash.slice(0, 12)}..., got ${currentHash.slice(0, 12)}...`,
       };
     } catch (e: unknown) {
       const message = e instanceof Error ? e.message : String(e);
       return { valid: false, reason: `Integrity store corrupted: ${message}` };
     }
   }

   export function updateKnownGoodHash(workspacePath: string, content: string): void {
     const storePath = getIntegrityStorePath(workspacePath);
     const storeDir = dirname(storePath);
     mkdirSync(storeDir, { recursive: true });
     writeFileSync(storePath, JSON.stringify({
       hash: computeHash(content),
       timestamp: new Date().toISOString(),
     }));
   }
   ```

2. Create `src/activation/gate.ts`:

   The `ActivationGate` is the core class. It performs the four-step check:
   1. Presence — does CANS.md exist?
   2. Parse — does it have valid YAML frontmatter?
   3. Validate — does the frontmatter match the TypeBox schema?
   4. Integrity — does the SHA-256 hash match the known-good state?

   ```typescript
   import { existsSync, readFileSync } from 'node:fs';
   import { join } from 'node:path';
   import { Value } from '@sinclair/typebox/value';
   import { CANSSchema, type CANSDocument } from './cans-schema.js';
   import { parseFrontmatter } from './cans-parser.js';
   import { verifyIntegrity } from './cans-integrity.js';

   export interface ActivationResult {
     active: boolean;
     document: CANSDocument | null;
     reason?: string;
     errors?: Array<{ path: string; message: string }>;
   }

   export type AuditCallback = (entry: Record<string, unknown>) => void;

   export class ActivationGate {
     private workspacePath: string;
     private auditLog: AuditCallback;

     constructor(workspacePath: string, auditLog: AuditCallback) {
       this.workspacePath = workspacePath;
       this.auditLog = auditLog;
     }

     check(): ActivationResult {
       const cansPath = join(this.workspacePath, 'CANS.md');

       // Step 1: Presence
       if (!existsSync(cansPath)) {
         return { active: false, document: null, reason: 'CANS.md not found in workspace' };
       }

       // Step 2: Parse
       const raw = readFileSync(cansPath, 'utf-8');
       const { frontmatter, error: parseError } = parseFrontmatter(raw);

       if (!frontmatter) {
         this.auditLog({
           action: 'cans_parse_error',
           actor: 'system',
           outcome: 'error',
           details: { reason: parseError || 'Failed to parse CANS.md frontmatter' },
         });
         return {
           active: false,
           document: null,
           reason: parseError || 'Failed to parse CANS.md frontmatter',
         };
       }

       // Step 3: Validate against TypeBox schema
       if (!Value.Check(CANSSchema, frontmatter)) {
         const errors = [...Value.Errors(CANSSchema, frontmatter)]
           .map(e => ({ path: e.path, message: e.message }));
         const formatted = errors.map(e => `  ${e.path}: ${e.message}`).join('\n');

         this.auditLog({
           action: 'cans_validation_error',
           actor: 'system',
           outcome: 'error',
           details: { errors },
         });

         return {
           active: false,
           document: null,
           reason: `CANS.md validation failed:\n${formatted}`,
           errors,
         };
       }

       // Step 4: Integrity check
       const integrity = verifyIntegrity(this.workspacePath, raw);
       if (!integrity.valid) {
         this.auditLog({
           action: 'cans_integrity_failure',
           actor: 'system',
           outcome: 'error',
           details: { reason: integrity.reason },
         });
         return {
           active: false,
           document: null,
           reason: integrity.reason || 'CANS.md integrity check failed',
         };
       }

       // All checks passed — clinical mode active
       const document = frontmatter as unknown as CANSDocument;
       return { active: true, document };
     }
   }
   ```

3. Create test fixture files:

   `test/fixtures/valid-cans.md`:
   A complete, valid CANS.md file with YAML frontmatter using the data from `test/fixtures/valid-cans-data.ts` (from Plan 02). Include a markdown body section with "# Care Agent Nervous System" heading.

   `test/fixtures/malformed-cans.md`:
   A CANS.md file where the `provider.license.type` is set to `"RN"` (not in the union) and `autonomy.chart` is set to `"auto"` (not a valid tier). This should fail TypeBox validation with clear errors.

   `test/fixtures/tampered-cans.md`:
   Same content as `valid-cans.md` but used with a pre-stored hash that does NOT match, simulating tampering.

4. Create `test/unit/activation/cans-integrity.test.ts`:

   Use a temporary directory (Vitest `vi.fn()` is not needed — use actual temp dirs with `mkdtempSync`).

   Test cases:
   - `computeHash` returns consistent SHA-256 hex string for the same input
   - `computeHash` returns different hashes for different inputs
   - `verifyIntegrity` on first load stores hash and returns `{ valid: true, isFirstLoad: true }`
   - `verifyIntegrity` on second load with same content returns `{ valid: true }`
   - `verifyIntegrity` on second load with different content returns `{ valid: false }` with reason
   - `updateKnownGoodHash` updates the stored hash so subsequent verification passes
   - Corrupted integrity store file returns `{ valid: false }` with "corrupted" reason

5. Create `test/unit/activation/gate.test.ts`:

   Use a temporary directory with controlled CANS.md placement.

   Test cases:
   - No CANS.md in workspace: `check()` returns `{ active: false, reason: 'CANS.md not found' }`
   - Valid CANS.md: `check()` returns `{ active: true, document: {...} }` with correct provider data
   - CANS.md without frontmatter (just markdown): `check()` returns `{ active: false }` with parse error
   - CANS.md with invalid schema: `check()` returns `{ active: false, errors: [...] }` with validation errors listing paths
   - CANS.md with tampered content after first load: `check()` returns `{ active: false }` with integrity reason
   - Audit callback is called with appropriate entries for each failure mode
   - Valid CANS.md returns a document with all typed fields accessible

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/activation/
```

**Done:** ActivationGate performs four-step check (presence, parse, validate, integrity). Missing CANS.md silently returns null. Malformed CANS.md is rejected with descriptive TypeBox errors. Tampered CANS.md triggers integrity warning. All audit callbacks fire correctly.

---

## Plan 04: Audit Entry Schema, Writer, and Pipeline

```yaml
phase: 01-foundation
plan: 04
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/audit/entry-schema.ts
  - src/audit/writer.ts
  - src/audit/pipeline.ts
autonomous: true
requirements: [AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05]

must_haves:
  truths:
    - "Every audit entry has timestamp, action, actor, target, outcome, session_id, trace_id"
    - "Blocked actions include blocked_reason and blocking_layer fields"
    - "Action states are distinguished: ai-proposed, provider-approved, provider-modified, provider-rejected, system-blocked"
    - "Each entry includes prev_hash (SHA-256 of previous entry JSON) for tamper evidence"
    - "Genesis entry has prev_hash: null"
    - "AUDIT.log is append-only JSONL — entries are never modified or deleted"
    - "Hash chain is verifiable: modifying any entry breaks the chain at that point"
  artifacts:
    - path: "src/audit/entry-schema.ts"
      provides: "TypeBox schema for audit log entries"
      exports: ["AuditEntrySchema", "AuditEntry", "ActionState"]
    - path: "src/audit/writer.ts"
      provides: "Hash-chained, append-only JSONL writer"
      exports: ["AuditWriter"]
    - path: "src/audit/pipeline.ts"
      provides: "High-level audit pipeline with session/trace management"
      exports: ["AuditPipeline"]
  key_links:
    - from: "src/audit/writer.ts"
      to: "node:crypto"
      via: "createHash for hash chaining"
      pattern: "createHash.*sha256"
    - from: "src/audit/writer.ts"
      to: "node:fs"
      via: "appendFileSync for append-only writes"
      pattern: "appendFileSync"
    - from: "src/audit/pipeline.ts"
      to: "src/audit/writer.ts"
      via: "AuditWriter instance"
      pattern: "AuditWriter"
    - from: "src/audit/pipeline.ts"
      to: "src/audit/entry-schema.ts"
      via: "AuditEntry type for type safety"
      pattern: "AuditEntry"
```

### Objective

Build the complete audit subsystem: TypeBox schema for audit entries, a hash-chained append-only JSONL writer, and the AuditPipeline class that provides the high-level logging API with session and trace ID management.

Purpose: Every action in CareAgent must be auditable. The hash chain provides tamper evidence from the very first entry. This subsystem is used by every other component.
Output: `AuditPipeline` that can `log()`, `verifyChain()`, and report `stats()`.

### Context

```
@.planning/phase-1/RESEARCH.md (Pattern 3: Hash-Chained Append-Only JSONL, Audit Entry Schema example)
@.planning/research/ARCHITECTURE.md (Component 6: Audit Pipeline, Event Schema)
@.planning/research/PITFALLS.md (Pitfall 4: Audit Log Integrity, Pitfall 8: Performance Bottleneck)
@src/adapter/types.ts (from Plan 02 — CareAgentPluginAPI interface)
```

### Tasks

#### Task 1: Audit entry schema and writer

**Type:** auto
**Files:**
- `src/audit/entry-schema.ts`
- `src/audit/writer.ts`

**Action:**

1. Create `src/audit/entry-schema.ts`:

   Import `Type` and `Static` from `@sinclair/typebox`.

   ```typescript
   export const ActionState = Type.Union([
     Type.Literal('ai-proposed'),
     Type.Literal('provider-approved'),
     Type.Literal('provider-modified'),
     Type.Literal('provider-rejected'),
     Type.Literal('system-blocked'),
   ]);

   export const AuditEntrySchema = Type.Object({
     schema_version: Type.Literal('1'),
     timestamp: Type.String(),                          // ISO 8601
     session_id: Type.String(),
     trace_id: Type.String(),
     action: Type.String(),                              // What was attempted
     action_state: Type.Optional(ActionState),           // AUDT-03
     actor: Type.Union([
       Type.Literal('agent'),
       Type.Literal('provider'),
       Type.Literal('system'),
     ]),
     target: Type.Optional(Type.String()),                // Tool, skill, file
     outcome: Type.Union([
       Type.Literal('allowed'),
       Type.Literal('denied'),
       Type.Literal('escalated'),
       Type.Literal('error'),
       Type.Literal('active'),
       Type.Literal('inactive'),
     ]),
     details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
     blocked_reason: Type.Optional(Type.String()),        // AUDT-02
     blocking_layer: Type.Optional(Type.String()),        // AUDT-02
     prev_hash: Type.Union([Type.String(), Type.Null()]), // AUDT-04
   });

   export type AuditEntry = Static<typeof AuditEntrySchema>;
   export type ActionStateType = Static<typeof ActionState>;
   ```

2. Create `src/audit/writer.ts`:

   Use ONLY Node.js built-ins (`node:fs`, `node:crypto`). Zero dependencies.

   ```typescript
   import { appendFileSync, readFileSync, existsSync, openSync, closeSync, constants } from 'node:fs';
   import { createHash } from 'node:crypto';
   import type { AuditEntry } from './entry-schema.js';

   export class AuditWriter {
     private lastHash: string | null = null;
     private readonly logPath: string;
     private initialized = false;

     constructor(logPath: string) {
       this.logPath = logPath;
       this.lastHash = this.recoverLastHash();
       this.initialized = true;
     }

     append(entry: Omit<AuditEntry, 'prev_hash'>): void {
       const enriched: AuditEntry = {
         ...entry,
         prev_hash: this.lastHash,
       };

       const line = JSON.stringify(enriched);
       const currentHash = createHash('sha256').update(line).digest('hex');

       // Append-only write — O_APPEND | O_WRONLY | O_CREAT
       appendFileSync(this.logPath, line + '\n', { flag: 'a' });

       this.lastHash = currentHash;
     }

     verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
       if (!existsSync(this.logPath)) {
         return { valid: true, entries: 0 };
       }

       try {
         const content = readFileSync(this.logPath, 'utf-8').trimEnd();
         if (!content) return { valid: true, entries: 0 };

         const lines = content.split('\n');
         let expectedPrevHash: string | null = null;

         for (let i = 0; i < lines.length; i++) {
           if (!lines[i].trim()) continue; // skip empty lines

           let parsed: AuditEntry;
           try {
             parsed = JSON.parse(lines[i]);
           } catch {
             return {
               valid: false,
               entries: i,
               brokenAt: i,
               error: `Malformed JSON at line ${i + 1}`,
             };
           }

           if (parsed.prev_hash !== expectedPrevHash) {
             return {
               valid: false,
               entries: i,
               brokenAt: i,
               error: `Chain broken at entry ${i}: expected prev_hash ${expectedPrevHash}, got ${parsed.prev_hash}`,
             };
           }

           expectedPrevHash = createHash('sha256').update(lines[i]).digest('hex');
         }

         return { valid: true, entries: lines.filter(l => l.trim()).length };
       } catch (e: unknown) {
         const message = e instanceof Error ? e.message : String(e);
         return { valid: false, entries: 0, error: `Chain verification error: ${message}` };
       }
     }

     getLastHash(): string | null {
       return this.lastHash;
     }

     private recoverLastHash(): string | null {
       try {
         if (!existsSync(this.logPath)) return null;

         const content = readFileSync(this.logPath, 'utf-8').trimEnd();
         if (!content) return null;

         const lines = content.split('\n').filter(l => l.trim());
         const lastLine = lines[lines.length - 1];
         if (!lastLine) return null;

         return createHash('sha256').update(lastLine).digest('hex');
       } catch {
         return null; // File does not exist or is empty — genesis entry
       }
     }
   }
   ```

   IMPORTANT per Pitfall 4 from research: Hash chaining is implemented from the very first entry. The genesis entry has `prev_hash: null`. Every subsequent entry has `prev_hash` = SHA-256 of the previous entry's JSON string. This is not deferred.

   IMPORTANT per AUDT-05: Use `appendFileSync` with flag `'a'` to enforce append-only writes. The writer never reads back the file during normal operation (only during `verifyChain()` and `recoverLastHash()` at startup).

3. Create `test/unit/audit/writer.test.ts`:

   Use temp directories for each test.

   Test cases:
   - First entry has `prev_hash: null`
   - Second entry has `prev_hash` equal to SHA-256 of first entry's JSON
   - `verifyChain()` returns `{ valid: true }` after writing 5 entries
   - Manually modifying an entry in the middle breaks the chain: `verifyChain()` returns `{ valid: false, brokenAt: N }`
   - Deleting an entry from the middle breaks the chain
   - `recoverLastHash()` works after creating a new writer on an existing log
   - Empty log file: `verifyChain()` returns `{ valid: true, entries: 0 }`
   - Nonexistent log file: `verifyChain()` returns `{ valid: true, entries: 0 }`
   - Entry contains all expected fields (timestamp, action, actor, etc.)
   - Multiple sequential writes maintain chain integrity

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/audit/writer.test.ts
```

**Done:** AuditWriter produces hash-chained, append-only JSONL. Chain verification detects any modification or deletion. Genesis entry has null prev_hash. Chain continuity survives writer restart.

---

#### Task 2: Audit pipeline with session and trace management

**Type:** auto
**Files:**
- `src/audit/pipeline.ts`
- `test/unit/audit/pipeline.test.ts`

**Action:**

1. Create `src/audit/pipeline.ts`:

   The pipeline is the high-level API used by all other CareAgent components. It wraps the writer and adds:
   - Session ID management (one per OpenClaw session)
   - Trace ID generation (one per logical operation)
   - Timestamp enrichment (ISO 8601)
   - Schema version injection
   - Convenience methods for common audit patterns

   ```typescript
   import { randomUUID } from 'node:crypto';
   import { join } from 'node:path';
   import { AuditWriter } from './writer.js';
   import type { AuditEntry, ActionStateType } from './entry-schema.js';

   const AUDIT_DIR = '.careagent';
   const AUDIT_FILE = 'AUDIT.log';

   export interface AuditLogInput {
     action: string;
     actor?: 'agent' | 'provider' | 'system';
     target?: string;
     outcome: 'allowed' | 'denied' | 'escalated' | 'error' | 'active' | 'inactive';
     action_state?: ActionStateType;
     details?: Record<string, unknown>;
     blocked_reason?: string;
     blocking_layer?: string;
     trace_id?: string; // Override auto-generated trace_id for correlated events
   }

   export class AuditPipeline {
     private writer: AuditWriter;
     private sessionId: string;

     constructor(workspacePath: string, sessionId?: string) {
       const logPath = join(workspacePath, AUDIT_DIR, AUDIT_FILE);
       this.writer = new AuditWriter(logPath);
       this.sessionId = sessionId || randomUUID();
     }

     log(input: AuditLogInput): void {
       const entry: Omit<AuditEntry, 'prev_hash'> = {
         schema_version: '1',
         timestamp: new Date().toISOString(),
         session_id: this.sessionId,
         trace_id: input.trace_id || randomUUID(),
         action: input.action,
         actor: input.actor || 'system',
         outcome: input.outcome,
         ...(input.target !== undefined && { target: input.target }),
         ...(input.action_state !== undefined && { action_state: input.action_state }),
         ...(input.details !== undefined && { details: input.details }),
         ...(input.blocked_reason !== undefined && { blocked_reason: input.blocked_reason }),
         ...(input.blocking_layer !== undefined && { blocking_layer: input.blocking_layer }),
       };

       this.writer.append(entry);
     }

     /** Log a blocked action (AUDT-02) with full rationale */
     logBlocked(input: {
       action: string;
       target?: string;
       blocked_reason: string;
       blocking_layer: string;
       action_state?: ActionStateType;
       details?: Record<string, unknown>;
     }): void {
       this.log({
         action: input.action,
         actor: 'system',
         target: input.target,
         outcome: 'denied',
         action_state: input.action_state || 'system-blocked',
         blocked_reason: input.blocked_reason,
         blocking_layer: input.blocking_layer,
         details: input.details,
       });
     }

     /** Verify the integrity of the entire audit chain */
     verifyChain(): { valid: boolean; entries: number; brokenAt?: number; error?: string } {
       return this.writer.verifyChain();
     }

     /** Get the current session ID */
     getSessionId(): string {
       return this.sessionId;
     }

     /** Create a new trace ID for correlating related events */
     createTraceId(): string {
       return randomUUID();
     }
   }
   ```

2. Create `test/unit/audit/pipeline.test.ts`:

   Test cases:
   - `log()` writes an entry to AUDIT.log in the workspace `.careagent/` directory
   - Logged entry has all required fields: schema_version, timestamp, session_id, trace_id, action, actor, outcome, prev_hash
   - `logBlocked()` includes blocked_reason, blocking_layer, and action_state
   - `logBlocked()` sets outcome to 'denied' and action_state to 'system-blocked' by default
   - Multiple `log()` calls produce valid hash chain (verify with `verifyChain()`)
   - `verifyChain()` returns `{ valid: true }` after normal logging
   - Session ID is consistent across all entries in a pipeline instance
   - Trace ID can be overridden for correlated events
   - `createTraceId()` returns a valid UUID
   - Action states (AUDT-03): log entries with each of 'ai-proposed', 'provider-approved', 'provider-modified', 'provider-rejected', 'system-blocked' are all accepted
   - Audit file is created in `.careagent/AUDIT.log` relative to workspace path

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/audit/
```

**Done:** AuditPipeline provides a clean API for logging actions and blocked actions. Entries are enriched with timestamps, session IDs, and trace IDs. Hash chain is maintained. Blocked actions include full rationale. All five action states are supported.

---

## Plan 05: Plugin Registration Wiring and Audit Integrity Service

```yaml
phase: 01-foundation
plan: 05
type: execute
wave: 4
depends_on: [03, 04]
files_modified:
  - src/index.ts
  - src/audit/integrity-service.ts
autonomous: true
requirements: [PLUG-03, AUDT-06]

must_haves:
  truths:
    - "register(api) creates adapter, starts audit pipeline, checks activation gate, and conditionally activates clinical mode"
    - "When CANS.md is absent, register() returns early after logging 'inactive' to audit"
    - "When CANS.md is present and valid, register() logs 'active' with provider details"
    - "Audit integrity background service periodically verifies hash chain and reports anomalies"
    - "before_tool_call canary is registered to detect hook availability"
  artifacts:
    - path: "src/index.ts"
      provides: "Fully wired plugin entry point"
      exports: ["default"]
    - path: "src/audit/integrity-service.ts"
      provides: "Background service for periodic audit chain verification"
      exports: ["createAuditIntegrityService"]
  key_links:
    - from: "src/index.ts"
      to: "src/adapter/openclaw-adapter.ts"
      via: "createAdapter(api)"
      pattern: "createAdapter"
    - from: "src/index.ts"
      to: "src/activation/gate.ts"
      via: "new ActivationGate"
      pattern: "ActivationGate"
    - from: "src/index.ts"
      to: "src/audit/pipeline.ts"
      via: "new AuditPipeline"
      pattern: "AuditPipeline"
    - from: "src/index.ts"
      to: "src/audit/integrity-service.ts"
      via: "createAuditIntegrityService"
      pattern: "createAuditIntegrityService"
```

### Objective

Wire the plugin entry point (`register(api)`) to connect the adapter, activation gate, and audit pipeline. Implement the audit integrity background service that periodically verifies hash chain integrity and reports anomalies.

Purpose: This plan connects all the subsystems built in Plans 02-04 into a working plugin. It also completes the audit subsystem with the background monitoring service.
Output: A `register()` function that performs full plugin initialization, and a background service that monitors audit log integrity.

### Context

```
@.planning/phase-1/RESEARCH.md (Plugin Entry Point example, Pattern 1: Adapter Layer)
@.planning/research/ARCHITECTURE.md (Data Flow Path 1: Activation)
@src/adapter/openclaw-adapter.ts (from Plan 02)
@src/activation/gate.ts (from Plan 03)
@src/audit/pipeline.ts (from Plan 04)
```

### Tasks

#### Task 1: Wire the register() entry point

**Type:** auto
**Files:**
- `src/index.ts`

**Action:**

Rewrite `src/index.ts` to wire all subsystems:

```typescript
/**
 * @careagent/core — Clinical activation layer for OpenClaw
 *
 * Entry point. OpenClaw calls this with the plugin API on startup.
 * Performs: adapter creation -> audit start -> activation check -> clinical wiring.
 */
import { createAdapter } from './adapter/openclaw-adapter.js';
import { ActivationGate } from './activation/gate.js';
import { AuditPipeline } from './audit/pipeline.js';
import { createAuditIntegrityService } from './audit/integrity-service.js';

export default function register(api: unknown): void {
  // Step 1: Create adapter (insulates from OpenClaw internals)
  const adapter = createAdapter(api);
  const workspacePath = adapter.getWorkspacePath();

  // Step 2: Start audit pipeline (always active, even when clinical mode is off)
  const audit = new AuditPipeline(workspacePath);

  // Step 3: Register CLI commands (always available — needed for `careagent init` before CANS.md exists)
  adapter.registerCliCommand({
    name: 'careagent',
    description: 'CareAgent clinical activation commands',
    handler: () => {
      // Phase 2 will implement full CLI (init, status)
      console.log('[CareAgent] CLI not yet implemented. Coming in Phase 2.');
    },
  });

  // Step 4: Check activation gate
  const gate = new ActivationGate(workspacePath, (entry) => audit.log({
    action: entry.action as string,
    actor: 'system',
    outcome: (entry.outcome as 'error') || 'error',
    details: entry.details as Record<string, unknown> | undefined,
  }));

  const result = gate.check();

  if (!result.active || !result.document) {
    audit.log({
      action: 'activation_check',
      actor: 'system',
      outcome: 'inactive',
      details: { reason: result.reason || 'No valid CANS.md' },
    });
    adapter.log('info', `[CareAgent] Clinical mode inactive: ${result.reason || 'No CANS.md found'}`);
    return; // Plugin is inert without valid CANS.md
  }

  // Step 5: Clinical mode active
  const cans = result.document;
  audit.log({
    action: 'activation_check',
    actor: 'system',
    outcome: 'active',
    details: {
      provider: cans.provider.name,
      specialty: cans.provider.specialty,
      institution: cans.provider.institution,
      autonomy: cans.autonomy,
    },
  });
  adapter.log('info', `[CareAgent] Clinical mode ACTIVE for ${cans.provider.name} (${cans.provider.specialty})`);

  // Step 6: Register before_tool_call canary (verify hook fires)
  let hookCanaryFired = false;
  adapter.onBeforeToolCall(() => {
    if (!hookCanaryFired) {
      hookCanaryFired = true;
      audit.log({
        action: 'hook_canary',
        actor: 'system',
        outcome: 'allowed',
        details: { hook: 'before_tool_call', status: 'verified' },
      });
    }
    return { block: false }; // Phase 1: observe only, don't block anything
  });

  // Step 7: Register audit integrity background service (AUDT-06)
  const integrityService = createAuditIntegrityService(audit, adapter);
  adapter.registerBackgroundService(integrityService);

  // Step 8: Log canary status after delay
  setTimeout(() => {
    if (!hookCanaryFired) {
      adapter.log('warn', '[CareAgent] before_tool_call hook did NOT fire. Safety Guard will be degraded.');
      audit.log({
        action: 'hook_canary',
        actor: 'system',
        outcome: 'error',
        details: { hook: 'before_tool_call', status: 'not_fired', message: 'Safety Guard Layer 5 will be degraded in Phase 3' },
      });
    }
  }, 30_000);
}
```

IMPORTANT: The audit pipeline starts BEFORE the activation check. This ensures that even activation failures are logged. The CLI command registers unconditionally (needed for `careagent init` in Phase 2 before CANS.md exists).

Update `test/smoke.test.ts` to verify the updated register function still works with a mock API.

**Verify:**
```bash
pnpm build && pnpm test
```

**Done:** `register(api)` wires adapter, audit pipeline, activation gate, CLI stub, canary hook, and integrity service. Inactive mode returns early with audit log entry. Active mode logs provider details and registers background services.

---

#### Task 2: Audit integrity background service

**Type:** auto
**Files:**
- `src/audit/integrity-service.ts`
- `test/unit/audit/integrity-service.test.ts`

**Action:**

1. Create `src/audit/integrity-service.ts`:

   This is a background service that periodically verifies the audit chain integrity and reports anomalies. It implements the `ServiceConfig` interface from the adapter types.

   ```typescript
   import type { ServiceConfig } from '../adapter/types.js';
   import type { AuditPipeline } from './pipeline.js';

   interface AdapterLog {
     log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
   }

   const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

   export function createAuditIntegrityService(
     audit: AuditPipeline,
     adapter: AdapterLog,
   ): ServiceConfig {
     let intervalId: ReturnType<typeof setInterval> | null = null;

     return {
       id: 'careagent-audit-integrity',

       start: () => {
         adapter.log('info', '[CareAgent] Audit integrity service started');

         // Initial check on startup
         const initialResult = audit.verifyChain();
         if (!initialResult.valid) {
           adapter.log('error', `[CareAgent] Audit chain integrity failure on startup: ${initialResult.error}`);
           audit.log({
             action: 'audit_integrity_check',
             actor: 'system',
             outcome: 'error',
             details: {
               phase: 'startup',
               ...initialResult,
             },
           });
         }

         // Periodic checks
         intervalId = setInterval(() => {
           const result = audit.verifyChain();
           if (!result.valid) {
             adapter.log('error', `[CareAgent] Audit chain integrity failure: ${result.error}`);
             audit.log({
               action: 'audit_integrity_check',
               actor: 'system',
               outcome: 'error',
               details: result,
             });
           }
         }, CHECK_INTERVAL_MS);
       },

       stop: () => {
         if (intervalId !== null) {
           clearInterval(intervalId);
           intervalId = null;
         }
         adapter.log('info', '[CareAgent] Audit integrity service stopped');
       },
     };
   }
   ```

2. Create `test/unit/audit/integrity-service.test.ts`:

   Test cases:
   - `createAuditIntegrityService` returns a ServiceConfig with id, start, stop
   - `start()` runs initial integrity check (verify by checking that adapter.log was called)
   - `start()` detects a broken chain on startup and logs error
   - `stop()` clears the interval (no more checks after stop)
   - Service uses the correct service ID 'careagent-audit-integrity'

   Use Vitest's `vi.useFakeTimers()` to test periodic behavior without waiting 60 seconds.

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/audit/integrity-service.test.ts
```

**Done:** Audit integrity service runs periodic hash chain verification. Reports anomalies via adapter log and audit entries. Can be started and stopped cleanly. Detects broken chains on both startup and periodic checks.

---

## Plan 06: Comprehensive Test Suite and Phase Verification

```yaml
phase: 01-foundation
plan: 06
type: execute
wave: 5
depends_on: [05]
files_modified:
  - test/integration/activation.test.ts
  - test/integration/audit.test.ts
  - test/integration/plugin.test.ts
autonomous: true
requirements: [PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, CANS-01, CANS-02, CANS-03, CANS-04, CANS-05, CANS-06, CANS-07, AUDT-01, AUDT-02, AUDT-03, AUDT-04, AUDT-05, AUDT-06]

must_haves:
  truths:
    - "Integration tests verify the full activation flow: no CANS.md -> inactive, valid CANS.md -> active, malformed -> rejected"
    - "Integration tests verify hash chain integrity across multiple log entries"
    - "Integration tests verify blocked actions include rationale"
    - "Integration tests verify all five action states are logged correctly"
    - "Integration tests verify SHA-256 integrity detects tampered CANS.md"
    - "All tests pass and coverage meets 80% threshold"
  artifacts:
    - path: "test/integration/activation.test.ts"
      provides: "End-to-end activation gate tests"
    - path: "test/integration/audit.test.ts"
      provides: "End-to-end audit pipeline tests"
    - path: "test/integration/plugin.test.ts"
      provides: "Full plugin registration integration test"
  key_links:
    - from: "test/integration/plugin.test.ts"
      to: "src/index.ts"
      via: "imports register function"
      pattern: "import.*register.*from.*src/index"
    - from: "test/integration/activation.test.ts"
      to: "src/activation/gate.ts"
      via: "ActivationGate with real files"
      pattern: "ActivationGate"
    - from: "test/integration/audit.test.ts"
      to: "src/audit/pipeline.ts"
      via: "AuditPipeline with real file I/O"
      pattern: "AuditPipeline"
```

### Objective

Create comprehensive integration tests that verify all 18 Phase 1 requirements work together, then run the full test suite with coverage to verify the 80% threshold is met.

Purpose: This plan proves Phase 1 is complete by testing requirements end-to-end, not just unit-by-unit.
Output: Passing test suite with 80%+ coverage, verification that all success criteria are met.

### Context

```
@.planning/ROADMAP.md (Phase 1 Success Criteria)
@.planning/REQUIREMENTS.md (PLUG-01 through AUDT-06)
@src/index.ts (from Plan 05)
@src/activation/gate.ts (from Plan 03)
@src/audit/pipeline.ts (from Plan 04)
@test/fixtures/valid-cans-data.ts (from Plan 02)
```

### Tasks

#### Task 1: Integration tests for activation and audit

**Type:** auto
**Files:**
- `test/integration/activation.test.ts`
- `test/integration/audit.test.ts`

**Action:**

1. Create `test/integration/activation.test.ts`:

   Full end-to-end tests using temporary workspaces with real files.

   **Test group: "Activation Gate — CANS-01: Presence-based activation"**
   - Empty workspace (no CANS.md): gate returns `{ active: false }`
   - Workspace with valid CANS.md: gate returns `{ active: true, document: {...} }`
   - Remove CANS.md and re-check: gate returns `{ active: false }`

   **Test group: "Activation Gate — CANS-06: Schema validation"**
   - Valid CANS.md: passes validation, document has all typed fields
   - CANS.md with missing required field (e.g., no `provider.license`): rejected with error listing path `/provider/license`
   - CANS.md with wrong type (e.g., `autonomy.chart: "auto"`): rejected with error listing path `/autonomy/chart`
   - CANS.md with empty frontmatter: rejected with parse error
   - CANS.md without `---` delimiters: rejected with "missing opening ---" error

   **Test group: "Activation Gate — CANS-02 through CANS-05: Schema fields"**
   - Verify returned document has `provider.name`, `provider.npi`, `provider.license.type`, `provider.license.state`, `provider.license.number` (CANS-02)
   - Verify returned document has `scope.permitted_actions`, `scope.prohibited_actions` (CANS-03)
   - Verify returned document has `autonomy.chart`, `autonomy.order`, `autonomy.charge`, `autonomy.perform` each as one of 'autonomous'|'supervised'|'manual' (CANS-04)
   - Verify returned document has `hardening` flags and `consent` config (CANS-05)

   **Test group: "Activation Gate — CANS-07: Integrity checking"**
   - First load: stores hash, returns valid
   - Second load (same content): hash matches, returns valid
   - Second load (modified content): hash mismatch, returns `{ active: false }` with integrity reason
   - After `updateKnownGoodHash()`: new content validates correctly

   **Test group: "Audit callbacks"**
   - Each failure mode (parse error, validation error, integrity failure) triggers the audit callback with appropriate entry

2. Create `test/integration/audit.test.ts`:

   Full end-to-end tests using temporary workspaces with real files.

   **Test group: "Audit Pipeline — AUDT-01: Basic logging"**
   - Write 10 entries via `pipeline.log()`, read back AUDIT.log, verify each line is valid JSON with all required fields (timestamp, action, actor, outcome, session_id, trace_id)

   **Test group: "Audit Pipeline — AUDT-02: Blocked actions"**
   - Use `pipeline.logBlocked()` with reason and blocking_layer
   - Read back entry, verify `blocked_reason`, `blocking_layer`, and `outcome: 'denied'` are present

   **Test group: "Audit Pipeline — AUDT-03: Action states"**
   - Log entries with each of the 5 action states
   - Read back and verify each entry has the correct `action_state`

   **Test group: "Audit Pipeline — AUDT-04: Hash chaining"**
   - Write 20 entries
   - Verify `verifyChain()` returns `{ valid: true }`
   - Parse the JSONL, verify first entry has `prev_hash: null`
   - Verify each subsequent entry's `prev_hash` equals SHA-256 of previous entry's JSON string
   - Manually compute expected hashes and compare

   **Test group: "Audit Pipeline — AUDT-05: Append-only"**
   - Write entries, verify file only grows (check file size after each write)
   - Modify an entry in the middle of the file
   - `verifyChain()` returns `{ valid: false, brokenAt: N }`

**Verify:**
```bash
pnpm test -- --reporter=verbose test/integration/
```

**Done:** All activation and audit integration tests pass. Every requirement CANS-01 through CANS-07 and AUDT-01 through AUDT-05 has at least one integration test verifying it end-to-end.

---

#### Task 2: Plugin integration test and coverage verification

**Type:** auto
**Files:**
- `test/integration/plugin.test.ts`

**Action:**

1. Create `test/integration/plugin.test.ts`:

   Tests the full `register()` function with a mock OpenClaw API.

   **Mock API object:**
   Create a mock that tracks method calls:
   ```typescript
   function createMockAPI(workspacePath: string) {
     const calls: Array<{ method: string; args: unknown[] }> = [];
     return {
       workspaceDir: workspacePath,
       registerCli: (cb: Function, opts: unknown) => { calls.push({ method: 'registerCli', args: [opts] }); cb({ program: { command: () => ({ description: () => ({ action: () => {} }) }) } }); },
       registerService: (config: unknown) => { calls.push({ method: 'registerService', args: [config] }); },
       registerCommand: (config: unknown) => { calls.push({ method: 'registerCommand', args: [config] }); },
       on: (event: string, handler: Function) => { calls.push({ method: 'on', args: [event] }); },
       log: (level: string, msg: string) => { calls.push({ method: 'log', args: [level, msg] }); },
       calls,
     };
   }
   ```

   **Test group: "Plugin Registration — PLUG-03: register(api) wiring"**
   - With empty workspace: register completes without error, audit log contains 'inactive' entry
   - With valid CANS.md: register completes, audit log contains 'active' entry with provider name
   - With valid CANS.md: `registerCli` was called (CLI commands registered)
   - With valid CANS.md: `registerService` was called (background service registered)
   - With valid CANS.md: `on('before_tool_call', ...)` was called (canary registered)

   **Test group: "Plugin Registration — PLUG-04: Adapter insulation"**
   - register works with minimal mock (just `workspaceDir`)
   - register works with empty object `{}` (adapter falls back to process.cwd())
   - register does not throw when mock API is missing methods (graceful degradation)

   **Test group: "Plugin Registration — PLUG-05: Zero dependencies verification"**
   - Read `package.json`, verify `dependencies` is `{}`
   - Verify no `require()` calls to external packages in the built dist (read `dist/index.js`, check it does not import from anything other than node: built-ins)

   **Test group: "Plugin Registration — PLUG-01, PLUG-02: Manifest verification"**
   - Read `package.json`, verify `openclaw.extensions` points to `./dist/index.js`
   - Read `openclaw.plugin.json`, verify `id` is `@careagent/core`
   - Read `package.json`, verify `peerDependencies` includes `openclaw`

2. Run the full test suite with coverage:
   ```bash
   pnpm test:coverage
   ```
   Verify all tests pass and coverage meets 80% threshold.

3. If coverage is below 80% on any metric, add targeted unit tests for uncovered branches. Common areas that need coverage:
   - Error paths in adapter (when OpenClaw API throws)
   - Edge cases in frontmatter parser (unusual whitespace, BOM characters)
   - Writer behavior with concurrent access attempts

**Verify:**
```bash
pnpm test:coverage && echo "PASS: all tests with coverage" || echo "FAIL"
```

**Done:** All integration tests pass. Plugin registers correctly with mock API in both active and inactive modes. Zero-dependency constraint is verified. Package manifests are correct. Coverage meets 80% threshold.

---

## Phase Verification

Map each success criterion to specific tests:

| Success Criterion | Verified By |
|---|---|
| 1. Plugin installs, registers extension points, shows in plugin list | `test/integration/plugin.test.ts` — PLUG-01/02/03 tests verify manifest, register function, and extension point registration |
| 2. CANS.md present = clinical mode; absent = standard behavior | `test/integration/activation.test.ts` — CANS-01 group verifies presence-based activation |
| 3. Malformed CANS.md rejected with clear error, clinical mode does not activate | `test/integration/activation.test.ts` — CANS-06 group verifies rejection with descriptive errors |
| 4. Every action/blocked action recorded in AUDIT.log with hash chaining | `test/integration/audit.test.ts` — AUDT-01/02/03/04/05 groups verify full audit pipeline |
| 5. CANS.md integrity verified via SHA-256; tampered file triggers warning | `test/integration/activation.test.ts` — CANS-07 group verifies integrity checking |

### Build verification:
```bash
pnpm clean && pnpm build && pnpm test:coverage
```
All must pass before Phase 1 is considered complete.

---

## File Ownership Map

| File | Plan | Wave |
|------|------|------|
| `package.json` | 01 | 1 |
| `tsconfig.json` | 01 | 1 |
| `tsdown.config.ts` | 01 | 1 |
| `vitest.config.ts` | 01 | 1 |
| `openclaw.plugin.json` | 01 | 1 |
| `.gitignore` | 01 | 1 |
| `.npmrc` | 01 | 1 |
| `src/index.ts` | 01 (stub), 05 (full) | 1, 4 |
| `src/adapter/types.ts` | 02 | 2 |
| `src/adapter/openclaw-adapter.ts` | 02 | 2 |
| `src/types/index.ts` | 02 | 2 |
| `src/types/cans.ts` | 02 | 2 |
| `src/activation/cans-schema.ts` | 02 | 2 |
| `src/vendor/yaml/index.ts` | 03 | 3 |
| `src/activation/cans-parser.ts` | 03 | 3 |
| `src/activation/cans-integrity.ts` | 03 | 3 |
| `src/activation/gate.ts` | 03 | 3 |
| `src/audit/entry-schema.ts` | 04 | 3 |
| `src/audit/writer.ts` | 04 | 3 |
| `src/audit/pipeline.ts` | 04 | 3 |
| `src/audit/integrity-service.ts` | 05 | 4 |
| `test/fixtures/*` | 02, 03 | 2, 3 |
| `test/unit/adapter/*` | 02 | 2 |
| `test/unit/activation/*` | 02, 03 | 2, 3 |
| `test/unit/audit/*` | 04, 05 | 3, 4 |
| `test/integration/*` | 06 | 5 |

---
*Plan created: 2026-02-17*
