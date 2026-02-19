# Technology Stack

**Project:** CareAgent (@careagent/provider-core)
**Researched:** 2026-02-17
**Overall Confidence:** MEDIUM-HIGH

---

## Recommended Stack

### Runtime & Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | >=22.12.0 | Runtime | OpenClaw requires Node >=22. Match exactly. | HIGH |
| TypeScript | ~5.7.x | Language | OpenClaw's codebase is TypeScript. Match their version range. | HIGH |
| pnpm | >=9.x | Package manager | OpenClaw uses pnpm for monorepo management. Match for compatibility. | HIGH |

**Rationale:** These are not choices -- they are constraints. OpenClaw v2026.2.x requires Node >=22.12.0, uses TypeScript throughout, and uses pnpm as its primary package manager. Deviating from any of these creates friction with the host platform.

### Build System

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| tsdown | ~0.20.x | Bundle & DTS generation | OpenClaw migrated from tsup to tsdown in 2026.2.2. tsup is no longer actively maintained. tsdown is powered by Rolldown (Rust-based) and generates both ESM/CJS bundles and `.d.ts` declarations. | HIGH |
| tsc | (bundled with TS) | Type checking only | tsdown handles bundling; tsc runs `--noEmit` for type verification in CI. | HIGH |

**Rationale:** OpenClaw broke their own bundled hooks when migrating to tsdown in 2026.2.2, which means tsdown is their current build system. CareAgent must match this to avoid interop issues when the plugin is loaded by OpenClaw's plugin loader, which uses jiti aliasing at runtime. tsup is explicitly deprecated upstream -- do not use it.

**Configuration:**
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

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vitest | ~4.0.x | Unit & integration testing | OpenClaw uses Vitest with V8 coverage. Their test commands: `pnpm test:coverage` (V8, 70% thresholds), `pnpm test:e2e` (multi-instance smoke tests). Match exactly. | HIGH |
| @vitest/coverage-v8 | ~4.0.x | Code coverage | OpenClaw uses V8 coverage provider, not Istanbul. Match. | HIGH |

**Rationale:** OpenClaw's test suite is Vitest. Plugin testing should use the same framework so tests can eventually share harnesses or run in the OpenClaw dev environment. Vitest also has native ESM and TypeScript support, eliminating the transform overhead Jest requires.

**Configuration:**
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

### OpenClaw Plugin Integration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| openclaw | 2026.2.x | Peer dependency | The host platform. NEVER in `dependencies` -- always `peerDependencies`. OpenClaw's plugin docs explicitly warn: "Never place openclaw in dependencies or use workspace:* in production dependencies. This breaks npm installs outside the monorepo." | HIGH |
| openclaw/plugin-sdk | (bundled) | Plugin SDK types & utilities | Exported as a separate entry point from the openclaw package. Provides TypeScript interfaces, TypeBox schema helpers, Gateway RPC method types, `registerPluginHooksFromDir`, and configuration utilities. | HIGH |
| @sinclair/typebox | ~0.34.x | Schema validation | OpenClaw uses TypeBox (not Zod) for ALL configuration schemas and protocol validation. TypeBox schemas drive runtime validation, JSON Schema export, and Swift codegen for the macOS app. CareAgent MUST use TypeBox for its config schema to integrate with OpenClaw's validation pipeline. | HIGH |

**Critical Decision: TypeBox over Zod**

OpenClaw's entire schema infrastructure is TypeBox. The Plugin SDK exports TypeBox helpers (`Type as T` from `@openclaw/plugin-sdk`). Plugin `configSchema` fields must be TypeBox schemas validated during Gateway startup. Using Zod would mean maintaining a parallel validation system that doesn't integrate with the host platform.

Use TypeBox for: plugin configuration, CANS.md schema validation, skill metadata schemas, anything that touches OpenClaw's validation pipeline.

Use Zod for: nothing. Do not add Zod as a dependency. TypeBox covers all schema validation needs and is the only schema library OpenClaw's plugin loader understands.

### Plugin Architecture Components

