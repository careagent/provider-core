# Phase 3: Runtime Hardening - Research

**Researched:** 2026-02-19
**Domain:** Six-layer defense system for clinical scope enforcement in an AI agent plugin
**Confidence:** HIGH

## Summary

Phase 3 implements the six-layer hardening engine that prevents any agent action outside the provider's credentialed scope. The codebase already has every prerequisite in place: the `HardeningEngine` interface (types, factory, index) exists as a stub in `src/hardening/`, the `PlatformAdapter` interface provides `onBeforeToolCall` and `onAgentBootstrap` hooks, the `AuditPipeline` supports `logBlocked()` with `blocking_layer` fields, and the CANS schema includes per-layer boolean flags in `hardening.*`. The OpenClaw entry point (`src/entry/openclaw.ts`) already registers a canary `before_tool_call` handler and logs hook liveness after 30 seconds. The standalone adapter no-ops all hook methods, providing natural graceful degradation.

The implementation is entirely internal to the plugin -- no new npm dependencies are needed, no host platform configuration files are written, and no OpenClaw internals are accessed. Each hardening layer is a pure function that reads CANS data and returns allow/deny decisions. The engine orchestrates layers sequentially and feeds every decision to the audit pipeline. The existing `BootstrapContext.addFile()` method enables CANS protocol injection. Docker sandbox detection requires only checking for environment markers (e.g., `/.dockerenv` or cgroup indicators).

**Primary recommendation:** Implement each layer as an independent, stateless function (`(toolCall, cans) => LayerResult`), compose them in the engine's `check()` method with short-circuit-on-deny semantics, and wire the engine into the existing `onBeforeToolCall` handler in `entry/openclaw.ts`. Every layer decision -- including "allowed" -- must audit-log with the layer name. The canary test already exists; Phase 3 replaces the no-op canary handler with the real safety guard.

## Standard Stack

### Core (already locked -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.7.0 | Language | Already configured, strict mode |
| @sinclair/typebox | ~0.34.0 | Schema validation | Already used for CANS and audit schemas |
| vitest | ~4.0.0 | Testing | Already configured, 426 tests passing |
| tsdown | ~0.20.0 | Build/bundle | Already configured with 4 entry points |
| Node.js built-ins | >=22.12.0 | `node:fs`, `node:path`, `node:crypto` | Zero-dep constraint |

### No New Dependencies Required

This phase requires **zero new npm dependencies**. All six layers use pure TypeScript logic operating on the existing `CANSDocument` type, `ToolCallEvent` type, and `AuditPipeline` class. Docker sandbox detection uses `node:fs` (`existsSync`). Shell command allowlist matching uses string comparison. System prompt injection uses the existing `BootstrapContext.addFile()` interface.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled tool policy matching | A policy DSL (e.g., OPA/Rego) | Overkill for current scope; CANS.md hardening flags are boolean, and scope matching is string-based. A DSL adds a dependency and learning curve. Hand-rolled is appropriate for the current tool count. |
| Synchronous `appendFileSync` for audit | Async buffered writes | Current audit pipeline uses `appendFileSync` and hash chaining is inherently sequential. The write volume (10-50 events per clinical session) makes synchronous I/O acceptable. Async would add complexity without measurable benefit. |
| String-matching for exec allowlist | Regex-based matching | Regex could match path variations but introduces ReDoS risk and makes the allowlist harder to audit. Exact-path matching is simpler, safer, and sufficient for a curated allowlist. |

## Architecture Patterns

### Recommended Project Structure (changes within `src/hardening/`)
```
src/hardening/
  index.ts              # Re-exports (exists -- update to include new modules)
  types.ts              # HardeningEngine, HardeningLayerResult, HardeningConfig (exists -- extend)
  engine.ts             # Engine orchestrator (exists as stub -- replace with implementation)
  layers/
    tool-policy.ts      # Layer 1: HARD-01 -- tool name allowlist/denylist
    exec-allowlist.ts   # Layer 2: HARD-02 -- shell binary path allowlist
    cans-injection.ts   # Layer 3: HARD-03 -- bootstrap hook protocol injection
    docker-sandbox.ts   # Layer 4: HARD-04 -- Docker environment detection + config
    safety-guard.ts     # Layer 5: HARD-05 -- before_tool_call scope validation
    audit-bridge.ts     # Layer 6: HARD-06 -- audit pipeline integration for all layers
  canary.ts             # HARD-07 -- hook liveness canary test
```

### Pattern 1: Layer-as-Function Composition

**What:** Each hardening layer is a pure function `(event: ToolCallEvent, cans: CANSDocument) => HardeningLayerResult`. The engine composes them with short-circuit-on-deny: if any layer denies, subsequent layers are skipped and the deny result is returned. Every layer result (allow or deny) is logged.

