# Phase 1: Plugin Foundation, Clinical Activation, and Audit Pipeline - Research

**Researched:** 2026-02-17
**Domain:** OpenClaw plugin development, YAML frontmatter parsing, TypeBox schema validation, hash-chained audit logging
**Confidence:** MEDIUM-HIGH

## Summary

Phase 1 builds the skeleton that every subsequent phase attaches to: a working OpenClaw plugin that installs without errors, detects a CANS.md clinical activation file, validates its schema with TypeBox, and logs every action to a hash-chained, append-only JSONL audit trail. The three subsystems (Plugin Shell, Activation Gate, Audit Pipeline) have zero dependencies on each other beyond basic wiring, making them buildable in parallel once the project scaffold exists.

The OpenClaw plugin SDK provides four registration methods: `registerPluginHooksFromDir` for hooks, `api.registerCli` for CLI commands, `api.registerService` for background services, and `api.registerCommand` for slash commands. The plugin entry point exports a `register(api)` function (or default function), and the plugin is discovered via the `openclaw.extensions` field in `package.json`. All plugin configuration schemas must use TypeBox -- this is a hard platform requirement.

The primary technical challenge in Phase 1 is YAML frontmatter parsing under the zero-runtime-dependency constraint. Node.js has no built-in YAML parser. The recommended approach is to vendor a minimal YAML parser (the `yaml` npm package has zero dependencies itself and is ~50KB) or write a subset parser for the limited YAML features CANS.md actually uses (flat objects, arrays of strings, nested objects two levels deep). The second challenge is ensuring the `before_tool_call` hook actually fires -- PR #6570 merged it but the hook's availability depends on the VPS OpenClaw version.

**Primary recommendation:** Build three subsystems (plugin shell, activation gate, audit pipeline) as independent modules behind an adapter layer. Use TypeBox `Value.Check` + `Value.Errors` for CANS.md validation with clear error messages. Implement hash chaining in the audit log from entry one. Ship a canary test for `before_tool_call` hook liveness even though full hardening is Phase 3.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLUG-01 | Plugin installs into OpenClaw via `openclaw plugins install @careagent/core` without errors | Plugin manifest format (package.json `openclaw.extensions`), entry point pattern, peer dependency declaration |
| PLUG-02 | Plugin manifest declares plugin ID, configSchema, skills directories, CLI commands, hook registrations | `openclaw.plugin.json` format, TypeBox configSchema, registration API methods |
| PLUG-03 | Plugin `register(api)` entry point registers CLI commands, hooks, agent tools, and background services | `api.registerCli`, `registerPluginHooksFromDir`, `api.registerService`, `api.registerCommand` patterns |
| PLUG-04 | Adapter layer insulates CareAgent from OpenClaw internals | Ports-and-adapters pattern, narrow interface definition, adapter module structure |
| PLUG-05 | Plugin has zero runtime npm dependencies | Node.js built-in modules (fs, crypto, path), vendored YAML parser approach, TypeBox via OpenClaw peer dep |
| CANS-01 | CANS.md presence in workspace activates clinical layer; absence means standard behavior | Activation gate pattern, `fs.existsSync` check, early return in `register()` |
| CANS-02 | CANS.md schema defines provider identity | TypeBox schema for provider object (name, NPI, license, specialty, institution, credential status) |
| CANS-03 | CANS.md schema defines scope of practice | TypeBox schema for scope mapped to provider licensure and institutional privileges |
| CANS-04 | CANS.md schema defines autonomy tiers | TypeBox schema with `Type.Union([Type.Literal('autonomous'), ...])` for four atomic actions |
| CANS-05 | CANS.md schema defines hardening activation flags and consent config | TypeBox schema for hardening flags (boolean toggles per layer) and consent settings |
| CANS-06 | CANS.md validated against TypeBox schema at parse time; malformed files rejected with clear errors | `Value.Check` + `Value.Errors` pattern, error formatting with path and message |
| CANS-07 | CANS.md integrity checked on every load via SHA-256 hash comparison | `crypto.createHash('sha256')` built-in, hash storage location, comparison on load |
| AUDT-01 | AUDIT.log captures every agent action as append-only JSONL | Custom JSONL writer using `fs.appendFileSync`, TypeBox schema for audit entry |
| AUDT-02 | AUDIT.log captures every blocked action with rationale | Audit entry schema includes `blocked_reason`, `blocking_layer`, `attempted_action` fields |
| AUDT-03 | AUDIT.log distinguishes action states | `action_state` enum: AI-proposed, provider-approved, provider-modified, provider-rejected, system-blocked |
| AUDT-04 | AUDIT.log entries include hash chaining for tamper evidence | SHA-256 of previous entry's JSON, `prev_hash` field, genesis entry with null prev_hash |
| AUDT-05 | AUDIT.log entries can never be modified or deleted | Append-only file flag, `O_APPEND | O_WRONLY` open mode, OS-level `chattr +a` on Linux |
| AUDT-06 | Audit background service monitors log integrity and reports anomalies | `api.registerService` with periodic chain verification, gap detection, anomaly reporting |
</phase_requirements>

## Standard Stack