| Component | Implementation | Purpose | Confidence |
|-----------|---------------|---------|------------|
| Plugin manifest | `openclaw.plugin.json` | Declares plugin ID, configSchema, uiHints, skills directories | HIGH |
| Package manifest | `package.json` with `openclaw.extensions` field | Discovery by OpenClaw's plugin loader | HIGH |
| Entry point | `src/index.ts` exporting register function | Plugin registration with Gateway API | HIGH |
| Hook registration | `registerPluginHooksFromDir(api, path)` | Register event hooks from a directory | HIGH |
| Tool registration | `api.registerTool(config)` | Register agent tools (e.g., chart-skill) | HIGH |
| Command registration | `api.registerCommand(config)` | Register slash commands (e.g., /careagent, /cans) | HIGH |
| Service registration | `api.registerService(config)` | Background services with start/stop lifecycle | HIGH |
| CLI registration | `api.registerCli(callback, options)` | CLI commands (e.g., `openclaw careagent onboard`) | HIGH |

**Plugin Entry Point Pattern:**
```typescript
import { registerPluginHooksFromDir } from "openclaw/plugin-sdk";
import type { PluginDefinition } from "openclaw/plugin-sdk";

export default function register(api) {
  // Register hooks (before_tool_call, agent:bootstrap, etc.)
  registerPluginHooksFromDir(api, "./hooks");

  // Register tools (chart-skill, etc.)
  api.registerTool(chartSkillConfig);

  // Register commands (/careagent, /cans)
  api.registerCommand(careagentCommand);

  // Register background services (audit logger, integrity checker)
  api.registerService(auditService);

  // Register CLI commands (openclaw careagent onboard)
  api.registerCli(careagentCli);
}
```

### Hook System