**When to use:** Every `check()` invocation in the engine.

**Why:** Stateless layers are independently testable, independently mockable, and the composition order is visible in one place (the engine). Short-circuit-on-deny is correct because a denied tool call should not be evaluated by downstream layers (e.g., don't check Docker sandbox for a tool that failed the policy check).

**Example:**
```typescript
// src/hardening/layers/tool-policy.ts
import type { ToolCallEvent } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';
import type { HardeningLayerResult } from '../types.js';

const LAYER_NAME = 'tool-policy';

/**
 * Layer 1: Tool policy lockdown.
 * Only tools matching the provider's permitted_actions are allowed.
 * If CANS hardening.tool_policy_lockdown is false, this layer is a pass-through.
 */
export function checkToolPolicy(
  event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
  if (!cans.hardening.tool_policy_lockdown) {
    return { layer: LAYER_NAME, allowed: true, reason: 'tool_policy_lockdown disabled' };
  }

  const permitted = cans.scope.permitted_actions;
  const prohibited = cans.scope.prohibited_actions ?? [];

  // Explicit deny takes priority
  if (prohibited.includes(event.toolName)) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: `Tool '${event.toolName}' is in prohibited_actions`,
    };
  }

  // Must be in permitted set
  if (!permitted.includes(event.toolName)) {
    return {
      layer: LAYER_NAME,
      allowed: false,
      reason: `Tool '${event.toolName}' is not in permitted_actions`,
    };
  }

  return { layer: LAYER_NAME, allowed: true };
}
```

### Pattern 2: Graceful Degradation via CANS Flags

**What:** Each layer checks its corresponding boolean flag in `cans.hardening.*` before enforcing. When the flag is `false`, the layer returns `{ allowed: true, reason: '<layer> disabled' }` -- a pass-through that is still audit-logged.

**When to use:** Every layer entry point.

**Why:** The CANS schema already defines per-layer booleans (`tool_policy_lockdown`, `exec_approval`, `cans_protocol_injection`, `docker_sandbox`, `safety_guard`, `audit_trail`). These are set during onboarding and default to `true`. This design means the provider controls which layers are active, and a missing or degraded layer is an explicit, audited choice rather than a silent failure.

**Relevant CANS schema fields:**
```typescript
// From src/activation/cans-schema.ts (already exists)
export const HardeningSchema = Type.Object({
  tool_policy_lockdown: Type.Boolean(),   // Layer 1
  exec_approval: Type.Boolean(),           // Layer 2
  cans_protocol_injection: Type.Boolean(), // Layer 3
  docker_sandbox: Type.Boolean(),          // Layer 4
  safety_guard: Type.Boolean(),            // Layer 5
  audit_trail: Type.Boolean(),             // Layer 6
});
```

### Pattern 3: Engine Orchestration with Full Audit Trail

**What:** The engine's `activate()` method registers hooks via the adapter, and `check()` runs all layers and audit-logs every decision. The engine is the single integration point between layers, hooks, and audit.

**Example:**
```typescript
// Conceptual engine.check() flow
check(toolName: string, params?: Record<string, unknown>): HardeningLayerResult {
  const event: ToolCallEvent = { toolName, params };
  const traceId = this.audit.createTraceId();

  for (const layer of this.layers) {
    const result = layer.check(event, this.cans);

    // Audit every decision
    this.audit.log({
      action: `hardening_check`,
      actor: 'system',
      target: toolName,
      outcome: result.allowed ? 'allowed' : 'denied',
      blocking_layer: result.allowed ? undefined : result.layer,
      blocked_reason: result.allowed ? undefined : result.reason,
      details: { layer: result.layer, reason: result.reason },
      trace_id: traceId,
    });

    // Short-circuit on deny
    if (!result.allowed) {
      return result;
    }
  }

  return { layer: 'engine', allowed: true };
}
```

### Pattern 4: Hook Wiring via PlatformAdapter

**What:** The engine uses `adapter.onBeforeToolCall()` to register the safety guard and `adapter.onAgentBootstrap()` to inject CANS protocol. It never calls OpenClaw APIs directly.

**Existing infrastructure in PlatformAdapter:**
```typescript
// From src/adapters/types.ts (already exists)
onBeforeToolCall(handler: ToolCallHandler): void;
onAgentBootstrap(handler: BootstrapHandler): void;
```

**Existing infrastructure in OpenClaw adapter:**
```typescript
// From src/adapters/openclaw/index.ts (already exists)
onBeforeToolCall(handler: ToolCallHandler): void {
  try {
    if (typeof raw?.on === 'function') {
      raw.on('before_tool_call', handler);
    }
  } catch (err) { /* graceful */ }
}

onAgentBootstrap(handler: BootstrapHandler): void {
  try {
    if (typeof raw?.on === 'function') {
      raw.on('agent:bootstrap', handler);
    }
  } catch (err) { /* graceful */ }
}
```

**Standalone adapter naturally no-ops both methods**, so hardening degrades gracefully outside OpenClaw.

### Pattern 5: Canary Test Replaces Existing No-Op

**What:** The current `entry/openclaw.ts` registers a no-op `before_tool_call` handler as a canary:
```typescript
// Current code in src/entry/openclaw.ts (lines 65-77)
let hookCanaryFired = false;
adapter.onBeforeToolCall(() => {
  if (!hookCanaryFired) {
    hookCanaryFired = true;
    audit.log({ action: 'hook_canary', ... });
  }
  return { block: false };
});
```

Phase 3 replaces this with the real safety guard handler. The canary logic moves into the hardening engine: the first time `check()` is called from the `before_tool_call` hook, the canary is confirmed. If the hook never fires (30s timeout remains), the warning is logged.

### Anti-Patterns to Avoid

- **Writing OpenClaw configuration files:** Layers 1 and 2 should NOT attempt to write `openclaw.json` or call `api.config.set()`. These OpenClaw-native config paths are undocumented, unstable, and would couple the plugin to OpenClaw internals. Instead, implement tool policy and exec allowlist as CareAgent-internal checks within the `before_tool_call` handler.

- **Relying on a single enforcement point:** The architecture already learned (from Pitfall 5 in research) that `before_tool_call` may not fire. Layers 1 and 3 provide defense-in-depth. Layer 1 (tool policy) filters at the check level. Layer 3 (CANS injection) shapes agent behavior at the prompt level. Layer 5 (safety guard) intercepts at the tool-call level. These overlap deliberately.

- **Making layers stateful:** Each layer should be a pure function. The engine holds state (activated flag, CANS document reference, audit pipeline reference). Individual layers do not hold state.

- **Blocking on audit writes:** The existing `AuditPipeline.log()` uses synchronous `appendFileSync`. This is acceptable for the expected write volume. Do not add async buffering or error-swallowing.

- **Hardcoding tool names:** Tool policy matching should use the `scope.permitted_actions` and `scope.prohibited_actions` arrays from CANS, not hardcoded lists. The provider defines their scope during onboarding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool policy matching | Custom policy engine with rules/DSL | Direct array `includes()` against `cans.scope.permitted_actions` | CANS scope is already a string array; tool names are strings. Array lookup is O(n) but n < 100. No need for a policy engine. |
| Docker detection | Shell command execution (`docker info`) | `existsSync('/.dockerenv')` + `/proc/1/cgroup` check | No subprocess needed; file presence is the standard detection method. Zero-dep. |
| Hash chaining for audit | Custom implementation | Existing `AuditWriter` class | Already implemented with SHA-256 hash chaining from genesis entry. Just call `audit.log()`. |
| YAML frontmatter parsing | Custom parser | Existing `parseFrontmatter()` from activation module | Already handles YAML extraction, error cases, and validation. |
| Hook registration | Direct OpenClaw API calls | Existing `PlatformAdapter.onBeforeToolCall()` | Adapter layer already handles try/catch, logging, and graceful degradation. |

**Key insight:** Phase 3 is mostly composition. Every building block already exists (adapter hooks, audit pipeline, CANS schema, TypeBox validation). The hardening engine composes these existing pieces with new layer logic. The new code is the layer functions themselves and the engine orchestrator.

## Common Pitfalls

### Pitfall 1: Canary Replacement Race Condition
**What goes wrong:** Phase 3 replaces the current no-op `before_tool_call` handler with the real safety guard, but the existing 30s timeout canary logic in `entry/openclaw.ts` is not coordinated with the engine's own canary tracking. This could result in duplicate canary logs or the warning firing even when the hook works.
**Why it happens:** The canary is currently wired in `entry/openclaw.ts` (lines 65-94). If the hardening engine also registers its own handler, there are two handlers competing for the same hook event.
**How to avoid:** Move ALL `before_tool_call` logic (both canary and safety guard) into the hardening engine. `entry/openclaw.ts` should call `engine.activate()` and the engine handles hook registration internally via the adapter. Remove the current inline canary code from `entry/openclaw.ts`.
**Warning signs:** Duplicate `hook_canary` entries in AUDIT.log. Hook firing but safety guard not executing.

### Pitfall 2: Stub Test Breakage
**What goes wrong:** The existing hardening tests (`test/unit/hardening/hardening.test.ts`) assert that `createHardeningEngine()` methods throw "not yet implemented (Phase 3)". When Phase 3 replaces the stubs, these tests must be replaced, not just added to.
**Why it happens:** Stub tests are verification that stubs exist. Implementation tests replace them entirely.
**How to avoid:** Delete the 7 existing stub tests and replace them with comprehensive implementation tests. The test file path can remain the same but the contents are completely new.
**Warning signs:** Tests asserting "not yet implemented" still passing after Phase 3 code is written.

### Pitfall 3: Exec Allowlist Overshooting
**What goes wrong:** The Layer 2 exec allowlist is too restrictive, blocking legitimate tool calls that need shell access (e.g., `cat`, `ls` for file reading, `git` for version control). Or it is too permissive, allowing arbitrary binaries.
**Why it happens:** The boundary between "safe read-only binaries" and "dangerous write binaries" is context-dependent. A neurosurgeon's CareAgent has different exec needs than a general practitioner's.
**How to avoid:** Start with a conservative base allowlist (`cat`, `ls`, `head`, `tail`, `wc`, `git log`, `git diff`, `git status`) and make it extensible via a future CANS field (not in this phase). Log every exec-blocked command so the provider can request additions. The allowlist is a string array of absolute paths.
**Warning signs:** Provider reports being unable to use basic file operations. Audit log shows many `exec_approval` denials for common binaries.

### Pitfall 4: Layer 3 (CANS Injection) Content Size
**What goes wrong:** The `agent:bootstrap` hook injects CANS clinical rules into the system prompt via `BootstrapContext.addFile()`. If the injected content is too large (entire CANS.md frontmatter + body), it consumes significant context window space.
**Why it happens:** CANS.md can be several hundred lines. The clinical philosophy section is free-form prose. Injecting everything wastes context tokens.
**How to avoid:** Extract only the "hard rules" -- scope boundaries, prohibited actions, institutional limitations, and autonomy tiers. Format them as a concise system prompt fragment (not the full CANS.md). Target < 500 tokens.
**Warning signs:** Agent's context window is consumed by system prompt content. Agent performance degrades.

### Pitfall 5: Layer 4 (Docker) False Positives
**What goes wrong:** Docker detection reports "not in Docker" on a system that IS sandboxed (e.g., container runtime other than Docker, or Docker without `/.dockerenv`), or reports "in Docker" on a system that is not (e.g., CI environments with leftover markers).
**Why it happens:** `/.dockerenv` is Docker-specific. Other container runtimes (Podman, containerd) may not create it. Some CI systems run in containers but have different markers.
**How to avoid:** Use multiple detection signals: `/.dockerenv` existence, `/proc/1/cgroup` containing "docker" or "containerd", and `CONTAINER` environment variable. If none are found, Layer 4 returns `{ allowed: true, reason: 'docker_sandbox disabled: no container detected' }` -- graceful pass-through, not a hard failure. Log the detection result.
**Warning signs:** Layer 4 reporting different results on different systems with the same Docker setup. Log says "no container detected" when the system is actually containerized.

### Pitfall 6: The `check()` Interface Needs ToolCallEvent, Not Just toolName
**What goes wrong:** The current `HardeningEngine.check()` signature is `check(toolName: string, params?: Record<string, unknown>)`. But the `ToolCallHandler` type from the adapter receives a full `ToolCallEvent` with `toolName`, `method`, `params`, and `sessionKey`. If the engine only accepts `toolName`, it loses context needed by Layer 2 (exec needs the command path) and Layer 5 (safety guard needs full params).
**Why it happens:** The stub interface was designed with a simplified signature.
**How to avoid:** Expand `check()` to accept `ToolCallEvent` (already defined in `src/adapters/types.ts`). This is a breaking change to the stub interface, which is acceptable since no consumer exists yet (the factory throws). Update the type in `types.ts`, the factory in `engine.ts`, and the re-export in `entry/core.ts`.
**Warning signs:** Layer 2 and Layer 5 cannot distinguish tool calls from exec calls.

## Code Examples

### Wiring the Engine into entry/openclaw.ts
```typescript
// In src/entry/openclaw.ts -- replaces current canary block (lines 64-94)
import { createHardeningEngine } from '../hardening/engine.js';

// After activation check succeeds and cans is available:
const engine = createHardeningEngine();
engine.activate({ cans, adapter, audit });

// The engine internally registers:
// - adapter.onBeforeToolCall() for the safety guard + canary
// - adapter.onAgentBootstrap() for CANS protocol injection
// The 30s canary timeout is managed inside the engine
```

### Layer 2: Exec Allowlist
```typescript
// src/hardening/layers/exec-allowlist.ts
const LAYER_NAME = 'exec-allowlist';

const BASE_ALLOWLIST = new Set([
  '/bin/cat', '/usr/bin/cat',
  '/bin/ls', '/usr/bin/ls',
  '/bin/head', '/usr/bin/head',
  '/bin/tail', '/usr/bin/tail',
  '/usr/bin/wc',
  '/usr/bin/git',
  '/usr/bin/grep',
  '/usr/bin/find',
]);

export function checkExecAllowlist(
  event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
  if (!cans.hardening.exec_approval) {
    return { layer: LAYER_NAME, allowed: true, reason: 'exec_approval disabled' };
  }

  // Only applies to exec/shell tool calls
  if (event.toolName !== 'Bash' && event.toolName !== 'exec') {
    return { layer: LAYER_NAME, allowed: true, reason: 'not an exec call' };
  }

  const command = typeof event.params?.command === 'string'
    ? event.params.command.trim().split(/\s+/)[0]
    : '';

  if (!command) {
    return { layer: LAYER_NAME, allowed: false, reason: 'empty exec command' };
  }

  if (BASE_ALLOWLIST.has(command)) {
    return { layer: LAYER_NAME, allowed: true };
  }

  return {
    layer: LAYER_NAME,
    allowed: false,
    reason: `Binary '${command}' is not in the exec allowlist`,
  };
}
```

### Layer 3: CANS Protocol Injection via Bootstrap Hook
```typescript
// src/hardening/layers/cans-injection.ts
import type { BootstrapContext } from '../../adapters/types.js';
import type { CANSDocument } from '../../activation/cans-schema.js';

/**
 * Extract concise clinical hard rules from CANS for system prompt injection.
 * Targets < 500 tokens to preserve context window.
 */
export function extractProtocolRules(cans: CANSDocument): string {
  const lines: string[] = [];
  lines.push('# CareAgent Clinical Protocol');
  lines.push('');
  lines.push(`Provider: ${cans.provider.name} (${cans.provider.license.type})`);
  lines.push(`Specialty: ${cans.provider.specialty}`);
  lines.push('');
  lines.push('## Scope Boundaries (HARD RULES)');
  lines.push(`Permitted: ${cans.scope.permitted_actions.join(', ')}`);
  if (cans.scope.prohibited_actions?.length) {
    lines.push(`PROHIBITED: ${cans.scope.prohibited_actions.join(', ')}`);
  }
  if (cans.scope.institutional_limitations?.length) {
    lines.push(`Limitations: ${cans.scope.institutional_limitations.join(', ')}`);
  }
  lines.push('');
  lines.push('## Autonomy Tiers');
  lines.push(`Chart: ${cans.autonomy.chart} | Order: ${cans.autonomy.order} | Charge: ${cans.autonomy.charge} | Perform: ${cans.autonomy.perform}`);
  lines.push('');
  lines.push('NEVER act outside these scope boundaries. If uncertain, ASK the provider.');

  return lines.join('\n');
}

export function injectProtocol(context: BootstrapContext, cans: CANSDocument): void {
  const rules = extractProtocolRules(cans);
  context.addFile('CAREAGENT_PROTOCOL.md', rules);
}
```

### Layer 4: Docker Sandbox Detection
```typescript
// src/hardening/layers/docker-sandbox.ts
import { existsSync, readFileSync } from 'node:fs';

const LAYER_NAME = 'docker-sandbox';

export interface DockerDetectionResult {
  inContainer: boolean;
  signals: string[];
}

export function detectDocker(): DockerDetectionResult {
  const signals: string[] = [];

  if (existsSync('/.dockerenv')) {
    signals.push('/.dockerenv exists');
  }

  try {
    const cgroup = readFileSync('/proc/1/cgroup', 'utf-8');
    if (cgroup.includes('docker') || cgroup.includes('containerd')) {
      signals.push('/proc/1/cgroup contains container reference');
    }
  } catch {
    // Not on Linux or /proc unavailable -- not a signal
  }

  if (process.env.CONTAINER) {
    signals.push('CONTAINER env var set');
  }

  return {
    inContainer: signals.length > 0,
    signals,
  };
}

export function checkDockerSandbox(
  _event: ToolCallEvent,
  cans: CANSDocument,
): HardeningLayerResult {
  if (!cans.hardening.docker_sandbox) {
    return { layer: LAYER_NAME, allowed: true, reason: 'docker_sandbox disabled' };
  }

  const detection = detectDocker();
  if (!detection.inContainer) {
    return {
      layer: LAYER_NAME,
      allowed: true,
      reason: 'docker_sandbox enabled but no container detected; proceeding without sandbox',
    };
  }

  // Container detected -- sandbox is active
  return {
    layer: LAYER_NAME,
    allowed: true,
    reason: `Container sandbox active (${detection.signals.join(', ')})`,
  };
}
```

### Canary Test (HARD-07)
```typescript
// src/hardening/canary.ts
import type { PlatformAdapter } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';

const CANARY_TIMEOUT_MS = 30_000;

export function setupCanary(
  adapter: PlatformAdapter,
  audit: AuditPipeline,
): { isVerified: () => boolean } {
  let verified = false;

  // The real before_tool_call handler will call markVerified()
  // If it never fires within CANARY_TIMEOUT_MS, warn the provider
  const timeoutId = setTimeout(() => {
    if (!verified) {
      adapter.log('warn', '[CareAgent] before_tool_call hook did NOT fire. Safety Guard is degraded.');
      audit.log({
        action: 'hook_canary',
        actor: 'system',
        outcome: 'error',
        details: {
          hook: 'before_tool_call',
          status: 'not_fired',
          message: 'Safety Guard Layer 5 is degraded -- hook not wired by host platform',
        },
      });
    }
  }, CANARY_TIMEOUT_MS);

  // Prevent the timeout from keeping Node.js alive
  if (timeoutId && typeof timeoutId === 'object' && 'unref' in timeoutId) {
    timeoutId.unref();
  }

  return {
    isVerified: () => verified,
    // Called by the engine on first before_tool_call invocation
    markVerified: () => {
      if (!verified) {
        verified = true;
        audit.log({
          action: 'hook_canary',
          actor: 'system',
          outcome: 'allowed',
          details: { hook: 'before_tool_call', status: 'verified' },
        });
      }
    },
  } as { isVerified: () => boolean; markVerified: () => void };
}
```

## Integration Points with Existing Code

### Files That Must Change

| File | Change | Reason |
|------|--------|--------|
| `src/hardening/types.ts` | Expand `check()` to accept `ToolCallEvent`; add layer-specific types | Current stub uses simplified signature |
| `src/hardening/engine.ts` | Replace stub with real orchestrator | Phase 3 core deliverable |
| `src/hardening/index.ts` | Export new layer modules | New files added |
| `src/entry/openclaw.ts` | Replace canary block (lines 64-94) with engine activation | Engine manages hooks |
| `src/entry/standalone.ts` | Optionally: add engine activation (degraded mode) | Consistency, but hooks no-op |
| `src/entry/core.ts` | Update re-exports if new types are added | Maintain API surface |
| `test/unit/hardening/hardening.test.ts` | Replace stub tests with implementation tests | Stubs are replaced |

### Files That Must NOT Change

| File | Reason |
|------|--------|
| `src/adapters/types.ts` | `ToolCallEvent`, `ToolCallHandler`, `BootstrapContext` already perfect |
| `src/adapters/openclaw/index.ts` | Already wraps `before_tool_call` and `agent:bootstrap` registration |
| `src/adapters/standalone/index.ts` | Already no-ops hooks (graceful degradation) |
| `src/audit/pipeline.ts` | `log()`, `logBlocked()`, `createTraceId()` already support all needed fields |
| `src/audit/entry-schema.ts` | `blocking_layer` and `blocked_reason` already in schema |
| `src/activation/cans-schema.ts` | `HardeningSchema` already has per-layer boolean flags |

### Existing Audit Pipeline Features Ready for Use

The audit pipeline already has everything Phase 3 needs:

- `AuditPipeline.log()` accepts `blocking_layer` and `blocked_reason` fields
- `AuditPipeline.logBlocked()` is a convenience method for denied actions
- `AuditPipeline.createTraceId()` generates trace IDs for correlating layer checks
- `AuditEntry.blocking_layer` field in the schema maps directly to layer names
- Hash chaining is automatic -- no additional work needed

### Existing CANS Fields Ready for Use

The CANS schema provides all data needed by all six layers:

- `cans.hardening.*` -- per-layer boolean enable/disable flags (6 booleans)
- `cans.scope.permitted_actions` -- string array for Layer 1 tool policy
- `cans.scope.prohibited_actions` -- string array for Layer 1 deny list
- `cans.scope.institutional_limitations` -- string array for Layer 3 injection
- `cans.autonomy.*` -- per-action autonomy tiers for Layer 5 evaluation
- `cans.provider.*` -- provider identity for Layer 3 injection

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenClaw `before_tool_call` not wired | Wired via PR #6570 | ~2026-02 | Phase 3 can now rely on hook firing (with canary fallback) |
| Hardening as stubs only | Phase 3 implements | Current phase | All 7 HARD requirements addressed |
| Canary in entry/openclaw.ts | Canary in hardening engine | Phase 3 | Single owner of hook lifecycle |

**Key context change since Phase 1 research:**
- The `before_tool_call` hook was documented as potentially unimplemented (issue #6535). PR #6570 reportedly wired it. The canary test (HARD-07) remains essential as a runtime verification that the hook actually fires in the provider's specific OpenClaw version. The architecture does NOT assume the hook works -- it verifies and degrades gracefully.

## Layer-by-Layer Implementation Guide

### Layer 1: Tool Policy Lockdown (HARD-01)
- **Input:** `ToolCallEvent.toolName` matched against `cans.scope.permitted_actions` and `cans.scope.prohibited_actions`
- **Decision logic:** prohibited trumps permitted; if not in either list, deny by default (allowlist model)
- **CANS flag:** `cans.hardening.tool_policy_lockdown`
- **Test cases:** tool in permitted list (allow), tool in prohibited list (deny), tool in neither list (deny), flag disabled (allow all)

### Layer 2: Exec Allowlist (HARD-02)
- **Input:** `ToolCallEvent.params.command` parsed to extract binary path
- **Decision logic:** first token of command matched against allowlist Set
- **CANS flag:** `cans.hardening.exec_approval`
- **Allowlist:** Conservative set of read-only binaries; extensible in future
- **Test cases:** allowed binary (allow), disallowed binary (deny), non-exec tool (pass-through), flag disabled (allow all), empty command (deny)

### Layer 3: CANS Protocol Injection (HARD-03)
- **Mechanism:** `adapter.onAgentBootstrap()` -> `context.addFile('CAREAGENT_PROTOCOL.md', rules)`
- **Content:** Concise clinical hard rules extracted from CANS (< 500 tokens)
- **CANS flag:** `cans.hardening.cans_protocol_injection`
- **Note:** This layer acts at bootstrap time, not per-tool-call. It is wired during `engine.activate()`, not during `engine.check()`. However, the engine's `injectProtocol()` method provides the extraction logic.
- **Test cases:** injection content includes prohibited actions, autonomy tiers, scope boundaries; flag disabled skips injection

### Layer 4: Docker Sandbox (HARD-04)
- **Mechanism:** File existence checks (`/.dockerenv`, `/proc/1/cgroup`), environment variable check
- **Decision logic:** If `docker_sandbox` flag is true and container IS detected, log sandbox active. If container is NOT detected, log degraded and allow (do not block).
- **CANS flag:** `cans.hardening.docker_sandbox`
- **Note:** This layer does not block tool calls. It provides a detection/reporting function. Future versions could enforce "refuse to run clinical tools outside sandbox."
- **Test cases:** container detected (report active), no container (report degraded), flag disabled (pass-through)

### Layer 5: Safety Guard (HARD-05)
- **Mechanism:** `adapter.onBeforeToolCall()` handler calls `engine.check()` which evaluates all layers
- **Decision logic:** Composite result of all layers 1-4 plus scope validation against autonomy tiers
- **CANS flag:** `cans.hardening.safety_guard`
- **Graceful degradation:** If the hook is not wired (standalone adapter, old OpenClaw), the safety guard never fires. The canary detects this.
- **Test cases:** within scope (allow), outside scope (deny), autonomy tier "manual" for perform actions (deny unless provider-approved)

### Layer 6: Audit Trail Integration (HARD-06)
- **Mechanism:** Engine calls `audit.log()` for every layer result, `audit.logBlocked()` for denials
- **Fields used:** `blocking_layer`, `blocked_reason`, `action_state: 'system-blocked'`
- **CANS flag:** `cans.hardening.audit_trail` (when false, audit still runs but marks entries as "audit_trail disabled")
- **Note:** Audit should always be written even if the flag is false. The flag controls whether the provider consented to audit, but the system needs the log regardless.
- **Test cases:** allowed action produces audit entry with layer name, denied action produces audit entry with blocking_layer and blocked_reason, every layer produces at least one audit entry per check

### Canary Test (HARD-07)
- **Mechanism:** On first `before_tool_call` invocation, mark canary as verified. 30s timeout warns if never fired.
- **Integration:** Canary is part of the engine lifecycle. Set up during `activate()`, verified on first `check()` call from the hook.
- **Test cases:** canary fires on first tool call (verified log), canary does not fire within timeout (warning log), canary integrates with engine lifecycle

## Execution Order Recommendation

The planner should structure tasks in this order:

1. **Expand types + create layer directory structure** -- Add `ToolCallEvent` to `check()` signature, create `src/hardening/layers/` directory, define layer function signatures
2. **Implement layers 1-2** (tool policy + exec allowlist) -- Stateless, independently testable, no hook dependency
3. **Implement layer 3** (CANS injection) -- Requires `BootstrapContext` mock in tests
4. **Implement layer 4** (Docker detection) -- Filesystem checks, independent of hooks
5. **Implement engine orchestrator** -- Composes layers, manages canary, registers hooks via adapter
6. **Implement layer 5 integration** (safety guard wiring) -- Engine's `check()` is called from `before_tool_call` handler
7. **Implement layer 6** (audit bridge) -- Engine logs every decision; verify audit entries in integration tests
8. **Wire into entry/openclaw.ts** -- Replace canary block with engine activation
9. **Comprehensive integration tests** -- End-to-end: CANS active -> tool call -> layers evaluated -> audit entries written

Steps 1-4 are parallelizable in pairs (1+3, 2+4). Steps 5-7 are sequential. Step 8 depends on 5-7. Step 9 depends on everything.

## Open Questions

1. **Should the exec allowlist be configurable in CANS.md?**
   - What we know: The base allowlist is a hardcoded Set of safe binaries. Different specialties may need different binaries.
   - What's unclear: Whether to add a `cans.hardening.exec_allowlist` array field to the schema now or defer to a future phase.
   - Recommendation: Defer to Phase 5 (CANS continuous improvement). Use the hardcoded base allowlist for now. Log all denials so the provider can identify gaps. The schema expansion would require a CANS.md re-generation or manual edit, which is beyond Phase 3's scope.

2. **Should Layer 4 (Docker) block or just report?**
   - What we know: The current requirement says "when available, CareAgent activates OpenClaw's Docker sandbox." But CareAgent cannot "activate" Docker -- it can only detect whether it is already running in a container.
   - What's unclear: Whether Layer 4 should block tool calls when NOT in Docker (enforcing sandbox requirement) or just report the sandbox status.
   - Recommendation: Report-only for now. Log `allowed: true` with a reason indicating sandbox status. Future phases could add a `require_sandbox: true` flag to enforce "refuse to run clinical tools outside Docker."

3. **How does `entry/standalone.ts` integrate with the hardening engine?**
   - What we know: Standalone adapter no-ops all hook methods. The engine can still be activated (it won't crash), but hooks won't fire.
   - What's unclear: Whether standalone mode should activate the engine at all (for Layers 1 and 2, which don't need hooks) or skip hardening entirely.
   - Recommendation: Activate the engine in standalone mode too. Layers 1-4 work without hooks. Layer 5 (safety guard) degrades naturally because the hook never fires. The canary will warn. This provides partial protection in standalone mode rather than no protection.

## Sources

### Primary (HIGH confidence)
- Direct codebase examination of all source files in `src/hardening/`, `src/adapters/`, `src/audit/`, `src/activation/`, `src/entry/`
- `src/adapters/types.ts` -- `ToolCallEvent`, `ToolCallHandler`, `BootstrapContext`, `PlatformAdapter` interfaces (verified by reading)
- `src/audit/pipeline.ts` -- `AuditPipeline.log()`, `logBlocked()`, `createTraceId()` methods (verified by reading)
- `src/activation/cans-schema.ts` -- `HardeningSchema`, `ScopeSchema`, `AutonomySchema` types (verified by reading)
- `src/entry/openclaw.ts` -- Current canary implementation, hook registration patterns (verified by reading)
- `test/unit/hardening/hardening.test.ts` -- Existing stub tests (verified by reading + running)
- `test/integration/plugin.test.ts` -- Mock API patterns, integration test structure (verified by reading)
- `.planning/REQUIREMENTS.md` -- HARD-01 through HARD-07 definitions
- `.planning/ROADMAP.md` -- Phase 3 success criteria
- `.planning/STATE.md` -- Key decisions (adapter layer, hash chaining, canary test)

### Secondary (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` -- Hardening stack architecture, layer ordering, data flow paths
- `.planning/research/PITFALLS.md` -- Pitfall 1 (prompt injection), Pitfall 5 (before_tool_call dependency), Pitfall 4 (audit integrity)
- `.planning/phases/02.1-architectural-alignment/02.1-RESEARCH.md` -- Stub module patterns, interface design decisions

### Tertiary (MEDIUM confidence -- from Phase 1 research, not re-verified)
- OpenClaw `before_tool_call` hook (PR #6570) -- Assumed wired based on Phase 1 research. Canary test verifies at runtime.
- Docker container detection via `/.dockerenv` -- Standard detection method, not verified against all container runtimes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; everything already in codebase
- Architecture: HIGH -- layer composition pattern derived directly from existing interfaces and types
- Layer implementation: HIGH -- each layer's inputs and outputs are fully defined by existing types
- Integration points: HIGH -- exact files to change and exact code to replace are identified
- Pitfalls: HIGH -- derived from direct code inspection and prior phase research
- Docker detection: MEDIUM -- `/.dockerenv` is standard but not universal across all container runtimes

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable -- internal implementation, not dependent on external ecosystem changes)