### Core (All from existing research -- locked decisions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >=22.12.0 | Runtime | OpenClaw hard requirement |
| TypeScript | ~5.7.x | Language | Match OpenClaw codebase |
| pnpm | >=9.x | Package manager | Match OpenClaw |
| tsdown | ~0.20.x | Bundle + DTS | OpenClaw migrated from tsup; tsup is deprecated upstream |
| Vitest | ~4.0.x | Testing | OpenClaw's test framework, native ESM/TS |
| @vitest/coverage-v8 | ~4.0.x | Coverage | OpenClaw uses V8 provider, not Istanbul |
| @sinclair/typebox | ~0.34.x | Schema validation | OpenClaw's schema library; MUST use TypeBox, not Zod |

### Phase 1-Specific

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node:crypto` | built-in | SHA-256 hashing | CANS.md integrity (CANS-07), audit hash chaining (AUDT-04), skill checksumming |
| Node.js `node:fs` | built-in | File I/O | CANS.md read, AUDIT.log append, file existence checks |
| Node.js `node:path` | built-in | Path resolution | Workspace path construction, cross-platform compatibility |

### YAML Parsing Decision (Claude's Discretion)

**The zero-dependency constraint creates a tension with YAML parsing.** Node.js has no built-in YAML parser. Three options exist:

| Option | Approach | Tradeoff | Recommendation |
|--------|----------|----------|----------------|
| **A: Vendor `yaml` npm source** | Copy the `yaml` package source (~50KB, zero deps, ISC license) into `src/vendor/yaml/` | Adds vendored code to maintain; but the `yaml` package is actively maintained, zero-dep, and ISC-licensed | **RECOMMENDED** |
| B: Write minimal YAML subset parser | Hand-roll parser for the limited YAML features CANS.md uses | Risky -- YAML has notorious edge cases (the Norway problem, implicit type coercion, multiline strings). Even a "simple" subset parser will have bugs | Not recommended |
| C: Use JSON instead of YAML frontmatter | Change CANS.md to use JSON frontmatter (`---json` delimiters) or a separate JSON config file | Breaks the Markdown-with-YAML convention. JSON lacks comments, is less human-readable for clinical configuration | Not recommended |

**Recommendation: Option A.** Vendor the `yaml` package source. It is zero-dependency, ISC-licensed, and the CANS.md format is Markdown with YAML frontmatter -- a well-established convention. Writing a custom YAML parser violates the "don't hand-roll" principle for solved problems. The vendored source does not appear in `node_modules` at runtime and does not violate the zero-runtime-npm-dependency constraint because it becomes part of CareAgent's own code.

**Alternative considered:** The `front-matter` npm package extracts YAML from `---` delimiters and returns parsed attributes. However, it depends on `js-yaml` internally. The `yaml` package is better because it is zero-dependency itself.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vendored `yaml` | Custom YAML parser | YAML has 80+ edge cases; custom parser will have bugs |
| TypeBox `Value.Errors` | Custom error formatting | TypeBox errors include path, message, schema -- sufficient for clear error messages |
| `fs.appendFileSync` for audit | `fs.createWriteStream` | WriteStream is buffered (faster) but loses data on crash; appendFileSync is synchronous but guarantees durability |
| Session-scoped hash chains | Single global chain | Global chain serializes all writes; session-scoped allows concurrent sessions |

**Installation (dev dependencies only):**
```bash
pnpm add -D openclaw@latest typescript@~5.7.0 tsdown@~0.20.0
pnpm add -D vitest@latest @vitest/coverage-v8@latest
pnpm add -D @sinclair/typebox@~0.34.0
```

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
@careagent/core/
  package.json                    # openclaw.extensions, peerDeps, zero runtime deps
  openclaw.plugin.json            # Plugin manifest: id, configSchema
  tsdown.config.ts                # ESM output, external openclaw
  vitest.config.ts                # V8 coverage, 80% thresholds
  tsconfig.json                   # Strict, ESM, Node22 target
  src/
    index.ts                      # register(api) entry point
    adapter/                      # PLUG-04: OpenClaw API insulation layer
      openclaw-adapter.ts         # Defines CareAgent's interface to OpenClaw
      types.ts                    # CareAgent-internal types (not OpenClaw types)
    activation/                   # CANS-01 through CANS-07
      gate.ts                     # Presence check, parse, validate, integrity
      cans-schema.ts              # TypeBox schema for CANS.md frontmatter
      cans-parser.ts              # Frontmatter extraction + YAML parse
      cans-integrity.ts           # SHA-256 hash comparison
    audit/                        # AUDT-01 through AUDT-06
      pipeline.ts                 # AuditPipeline class: log(), verify(), stats()
      writer.ts                   # JSONL append-only writer with hash chaining
      entry-schema.ts             # TypeBox schema for audit entries
      integrity-service.ts        # Background service for chain verification
    vendor/                       # Vendored zero-dep libraries
      yaml/                       # Vendored yaml package source (ISC license)
    types/
      index.ts                    # Shared CareAgent types
  test/
    unit/
      activation/
        gate.test.ts
        cans-schema.test.ts
        cans-parser.test.ts
        cans-integrity.test.ts
      audit/
        pipeline.test.ts
        writer.test.ts
        integrity-service.test.ts
      adapter/
        openclaw-adapter.test.ts
    fixtures/
      valid-cans.md               # Valid CANS.md for testing
      malformed-cans.md           # Schema violations for error testing
      tampered-cans.md            # Modified content for integrity testing
      empty-workspace/            # No CANS.md (inactive state)
```