| Hook | Event | Status | CareAgent Use | Confidence |
|------|-------|--------|--------------|------------|
| `before_tool_call` | Pre-tool execution | Implemented (PR #6570 merged) | Tool policy enforcement, scope gating, audit logging | MEDIUM |
| `after_tool_call` | Post-tool execution | Implemented (PR #6264 merged) | Audit logging of results, safety verification | MEDIUM |
| `agent:bootstrap` | Before workspace file injection | Working | Inject CANS.md into system prompt | HIGH |
| `tool_result_persist` | Before tool result written to transcript | Working (synchronous) | Redact PHI from transcripts | HIGH |
| `command:new` | Session reset | Working | Reset session-scoped audit context | HIGH |
| `gateway:startup` | After gateway starts | Working | Initialize audit system, verify CANS.md integrity | HIGH |

**Critical Note on `before_tool_call`:**

Issue #6535 documented that `before_tool_call` existed in the type system but wasn't wired into the execution flow. PR #6570 and PR #6264 have since implemented both `before_tool_call` and `after_tool_call`. However, the project context notes "Hook dependency: before_tool_call exists in OpenClaw's type system but call sites not wired (issue #6535) -- design for it, graceful no-op until available."

**Strategy:** Design the tool policy layer around `before_tool_call`, but implement a graceful degradation path. If the hook isn't called at runtime (e.g., user is on an older OpenClaw version), the system should log a warning and fall back to AGENTS.md-based instructions for scope enforcement. The hook implementations in PRs #6570/#6264 are recent (Feb 2026) and may not be in all deployed versions yet.

**Confidence: MEDIUM** -- The PRs are merged but recent. Verify against the actual OpenClaw version on the target VPS before relying on these hooks.

### CANS.md Bootstrap Injection

| Mechanism | How | Confidence |
|-----------|-----|------------|
| `bootstrap-extra-files` hook | Bundled hook that injects extra workspace files during `agent:bootstrap`. Can inject CANS.md alongside standard files (SOUL.md, AGENTS.md, etc.) | HIGH |
| `agents.defaults.bootstrapExtraFiles` config | Configuration-based approach to add custom files to bootstrap injection | MEDIUM |
| Direct `agent:bootstrap` hook | Custom hook that mutates `context.bootstrapFiles` to add CANS.md content | HIGH |

**Recommendation:** Use the `agent:bootstrap` hook to inject CANS.md content. This gives CareAgent full control over when and how the clinical kernel is loaded. The bootstrap-extra-files bundled hook works but is less flexible (glob-pattern based, not programmable). A custom hook lets CareAgent:
1. Check if CANS.md exists (activation gate)
2. Verify CANS.md integrity (checksum)
3. Parse credentials from CANS.md to determine which skills to load
4. Inject CANS.md content into `context.bootstrapFiles`

**Bootstrap limits:** Per-file max is 20,000 chars (`agents.defaults.bootstrapMaxChars`), total max is 150,000 chars (`agents.defaults.bootstrapTotalMaxChars`). CANS.md must stay well under the per-file limit.

### Audit Logging

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Custom JSONL writer | N/A (built-in) | AUDIT.log append-only logging | No npm package needed. Node.js `fs.appendFileSync` with JSONL format is the simplest, most auditable approach. Every audit entry is a single JSON line appended to the file. No dependencies, no configuration, no failure modes beyond disk I/O. | HIGH |
| pino | ~9.x | Structured application logging (not audit) | For CareAgent's own operational logs (debug, info, warn, error). 5x faster than Winston. JSON-first. Not for the AUDIT.log -- that needs a custom, zero-dependency writer. | MEDIUM |

**AUDIT.log Design:**
```typescript
// Minimal, zero-dependency audit writer
import { appendFileSync } from 'node:fs';

interface AuditEntry {
  timestamp: string;       // ISO 8601
  session_id: string;
  action: string;          // 'tool_call' | 'tool_blocked' | 'skill_loaded' | 'cans_verified' | ...
  actor: string;           // 'agent' | 'provider' | 'system'
  target?: string;         // tool name, skill name, etc.
  decision: string;        // 'allowed' | 'blocked' | 'escalated'
  reason?: string;         // why blocked/escalated
  metadata?: Record<string, unknown>;
}

function audit(entry: AuditEntry): void {
  const line = JSON.stringify(entry) + '\n';
  appendFileSync(auditLogPath, line, { flag: 'a' });
}
```

**Why not pino for audit?** Pino is designed for application logging with levels, transports, and worker threads. The AUDIT.log is a domain-specific compliance artifact that must be dead simple: append JSON lines to a file. No log levels. No transports. No rotation (append-only means append-only). Adding pino introduces configuration surface area and failure modes that a clinical audit trail cannot afford.

**Future hardening (out of scope for v1):** Cryptographic hash chaining (each entry includes hash of previous entry), digital signatures, tamper detection. The JSONL format supports this -- each line can include a `prev_hash` field when the time comes.

### Clinical Data Schemas

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @medplum/fhirtypes | ~5.0.x | FHIR R4 TypeScript type definitions | Provides compile-time type safety for all 150+ FHIR R4 resource types. Types-only package (zero runtime cost). Actively maintained (published 4 days ago as of research date). | HIGH |
| TypeBox schemas | (custom) | CANS.md schema, skill metadata, audit entry schema | Runtime validation for CareAgent-specific data structures. Consistent with OpenClaw's TypeBox usage. | HIGH |

**Why @medplum/fhirtypes over alternatives:**
- `@types/fhir`: DefinitelyTyped, community maintained, less actively updated
- `@solarahealth/fhir-r4`: Includes Zod schemas (we don't want Zod)
- `@ahryman40k/ts-fhir-types`: Uses io-ts (another schema lib we don't want)
- `@medplum/fhirtypes`: Types-only, actively maintained by Medplum (healthcare-focused company), zero runtime dependencies

**Important:** @medplum/fhirtypes is for TYPE definitions only. CareAgent is not building a FHIR server. The types ensure that when chart-skill generates clinical documentation, the output conforms to FHIR resource structures. This is a development-time dependency, not a runtime one.

### Security & Hardening

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| OpenClaw exec approvals | (built-in) | Tool execution approval | OpenClaw's native exec approval system handles human-in-the-loop for dangerous commands. CareAgent layers clinical scope gating on top via `before_tool_call`. | HIGH |
| OpenClaw Docker sandboxing | (built-in) | Container isolation | OpenClaw supports per-agent and per-session Docker sandboxing. CareAgent should recommend sandbox mode for clinical sessions. Configuration: `agents.defaults.sandbox.mode: "all"` | HIGH |
| Custom tool policy engine | N/A (built-in) | Deny-by-default scope enforcement | Inspired by ClawBands and GatewayStack patterns. CareAgent implements its own policy engine in the `before_tool_call` hook that checks CANS.md credentials against tool requirements. | HIGH |

**Reference implementations studied:**
- **ClawBands** (github.com/SeyZ/clawbands): Security middleware using `before_tool_call` with ALLOW/ASK/DENY policy engine, JSONL audit trail, approval queue. Architecture validated as feasible.
- **GatewayStack** (github.com/davidcrowe/openclaw-gatewaystack-governance): Deny-by-default governance with identity mapping, scope enforcement, rate limiting, injection detection. Adds <1ms per call. Zero dependencies beyond Node.js.

**CareAgent's 6-layer hardening maps to:**
1. **Tool policy** -> `before_tool_call` hook with deny-by-default allowlist (like GatewayStack)
2. **Exec approvals** -> OpenClaw's native exec approval system (built-in)
3. **Prompt injection defense** -> CANS.md instructions + `tool_result_persist` hook for output filtering
4. **Docker sandbox** -> OpenClaw's native sandboxing (configuration-based)
5. **Safety guard** -> Custom `after_tool_call` hook verifying outputs before delivery
6. **Audit integration** -> JSONL AUDIT.log from every hook

### Prompt Injection Defense

| Technology | Purpose | Confidence |
|------------|---------|------------|
| Architectural defense (not a library) | Trust boundaries, context isolation, output verification | HIGH |

**Do NOT add a prompt injection detection npm package.** The available libraries (prompt-injector, etc.) are testing/red-team tools, not production defenses. Prompt injection defense for CareAgent is architectural:
1. CANS.md defines the trust boundary (what the agent is allowed to do)
2. `before_tool_call` enforces scope (agent cannot call tools outside its credentials)
3. `tool_result_persist` filters outputs before persistence (redact unexpected patterns)
4. AGENTS.md instructions establish behavioral guardrails
5. The audit trail creates accountability (every action logged)

This is defense-in-depth, not a single library call.

### Skill Integrity

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Node.js `crypto.createHash('sha256')` | Skill file checksumming | Zero-dependency, built into Node.js. Generate SHA-256 hash at install time, verify at load time. No npm package needed. | HIGH |

**Pattern:**
```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function checksumFile(path: string): string {
  const content = readFileSync(path);
  return createHash('sha256').update(content).digest('hex');
}
```

### Onboarding Interview System

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| OpenClaw's conversation system | Multi-turn interview | The interview is a conversation with the agent. No special UI library needed -- the provider talks to CareAgent through their normal OpenClaw channel (CLI, WhatsApp, Telegram, etc.). | HIGH |
| TypeBox schemas | Interview response validation | Validate structured data extracted from natural language responses | HIGH |
| SKILL.md format | Interview skill definition | The onboarding interview is itself a skill that CareAgent loads | HIGH |

**The onboarding interview is not a CLI wizard.** It is a multi-turn conversation that happens through whatever channel the provider uses to talk to OpenClaw. The agent asks questions, parses responses, and generates CANS.md. This leverages OpenClaw's existing multi-channel infrastructure.

---

## Package Structure

```
@careagent/provider-core/
  package.json                    # openclaw.extensions, peerDeps
  openclaw.plugin.json            # Plugin manifest with configSchema
  tsdown.config.ts                # Build configuration
  vitest.config.ts                # Test configuration
  src/
    index.ts                      # Plugin entry point (register function)
    hooks/
      before-tool-call/
        HOOK.md                   # Hook metadata
        handler.ts                # Tool policy enforcement
      after-tool-call/
        HOOK.md
        handler.ts                # Audit logging, safety verification
      agent-bootstrap/
        HOOK.md
        handler.ts                # CANS.md injection
      tool-result-persist/
        HOOK.md
        handler.ts                # Output filtering, PHI redaction
      gateway-startup/
        HOOK.md
        handler.ts                # Audit system init, integrity checks
    skills/
      onboarding/
        SKILL.md                  # Onboarding interview skill
      chart/
        SKILL.md                  # Clinical documentation skill
    commands/
      careagent.ts                # /careagent slash command
      cans.ts                     # /cans slash command
    services/
      audit.ts                    # Audit background service
    lib/
      audit-writer.ts             # JSONL append-only writer
      cans-parser.ts              # CANS.md parser & validator
      tool-policy.ts              # Deny-by-default policy engine
      skill-integrity.ts          # SHA-256 checksumming
      schemas/                    # TypeBox schemas
        cans.ts                   # CANS.md schema
        audit-entry.ts            # Audit log entry schema
        skill-meta.ts             # Clinical skill metadata schema
    types/
      index.ts                    # CareAgent type definitions
  test/
    unit/                         # Vitest unit tests
    integration/                  # Vitest integration tests
    fixtures/                     # Test CANS.md files, mock tools, etc.
```

### Package.json Structure

```json
{
  "name": "@careagent/provider-core",
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
    "@sinclair/typebox": "~0.34.0",
    "@medplum/fhirtypes": "~5.0.0"
  },
  "dependencies": {}
}
```

**Note: Zero runtime dependencies.** Everything CareAgent needs at runtime comes from:
1. Node.js built-ins (fs, crypto, path)
2. OpenClaw (peer dependency, provides plugin SDK, TypeBox at runtime)
3. CareAgent's own code

This is intentional. A clinical plugin should have the smallest possible dependency surface area. Every npm dependency is an attack vector and a maintenance burden. OpenClaw already provides TypeBox at runtime through the plugin SDK, so we don't even need it as a direct dependency.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Schema validation | TypeBox (via OpenClaw SDK) | Zod | OpenClaw's entire schema infrastructure is TypeBox. Zod would create a parallel system that doesn't integrate with plugin config validation. |
| Build system | tsdown | tsup | tsup is no longer actively maintained. OpenClaw migrated to tsdown in 2026.2.2. |
| Build system | tsdown | esbuild directly | tsdown wraps Rolldown with DTS generation and library-specific defaults. Raw esbuild requires manual DTS and more configuration. |
| Testing | Vitest | Jest | OpenClaw uses Vitest. Jest requires ESM transforms. No reason to diverge. |
| Audit logging | Custom JSONL writer | Winston/Pino | Audit log must be dead simple: append JSON to file. Logger libraries add configuration surface and failure modes a compliance artifact cannot afford. |
| Audit logging | Custom JSONL writer | @sourceloop/audit-log | External dependency for something that is 5 lines of code. Unnecessary abstraction. |
| FHIR types | @medplum/fhirtypes | @types/fhir | Less actively maintained, community-contributed DefinitelyTyped package vs. healthcare-company-maintained package. |
| FHIR types | @medplum/fhirtypes | @solarahealth/fhir-r4 | Pulls in Zod as runtime dependency. We use TypeBox. |
| Package manager | pnpm | npm/yarn | OpenClaw uses pnpm. Match the host. |
| Prompt injection defense | Architectural (no library) | prompt-injector npm | That's a red-team testing tool, not a production defense. Defense is architectural. |
| Tool policy | Custom engine | ClawBands | ClawBands is a standalone middleware for general security. CareAgent needs clinical scope gating tied to CANS.md credentials. Borrow the pattern, not the package. |

---

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| **Zod** | OpenClaw is TypeBox. Adding Zod creates schema system fragmentation. |
| **tsup** | Deprecated. OpenClaw migrated away. Will cause interop issues. |
| **Jest** | OpenClaw uses Vitest. Jest needs ESM transforms. |
| **Winston** | Overkill for AUDIT.log. Use for nothing. Pino is faster if you need app logging. |
| **Express/Fastify** | CareAgent is a plugin, not a server. OpenClaw's Gateway handles HTTP. |
| **Any database** | AUDIT.log is a file. CANS.md is a file. Skills are files. OpenClaw's workspace is file-based. |
| **React/Vue/Svelte** | No UI. CareAgent operates through OpenClaw's existing channels. |
| **@medplum/core** | Heavy runtime SDK for FHIR servers. We only need type definitions. |
| **Docker SDK** | OpenClaw handles Docker sandboxing natively. CareAgent configures it, doesn't manage containers. |
| **Prisma/Drizzle/Knex** | No database. File-based architecture matches OpenClaw's workspace pattern. |
| **dotenv** | OpenClaw handles configuration through openclaw.json. Don't add a parallel config system. |

---

## Installation

```bash
# Development setup
pnpm init
pnpm add -D openclaw@latest typescript@~5.7.0 tsdown@~0.20.0
pnpm add -D vitest@latest @vitest/coverage-v8@latest
pnpm add -D @sinclair/typebox@~0.34.0
pnpm add -D @medplum/fhirtypes@~5.0.0

# No runtime dependencies to install
```

```bash
# User installation (future)
openclaw plugins install @careagent/provider-core
```

---

## Version Pinning Strategy

| Dependency | Strategy | Rationale |
|------------|----------|-----------|
| openclaw | `>=2026.1.0` peer | Wide compatibility range. CareAgent should work with any recent OpenClaw. |
| typescript | `~5.7.0` | Minor-pinned. TypeScript minor versions can change type behavior. |
| tsdown | `~0.20.0` | Minor-pinned. Build tool changes can break output format. |
| vitest | `~4.0.0` | Minor-pinned. Test framework API stability matters. |
| @sinclair/typebox | `~0.34.0` | Minor-pinned. Pre-1.0 library, minor versions may have breaking changes. |
| @medplum/fhirtypes | `~5.0.0` | Minor-pinned. Type definition changes can break compilation. |

---

## Sources

### HIGH Confidence (Official Documentation)
- [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin) -- Plugin SDK, manifest format, registration API
- [OpenClaw Hooks Docs](https://docs.openclaw.ai/automation/hooks) -- Hook types, handler signatures, HOOK.md format
- [OpenClaw Skills Docs](https://docs.openclaw.ai/tools/skills) -- SKILL.md format, frontmatter, metadata gating
- [OpenClaw TypeBox Docs](https://docs.openclaw.ai/concepts/typebox) -- Schema patterns, AJV validation, protocol versioning
- [OpenClaw Exec Approvals](https://docs.openclaw.ai/tools/exec-approvals) -- Approval workflow, security modes
- [OpenClaw Sandboxing](https://docs.openclaw.ai/gateway/sandboxing) -- Docker isolation, per-session sandboxes
- [OpenClaw Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace) -- Bootstrap files, injection limits
- [OpenClaw System Prompt](https://docs.openclaw.ai/concepts/system-prompt) -- How workspace files enter the prompt

### MEDIUM Confidence (Verified Community Sources)
- [DeepWiki: Extensions and Plugins](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins) -- Plugin architecture deep dive
- [DeepWiki: Creating Custom Plugins](https://deepwiki.com/openclaw/openclaw/10.3-creating-custom-plugins) -- Step-by-step plugin creation
- [DeepWiki: Tool Security and Sandboxing](https://deepwiki.com/openclaw/openclaw/6.2-tool-security-and-sandboxing) -- Security layers
- [ClawBands](https://github.com/SeyZ/clawbands) -- Reference implementation for before_tool_call security middleware
- [GatewayStack](https://github.com/davidcrowe/openclaw-gatewaystack-governance) -- Deny-by-default governance reference
- [Issue #6535](https://github.com/openclaw/openclaw/issues/6535) -- Hook implementation status

### MEDIUM Confidence (Package Registries)
- [openclaw on npm](https://www.npmjs.com/package/openclaw) -- v2026.2.15, Node >=22
- [@sinclair/typebox on npm](https://www.npmjs.com/package/@sinclair/typebox) -- v0.34.48
- [@medplum/fhirtypes on npm](https://www.npmjs.com/package/@medplum/fhirtypes) -- v5.0.9
- [tsdown on npm](https://www.npmjs.com/package/tsdown) -- v0.20.3
- [vitest on npm](https://www.npmjs.com/package/vitest) -- v4.0.18
- [zod on npm](https://www.npmjs.com/package/zod) -- v4.3.6 (NOT recommended for this project)

### LOW Confidence (Needs Validation on Target VPS)
- before_tool_call hook wiring (PR #6570) -- merged but recent, verify on actual OpenClaw version
- after_tool_call hook wiring (PR #6264) -- merged but recent, verify on actual OpenClaw version
- bootstrap-extra-files hook behavior -- verify on actual OpenClaw version
- Feature request #9491 (configurable bootstrap files) -- may change how CANS.md injection works

---

## Open Questions (Require VPS Validation)

1. **Which OpenClaw version is deployed on the target VPS?** The `before_tool_call` and `after_tool_call` hooks were wired in PRs merged in early Feb 2026. If the VPS runs an older version, the tool policy layer needs graceful degradation.

2. **Does `registerPluginHooksFromDir` work with TypeScript source files or only compiled JS?** The plugin SDK uses jiti for runtime TS resolution, but this needs verification in a real plugin context.

3. **What is the actual `openclaw/plugin-sdk` export surface?** The docs reference `Type as T` from `@openclaw/plugin-sdk` and `registerPluginHooksFromDir` from `openclaw/plugin-sdk` (different import paths in different sources). Needs verification against the installed package.

4. **Can a plugin add custom files to the bootstrap hardcoded set?** The standard set is AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md. Getting CANS.md into this set programmatically (vs. hook injection) may require upstream changes.

5. **How does OpenClaw handle plugin-shipped skills?** The docs mention "Plugins can ship their own skills by listing skills directories in openclaw.plugin.json" but specifics on skill discovery, precedence, and credential gating need testing.