### Pattern 1: Adapter Layer (Ports and Adapters)

**What:** Define CareAgent-internal interfaces for every OpenClaw capability used. The adapter module implements these interfaces by calling actual OpenClaw APIs. All other CareAgent code depends only on the internal interfaces, never on OpenClaw imports directly.

**When to use:** Every interaction with OpenClaw -- hook registration, CLI registration, service registration, workspace path resolution, configuration access.

**Why:** OpenClaw releases daily with documented breaking changes (tsdown migration broke bundled hooks in v2026.2.2, POST /hooks/agent behavior changed in v2026.2.12). The adapter pattern means upstream changes require updating one module, not grep-and-replace across the codebase.

**Example:**
```typescript
// src/adapter/types.ts -- CareAgent's own interface
export interface CareAgentPluginAPI {
  // Workspace
  getWorkspacePath(): string;

  // Hooks
  onBeforeToolCall(handler: ToolCallHandler): void;
  onAgentBootstrap(handler: BootstrapHandler): void;
  onGatewayStartup(handler: StartupHandler): void;

  // Registration
  registerCliCommand(config: CliCommandConfig): void;
  registerBackgroundService(config: ServiceConfig): void;
  registerSlashCommand(config: SlashCommandConfig): void;

  // Logging
  log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

export interface ToolCallHandler {
  (call: ToolCallEvent): ToolCallResult;
}

export interface ToolCallResult {
  block: boolean;
  blockReason?: string;
}

// src/adapter/openclaw-adapter.ts -- Translates OpenClaw API to CareAgent interface
import { registerPluginHooksFromDir } from 'openclaw/plugin-sdk';

export function createAdapter(api: unknown): CareAgentPluginAPI {
  // Cast to any because OpenClaw types may change
  const oc = api as any;

  return {
    getWorkspacePath(): string {
      return oc.workspaceDir ?? oc.config?.workspaceDir ?? process.cwd();
    },

    onBeforeToolCall(handler: ToolCallHandler): void {
      try {
        oc.on('before_tool_call', (event: any) => {
          const result = handler({
            toolName: event.module ?? event.toolName,
            method: event.method,
            params: event.params ?? event.arguments,
            sessionKey: event.sessionKey,
          });
          return { block: result.block, blockReason: result.blockReason };
        });
      } catch (e) {
        // Hook registration failed -- degrade gracefully
        this.log('warn', 'before_tool_call hook registration failed', { error: e });
      }
    },

    registerCliCommand(config: CliCommandConfig): void {
      oc.registerCli(
        ({ program }: any) => {
          program.command(config.name).description(config.description).action(config.handler);
        },
        { commands: [config.name] }
      );
    },

    registerBackgroundService(config: ServiceConfig): void {
      oc.registerService({
        id: config.id,
        start: config.start,
        stop: config.stop,
      });
    },

    // ... other methods
  };
}
```

**Confidence:** HIGH -- adapter/ports-and-adapters is a well-established pattern. The OpenClaw-specific API surface is documented in official docs and DeepWiki.

### Pattern 2: Binary Activation Gate

**What:** CANS.md presence is a binary gate. Present = clinical mode active (fully validated). Absent = plugin is inert. Malformed = absent (with error logging). No partial states.

**When to use:** The `register(api)` entry point, before any clinical component initializes.

**Example:**
```typescript
// src/activation/gate.ts
import { Value } from '@sinclair/typebox/value';
import { CANSSchema } from './cans-schema';
import { parseFrontmatter } from './cans-parser';
import { verifyIntegrity } from './cans-integrity';
import type { CANSDocument } from '../types';

export class ActivationGate {
  constructor(
    private workspacePath: string,
    private auditLog: (entry: any) => void,
  ) {}

  check(): CANSDocument | null {
    const cansPath = path.join(this.workspacePath, 'CANS.md');

    // Step 1: Presence check
    if (!fs.existsSync(cansPath)) {
      return null; // Silent -- normal non-clinical mode
    }

    // Step 2: Read and parse frontmatter
    const raw = fs.readFileSync(cansPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    if (!frontmatter) {
      this.auditLog({
        action: 'cans_parse_error',
        outcome: 'error',
        details: { reason: 'No YAML frontmatter found in CANS.md' },
      });
      return null;
    }

    // Step 3: Schema validation
    if (!Value.Check(CANSSchema, frontmatter)) {
      const errors = [...Value.Errors(CANSSchema, frontmatter)];
      const formatted = errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
      this.auditLog({
        action: 'cans_validation_error',
        outcome: 'error',
        details: { errors: errors.map(e => ({ path: e.path, message: e.message })) },
      });
      console.error(`CareAgent: CANS.md validation failed:\n${formatted}`);
      return null; // Malformed = inactive
    }

    // Step 4: Integrity check (CANS-07)
    const integrityOk = verifyIntegrity(cansPath, raw);
    if (!integrityOk) {
      this.auditLog({
        action: 'cans_integrity_failure',
        outcome: 'error',
        details: { reason: 'SHA-256 hash mismatch -- CANS.md may have been tampered with' },
      });
      console.warn('CareAgent: CANS.md integrity check failed. Clinical mode NOT activated.');
      return null;
    }

    return { ...frontmatter, _body: body } as CANSDocument;
  }
}
```

**Confidence:** HIGH -- the activation gate pattern is simple and well-defined in the architecture research.

### Pattern 3: Hash-Chained Append-Only JSONL

**What:** Each audit log entry includes the SHA-256 hash of the previous entry's serialized JSON. The first entry (genesis) has `prev_hash: null`. Any modification to any entry breaks the chain downstream of it.

**When to use:** Every write to AUDIT.log.

**Example:**
```typescript
// src/audit/writer.ts
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export class AuditWriter {
  private lastHash: string | null = null;
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    this.lastHash = this.recoverLastHash();
  }

  append(entry: Record<string, unknown>): void {
    const enriched = {
      ...entry,
      prev_hash: this.lastHash,
    };
    const line = JSON.stringify(enriched);
    const currentHash = createHash('sha256').update(line).digest('hex');

    appendFileSync(this.logPath, line + '\n', { flag: 'a' });

    this.lastHash = currentHash;
  }

  /** Recover the hash of the last entry on startup (for chain continuity) */
  private recoverLastHash(): string | null {
    try {
      const content = readFileSync(this.logPath, 'utf-8').trimEnd();
      if (!content) return null;
      const lastLine = content.split('\n').pop();
      if (!lastLine) return null;
      return createHash('sha256').update(lastLine).digest('hex');
    } catch {
      return null; // File does not exist yet -- genesis entry
    }
  }

  /** Verify the entire chain integrity */
  verifyChain(): { valid: boolean; brokenAt?: number; error?: string } {
    try {
      const content = readFileSync(this.logPath, 'utf-8').trimEnd();
      if (!content) return { valid: true };

      const lines = content.split('\n');
      let expectedPrevHash: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const parsed = JSON.parse(lines[i]);
        if (parsed.prev_hash !== expectedPrevHash) {
          return {
            valid: false,
            brokenAt: i,
            error: `Chain broken at entry ${i}: expected prev_hash ${expectedPrevHash}, got ${parsed.prev_hash}`,
          };
        }
        expectedPrevHash = createHash('sha256').update(lines[i]).digest('hex');
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Chain verification error: ${e.message}` };
    }
  }
}
```

**Confidence:** HIGH -- hash chaining is a well-established tamper-evidence pattern. The Node.js `crypto` module provides all necessary primitives.

### Pattern 4: TypeBox Schema-First CANS.md

**What:** Define the complete CANS.md frontmatter structure as a TypeBox schema. Use `Value.Check` for boolean validation and `Value.Errors` for detailed error reporting. Compile with `TypeCompiler.Compile` for performance if validation runs frequently.

**When to use:** CANS.md parsing (Phase 1), onboarding generation (Phase 2), runtime access.

**Example:**
```typescript
// src/activation/cans-schema.ts
import { Type, type Static } from '@sinclair/typebox';

// CANS-02: Provider identity
const ProviderLicenseSchema = Type.Object({
  type: Type.Union([
    Type.Literal('MD'), Type.Literal('DO'),
    Type.Literal('NP'), Type.Literal('PA'),
    Type.Literal('CRNA'), Type.Literal('CNM'),
  ]),
  state: Type.String({ minLength: 2, maxLength: 2 }),
  number: Type.String({ minLength: 1 }),
  verified: Type.Boolean(),
});

const ProviderSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  npi: Type.Optional(Type.String({ pattern: '^[0-9]{10}$' })),
  license: ProviderLicenseSchema,
  specialty: Type.String({ minLength: 1 }),
  subspecialty: Type.Optional(Type.String()),
  institution: Type.Optional(Type.String()),
  privileges: Type.Array(Type.String({ minLength: 1 })),
  credential_status: Type.Optional(Type.Union([
    Type.Literal('active'),
    Type.Literal('pending'),
    Type.Literal('expired'),
  ])),
});

// CANS-03: Scope of practice
const ScopeSchema = Type.Object({
  permitted_actions: Type.Array(Type.String()),
  prohibited_actions: Type.Optional(Type.Array(Type.String())),
  institutional_limitations: Type.Optional(Type.Array(Type.String())),
});

// CANS-04: Autonomy tiers for four atomic actions
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

// CANS-05: Hardening activation flags and consent
const HardeningSchema = Type.Object({
  tool_policy_lockdown: Type.Boolean(),
  exec_approval: Type.Boolean(),
  cans_protocol_injection: Type.Boolean(),
  docker_sandbox: Type.Boolean(),
  safety_guard: Type.Boolean(),
  audit_trail: Type.Boolean(),
});

const ConsentSchema = Type.Object({
  hipaa_warning_acknowledged: Type.Boolean(),
  synthetic_data_only: Type.Boolean(),
  audit_consent: Type.Boolean(),
});

// Complete CANS.md frontmatter schema
export const CANSSchema = Type.Object({
  version: Type.String(),
  provider: ProviderSchema,
  scope: Type.Optional(ScopeSchema),
  autonomy: AutonomySchema,
  hardening: Type.Optional(HardeningSchema),
  consent: Type.Optional(ConsentSchema),
  clinical_voice: Type.Optional(Type.Object({
    tone: Type.Optional(Type.String()),
    documentation_style: Type.Optional(Type.String()),
    eponyms: Type.Optional(Type.Boolean()),
    abbreviations: Type.Optional(Type.String()),
  })),
});

export type CANSDocument = Static<typeof CANSSchema>;
```

**Confidence:** HIGH -- TypeBox 0.34.x API is well-documented with `Type.Object`, `Type.Union`, `Type.Literal`, `Type.Optional`, `Type.Array`, `Type.String`, `Type.Boolean`. Import from `'@sinclair/typebox'` for types and `'@sinclair/typebox/value'` for runtime validation.

### Pattern 5: Frontmatter Extraction

**What:** Extract YAML frontmatter from Markdown content by splitting on `---` delimiters, then parse the YAML block.

**Example:**
```typescript
// src/activation/cans-parser.ts
import { parse as parseYAML } from '../vendor/yaml';

interface ParsedFrontmatter {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const yamlBlock = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trim();

  try {
    const parsed = parseYAML(yamlBlock);
    if (typeof parsed !== 'object' || parsed === null) {
      return { frontmatter: null, body: content };
    }
    return { frontmatter: parsed as Record<string, unknown>, body };
  } catch {
    return { frontmatter: null, body: content };
  }
}
```

**Confidence:** HIGH -- frontmatter extraction is a simple string split; the YAML parse is delegated to a vendored library.

### Anti-Patterns to Avoid

- **Importing OpenClaw directly in business logic:** All OpenClaw interactions go through the adapter layer. If you write `import { something } from 'openclaw/...'` outside of `src/adapter/`, you are doing it wrong.
- **Partial CANS.md activation:** CANS.md is valid or it is not. Never parse "what we can" and ignore errors. Malformed = inactive.
- **Synchronous audit writes blocking the response path:** Use `appendFileSync` for durability but keep the audit call out of any hot path that blocks user interaction. For Phase 1 (low write volume), synchronous is acceptable. Revisit if latency becomes measurable.
- **Storing audit chain state in a separate file:** The chain state (last hash) is recoverable from the last line of AUDIT.log. Do not create a separate state file that can drift.
- **Deferring hash chaining:** The architecture research and pitfall analysis both flag this as critical. Implement hash chaining from the first audit entry. The cost is one `createHash` call per entry (~0.01ms).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing | Custom YAML parser | Vendored `yaml` package (zero-dep, ISC) | YAML has 80+ edge cases. Custom parsers fail on multiline strings, implicit types, anchors, and the Norway problem (`NO` -> `false`) |
| Schema validation | Custom validator | TypeBox `Value.Check` + `Value.Errors` | TypeBox provides path-aware errors, JSON Schema compatibility, and TypeScript type inference. OpenClaw's plugin system validates configSchema with TypeBox |
| SHA-256 hashing | Third-party crypto | Node.js `node:crypto` built-in | `createHash('sha256')` is built into Node.js. Zero dependencies, hardware-accelerated on modern CPUs |
| JSON serialization | Custom serializer | `JSON.stringify` built-in | Standard, deterministic for hash chaining (same input = same output when keys are controlled) |
| File watching (future) | Custom poll loop | Node.js `node:fs/promises` `watch()` | Built-in, uses OS-level file system events (fsevents on macOS, inotify on Linux) |

**Key insight:** Phase 1 should have exactly zero hand-rolled implementations of solved problems. Every custom piece should be CareAgent-specific business logic (activation gate, audit schema, adapter translations).

## Common Pitfalls

### Pitfall 1: OpenClaw Plugin SDK Import Path Confusion

**What goes wrong:** Documentation references both `openclaw/plugin-sdk` and `@openclaw/plugin-sdk` in different places. Using the wrong import path causes build failures or runtime errors.
**Why it happens:** OpenClaw rebranded from Clawdbot to OpenClaw, moving packages to the `@openclaw/*` scope. Documentation has not been fully updated.
**How to avoid:** On the VPS, inspect the actual installed `openclaw` package to determine the correct import path. Run `node -e "console.log(require.resolve('openclaw/plugin-sdk'))"` and check what actually resolves. Document the correct path in the adapter layer.
**Warning signs:** `Module not found: 'openclaw/plugin-sdk'` at build time.
**Confidence:** HIGH -- confirmed documentation inconsistency in multiple sources.

### Pitfall 2: YAML Implicit Type Coercion

**What goes wrong:** YAML parses `NO` as `false`, `on` as `true`, `1.0` as a number. If a provider's state abbreviation is `NO` (Norway example) or a license number starts with leading zeros, the YAML parser silently converts them.
**Why it happens:** YAML 1.1 has implicit type rules that convert certain strings to booleans and numbers. The `yaml` package defaults to YAML 1.2 which is safer, but some parsers still have quirks.
**How to avoid:** Use the `yaml` package (not `js-yaml`) which defaults to YAML 1.2 with stricter typing. In the CANS.md schema, define all critical fields as strings and validate types with TypeBox after parsing.
**Warning signs:** TypeBox validation fails on fields that look correct in the YAML source.
**Confidence:** HIGH -- the Norway problem is well-documented.

### Pitfall 3: Hash Chain Breaks on Schema Evolution

**What goes wrong:** The audit entry schema evolves (new fields added, field names changed). Old entries in the chain have a different structure than new entries. The chain still verifies (hashes are of serialized strings, not schemas), but tooling that reads the log may break.
**Why it happens:** Schema evolution in append-only logs is a known challenge. You cannot migrate old entries.
**How to avoid:** Include a `schema_version` field in every audit entry. Readers must handle multiple schema versions. Never remove or rename fields -- only add new ones. Use `Type.Optional` for all new fields.
**Warning signs:** Audit log readers crash on old entries after a schema change.
**Confidence:** MEDIUM -- standard append-only log challenge.

### Pitfall 4: `before_tool_call` Hook Not Firing

**What goes wrong:** CareAgent registers a `before_tool_call` handler, but OpenClaw never calls it. Scope enforcement in Phase 3 silently degrades.
**Why it happens:** PR #6570 wired the hook but it is recent (Feb 2026). The VPS may run an older OpenClaw version. Even if merged, the hook may not fire for all tool types.
**How to avoid:** Implement a canary test in Phase 1 that registers a handler and checks if it was called. This is not Phase 3's problem to discover. In Phase 1, register the hook infrastructure and the canary -- do not implement full scope enforcement yet.
**Warning signs:** Canary test logs "before_tool_call hook NOT verified" at startup.
**Confidence:** HIGH -- confirmed unimplemented for an extended period per issue #6535.

### Pitfall 5: Audit Log File Permissions on VPS

**What goes wrong:** AUDIT.log is created with default permissions. Another process or the provider accidentally deletes or modifies it.
**Why it happens:** Default file creation mode allows read-write by owner. Append-only is a convention, not an OS enforcement.
**How to avoid:** On Linux VPS, set the append-only attribute after first write: `chattr +a AUDIT.log`. In code, open with `O_APPEND | O_WRONLY` flags. Log a warning if the file permissions allow modification.
**Warning signs:** AUDIT.log modification timestamp changes without a corresponding last-entry timestamp.
**Confidence:** MEDIUM -- OS-level enforcement depends on VPS configuration and root access.

## Code Examples

### Plugin Entry Point (register function)

```typescript
// src/index.ts
// Source: OpenClaw plugin docs + ClawBands reference implementation
import { createAdapter } from './adapter/openclaw-adapter';
import { ActivationGate } from './activation/gate';
import { AuditPipeline } from './audit/pipeline';

export default function register(api: unknown): void {
  const adapter = createAdapter(api);
  const audit = new AuditPipeline(adapter);

  // Audit always starts (logs activation events even when clinical mode is off)
  audit.start();

  // CLI always registers (needed for `careagent init` before CANS.md exists)
  adapter.registerCliCommand({
    name: 'careagent',
    description: 'CareAgent clinical activation commands',
    handler: () => { /* Phase 2 */ },
  });

  // Check activation
  const gate = new ActivationGate(adapter.getWorkspacePath(), (entry) => audit.log(entry));
  const cans = gate.check();

  if (!cans) {
    audit.log({ action: 'activation_check', outcome: 'inactive', details: { reason: 'No valid CANS.md' } });
    return; // Plugin is inert
  }

  // CANS.md present and valid -- clinical mode active
  audit.log({
    action: 'activation_check',
    outcome: 'active',
    details: { provider: cans.provider.name, specialty: cans.provider.specialty },
  });

  // Register before_tool_call canary (Phase 1 only verifies the hook fires)
  let hookCanaryFired = false;
  adapter.onBeforeToolCall(() => {
    hookCanaryFired = true;
    return { block: false }; // Phase 1: observe only, don't block
  });

  // Background service for audit integrity monitoring (AUDT-06)
  adapter.registerBackgroundService({
    id: 'careagent-audit-monitor',
    start: () => {
      // Periodic chain verification
      setInterval(() => {
        const result = audit.verifyChain();
        if (!result.valid) {
          adapter.log('error', `Audit chain integrity failure: ${result.error}`);
          audit.log({ action: 'audit_integrity_check', outcome: 'error', details: result });
        }
      }, 60_000); // Check every 60 seconds
    },
    stop: () => { /* cleanup interval */ },
  });

  // Log canary status after a delay
  setTimeout(() => {
    if (!hookCanaryFired) {
      adapter.log('warn', 'CareAgent: before_tool_call hook did NOT fire. Safety Guard will be degraded in Phase 3.');
      audit.log({
        action: 'hook_canary',
        outcome: 'error',
        details: { hook: 'before_tool_call', status: 'not_fired' },
      });
    } else {
      audit.log({
        action: 'hook_canary',
        outcome: 'allowed',
        details: { hook: 'before_tool_call', status: 'verified' },
      });
    }
  }, 30_000);
}
```

### CANS.md Integrity Check (CANS-07)

```typescript
// src/activation/cans-integrity.ts
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const HASH_STORE_DIR = '.careagent';
const HASH_STORE_FILE = 'cans-integrity.json';

export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function verifyIntegrity(cansPath: string, content: string): boolean {
  const workspaceDir = dirname(cansPath);
  const storeDir = join(workspaceDir, HASH_STORE_DIR);
  const storePath = join(storeDir, HASH_STORE_FILE);

  const currentHash = computeHash(content);

  if (!existsSync(storePath)) {
    // First load -- store the hash as known-good
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(storePath, JSON.stringify({ hash: currentHash, timestamp: new Date().toISOString() }));
    return true; // First load is always trusted
  }

  const stored = JSON.parse(readFileSync(storePath, 'utf-8'));
  if (stored.hash === currentHash) {
    return true; // Hash matches -- integrity verified
  }

  // Hash mismatch -- CANS.md has been modified since last known-good state
  return false;
}

export function updateKnownGoodHash(cansPath: string, content: string): void {
  const workspaceDir = dirname(cansPath);
  const storeDir = join(workspaceDir, HASH_STORE_DIR);
  const storePath = join(storeDir, HASH_STORE_FILE);

  const currentHash = computeHash(content);
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(storePath, JSON.stringify({ hash: currentHash, timestamp: new Date().toISOString() }));
}
```

### Audit Entry Schema (TypeBox)

```typescript
// src/audit/entry-schema.ts
import { Type, type Static } from '@sinclair/typebox';

const ActionState = Type.Union([
  Type.Literal('ai-proposed'),
  Type.Literal('provider-approved'),
  Type.Literal('provider-modified'),
  Type.Literal('provider-rejected'),
  Type.Literal('system-blocked'),
]);

const AuditEntrySchema = Type.Object({
  schema_version: Type.Literal('1'),
  timestamp: Type.String(),              // ISO 8601
  session_id: Type.String(),
  trace_id: Type.String(),
  action: Type.String(),                 // What was attempted
  action_state: Type.Optional(ActionState), // AUDT-03
  actor: Type.Union([
    Type.Literal('agent'),
    Type.Literal('provider'),
    Type.Literal('system'),
  ]),
  target: Type.Optional(Type.String()),   // Tool name, skill name, file, etc.
  outcome: Type.Union([
    Type.Literal('allowed'),
    Type.Literal('denied'),
    Type.Literal('escalated'),
    Type.Literal('error'),
    Type.Literal('active'),
    Type.Literal('inactive'),
  ]),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  blocked_reason: Type.Optional(Type.String()),    // AUDT-02
  blocking_layer: Type.Optional(Type.String()),    // Which hardening layer caught it
  prev_hash: Type.Union([Type.String(), Type.Null()]), // AUDT-04: hash chain
});

export type AuditEntry = Static<typeof AuditEntrySchema>;
export { AuditEntrySchema };
```

### Plugin Manifest

```json
// package.json
{
  "name": "@careagent/core",
  "version": "0.1.0",
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
    "openclaw": "2026.2.x",
    "typescript": "~5.7.0",
    "tsdown": "~0.20.0",
    "vitest": "~4.0.0",
    "@vitest/coverage-v8": "~4.0.0",
    "@sinclair/typebox": "~0.34.0"
  },
  "dependencies": {}
}
```

### tsdown Configuration

```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['openclaw', 'openclaw/plugin-sdk'],
});
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsup for builds | tsdown (Rolldown-based) | v2026.2.2 | Must use tsdown; tsup is deprecated. OpenClaw broke bundled hooks during migration |
| `before_tool_call` not wired | PR #6570 wired it | Feb 2026 | Hook now available but recent; needs VPS validation |
| Clawdbot/Moltbot naming | OpenClaw rebrand | Early 2026 | npm package is `openclaw`, extensions under `@openclaw/*` |
| TypeBox 0.33.x | TypeBox 0.34.x | 2025 | Minor API differences; 0.34 is maintained through 2026+ |
| TypeBox 0.34.x | TypeBox 1.0.0 | Late 2025 | 1.0 has breaking changes. OpenClaw still uses 0.34.x. DO NOT upgrade to 1.0 |

**Deprecated/outdated:**
- tsup: Replaced by tsdown in OpenClaw
- Zod: Never used by OpenClaw; do not add
- `before_tool_call` as "unimplemented": Now wired per PR #6570, but verify on VPS

## Open Questions

1. **Plugin SDK import path**
   - What we know: Docs reference both `openclaw/plugin-sdk` and `@openclaw/plugin-sdk`
   - What's unclear: Which one actually resolves in the installed package
   - Recommendation: First task on VPS should verify with `require.resolve`. Document in adapter layer.

2. **`registerPluginHooksFromDir` TypeScript resolution**
   - What we know: OpenClaw uses jiti for runtime TS resolution in hooks
   - What's unclear: Does it work with compiled JS from tsdown, or does it expect `.ts` files?
   - Recommendation: Test both patterns on VPS. The adapter layer can abstract this.

3. **`before_tool_call` handler return type**
   - What we know: ClawBands returns `{ block: boolean, blockReason?: string }`. PR #6570 implements `hookResult.block` with `blockReason`.
   - What's unclear: Exact TypeScript type for the return value. Are there other fields (e.g., `modify`, `replace`)?
   - Recommendation: Define CareAgent's own `ToolCallResult` type in the adapter. Translate to whatever OpenClaw expects.

4. **Workspace directory resolution**
   - What we know: Plugins receive workspace context through the API (`workspaceDir` in deps or config)
   - What's unclear: The exact property name and access pattern (is it `api.workspaceDir`, `deps.workspaceDir`, or `api.config.workspaceDir`?)
   - Recommendation: The adapter layer should try all known paths and fall back to `process.cwd()`.

5. **TypeBox runtime availability**
   - What we know: OpenClaw loads TypeBox at runtime for plugin config validation
   - What's unclear: Can CareAgent import TypeBox from the OpenClaw peer dependency at runtime, or must it bundle its own copy?
   - Recommendation: List `@sinclair/typebox` as devDependency. If TypeBox is not available at runtime through OpenClaw, tsdown will bundle it into the output. Test on VPS.

6. **AUDIT.log file location**
   - What we know: Should be in the workspace (alongside CANS.md) or in a CareAgent-specific directory
   - What's unclear: OpenClaw's conventions for plugin-created files. Should it be `.careagent/AUDIT.log` or `AUDIT.log` at workspace root?
   - Recommendation: Default to `.careagent/AUDIT.log` in the workspace. This avoids cluttering the workspace root and follows the convention of dot-directories for tool state.

## Sources

### Primary (HIGH confidence)

- [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin) -- Plugin manifest, register API, CLI registration, service registration, hook registration, configSchema
- [OpenClaw Hooks Docs](https://docs.openclaw.ai/automation/hooks) -- Hook types, HOOK.md format, handler signatures, event context
- [OpenClaw Issue #6535](https://github.com/openclaw/openclaw/issues/6535) -- before_tool_call hook status: 12 hooks in types, 4 originally wired, PR #6570 added before_tool_call
- [ClawBands (Reference Implementation)](https://github.com/SeyZ/clawbands) -- Real-world before_tool_call usage, `{ block: true, blockReason }` return pattern, JSONL audit trail
- [TypeBox GitHub](https://github.com/sinclairzx81/typebox) -- 0.34.x maintained through 2026+; 1.0 is separate with breaking changes
- [TypeBox Legacy (0.34.x)](https://github.com/sinclairzx81/typebox-legacy) -- `Value.Check`, `Value.Errors`, `TypeCompiler.Compile` API
- [DeepWiki: OpenClaw Extensions and Plugins](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins) -- Plugin lifecycle, discovery, slot types, PluginDefinition
- [DeepWiki: Creating Custom Plugins](https://deepwiki.com/openclaw/openclaw/10.3-creating-custom-plugins) -- Step-by-step plugin creation, package.json manifest

### Secondary (MEDIUM confidence)

- [Adapter Pattern in TypeScript](https://refactoring.guru/design-patterns/adapter/typescript/example) -- Ports-and-adapters implementation pattern
- [Hexagonal Architecture with DDD in TypeScript](https://www.linkedin.com/pulse/implementing-hexagonal-architecture-ddd-typescript-haidery-d0cof) -- API insulation through ports and adapters
- [yaml npm package](https://www.npmjs.com/package/yaml) -- v2.8.2, zero external dependencies, ISC license, YAML 1.2 default
- [front-matter npm package](https://www.npmjs.com/package/front-matter) -- Frontmatter extraction (depends on js-yaml internally)
- [Node.js crypto module](https://nodejs.org/docs/latest-v22.x/api/crypto.html) -- SHA-256 hash creation with `createHash`
- [OpenClaw Extended Core Hook System Proposal](https://gist.github.com/openmetaloom/657c4668c09d235f8da1306e2438904b) -- Proposed hook system extensions

### Tertiary (LOW confidence -- needs VPS validation)

- Plugin SDK import path: `openclaw/plugin-sdk` vs `@openclaw/plugin-sdk` -- conflicting docs
- `registerPluginHooksFromDir` TypeScript source resolution -- needs testing
- `before_tool_call` actual handler data shape -- inferred from ClawBands, not from OpenClaw source
- Workspace directory access pattern in plugin API -- multiple possibilities documented
- TypeBox runtime availability through OpenClaw peer dependency -- untested

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- constrained by OpenClaw platform, minimal decision surface
- Plugin registration: HIGH -- official docs + reference implementations (ClawBands, voice-call)
- CANS.md schema: HIGH -- TypeBox 0.34.x API is well-documented
- YAML parsing approach: MEDIUM -- vendoring decision is sound but untested in this context
- Audit hash chaining: HIGH -- standard pattern with Node.js built-in crypto
- Adapter layer: HIGH -- well-established architectural pattern
- OpenClaw hook behavior: MEDIUM -- PRs merged but recent; VPS validation needed
- Plugin SDK import paths: LOW -- conflicting documentation; must verify on VPS

**Research date:** 2026-02-17
**Valid until:** 2026-03-03 (14 days -- OpenClaw releases daily; hook behavior may change)
