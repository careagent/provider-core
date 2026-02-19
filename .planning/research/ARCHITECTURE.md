# Architecture Patterns

**Domain:** Clinical activation layer plugin for AI agent platform (OpenClaw)
**Researched:** 2026-02-17
**Overall confidence:** MEDIUM-HIGH

## Recommended Architecture

CareAgent is a **single npm package** (`@careagent/provider-core`) that extends OpenClaw through its plugin system. It is NOT a standalone application. The architecture must respect one absolute boundary: CareAgent extends OpenClaw; it never contains, wraps, or forks it.

The plugin decomposes into seven internal components that register into four OpenClaw extension points (CLI commands, hooks, tools, background services). Activation is binary: CANS.md present = clinical layer active; CANS.md absent = plugin is inert.

```
+-------------------------------------------------------------------+
|                        OpenClaw Gateway                            |
|                                                                    |
|  Workspace Files        Plugin System         Skill System         |
|  +-----------+     +------------------+    +----------------+      |
|  | SOUL.md   |     | Plugin Loader    |    | workspace/     |      |
|  | AGENTS.md |     | Plugin Registry  |    |   skills/      |      |
|  | USER.md   |     | Hook Runner      |    |   SKILL.md     |      |
|  | TOOLS.md  |     | Tool Policies    |    |   package.json |      |
|  +-----------+     +------------------+    +----------------+      |
|        ^                    ^                       ^               |
|        |                    |                       |               |
|  ======|====================|=======================|========       |
|        |        PLUGIN BOUNDARY (peer dependency)   |               |
|  ======|====================|=======================|========       |
|        |                    |                       |               |
|  +-----|--------------------|-----------------------|----------+    |
|  |     v                    v                       v          |    |
|  |              @careagent/provider-core                                |    |
|  |                                                             |    |
|  |  +------------------+  +-------------------+               |    |
|  |  | 1. Plugin Shell  |  | 2. Activation     |               |    |
|  |  |   register(api)  |  |    Gate            |               |    |
|  |  |   manifest       |  |    CANS.md check   |               |    |
|  |  +--------+---------+  +--------+----------+               |    |
|  |           |                      |                          |    |
|  |           v                      v                          |    |
|  |  +------------------+  +-------------------+               |    |
|  |  | 3. Onboarding    |  | 4. Hardening      |               |    |
|  |  |    Engine         |  |    Stack           |               |    |
|  |  |    Interview      |  |    6 layers        |               |    |
|  |  |    CANS generator |  |    tool policy     |               |    |
|  |  +--------+---------+  |    exec approval   |               |    |
|  |           |             |    CANS injection  |               |    |
|  |           |             |    Docker sandbox  |               |    |
|  |           |             |    safety guard    |               |    |
|  |           |             |    audit trail     |               |    |
|  |           |             +--------+----------+               |    |
|  |           |                      |                          |    |
|  |           v                      v                          |    |
|  |  +------------------+  +-------------------+               |    |
|  |  | 5. Clinical Skill|  | 6. Audit          |               |    |
|  |  |    Registry       |  |    Pipeline        |               |    |
|  |  |    credential     |  |    AUDIT.log       |               |    |
|  |  |    gating         |  |    append-only     |               |    |
|  |  |    integrity      |  |    structured      |               |    |
|  |  |    verification   |  |    events          |               |    |
|  |  +------------------+  +-------------------+               |    |
|  |                                                             |    |
|  |  +--------------------------------------------------+      |    |
|  |  | 7. CLI Commands                                   |      |    |
|  |  |    careagent init | careagent status               |      |    |
|  |  +--------------------------------------------------+      |    |
|  +-------------------------------------------------------------+    |
+-------------------------------------------------------------------+
```

### Component Boundaries

| # | Component | Responsibility | Communicates With | OpenClaw Extension Point |
|---|-----------|---------------|-------------------|--------------------------|
| 1 | **Plugin Shell** | Package entry point. Exports `register(api)` function. Declares manifest (`openclaw.extensions`, slots, configSchema). Wires all other components to OpenClaw's plugin registry. | OpenClaw Plugin Loader, all internal components | `openclaw.extensions` in package.json |
| 2 | **Activation Gate** | Checks for CANS.md presence in workspace. Returns parsed credential/scope data or null. Every other component calls this before doing work. Single source of truth for "is clinical mode active?" | Plugin Shell, Hardening Stack, Clinical Skill Registry, Audit Pipeline | None (internal logic) |
| 3 | **Onboarding Engine** | Drives structured interview via CLI. Discovers provider identity, credentials, specialty, clinical philosophy, documentation voice, autonomy preferences. Generates CANS.md. Supplements existing SOUL.md, AGENTS.md, USER.md. | Activation Gate (writes CANS.md), CLI Commands (triggered by `careagent init`), OpenClaw workspace files (reads/writes) | CLI command registration |
| 4 | **Hardening Stack** | Orchestrates six defense layers in sequence. Configures tool policies, wires exec approval rules, injects CANS protocol into agent context, configures Docker sandbox, registers safety guard hook, enables audit logging. | Activation Gate (reads CANS.md credentials), OpenClaw Tool Policies, OpenClaw Exec Approvals, Audit Pipeline, Docker sandbox config | `before_agent_start` hook, `before_tool_call` hook, tool policy configuration |
| 5 | **Clinical Skill Registry** | Discovers, validates, and loads credential-gated clinical skills. Separate from OpenClaw's general skill store. Verifies integrity (checksums), enforces version pinning, gates on CANS.md credentials (license type, specialty, institutional privileges). | Activation Gate (reads credentials for gating), OpenClaw Skill System (injects into TOOLS.md), Audit Pipeline (logs load/deny events) | Skill injection into workspace |
| 6 | **Audit Pipeline** | Append-only event logger. Captures every action, tool invocation, blocked action, skill load, credential check, and safety guard intervention. Writes structured events to AUDIT.log. | All other components (they emit events), filesystem (AUDIT.log) | Background service |
| 7 | **CLI Commands** | `careagent init` (triggers onboarding), `careagent status` (reports activation state, loaded skills, hardening status, audit stats). | Onboarding Engine, Activation Gate, Clinical Skill Registry, Audit Pipeline | CLI command registration |

### Data Flow

Data flows through the system in three distinct paths:

**Path 1: Activation (cold start / session start)**
```
OpenClaw starts
  -> Plugin Loader discovers @careagent/provider-core
    -> register(api) called
      -> Activation Gate checks workspace for CANS.md
        -> IF ABSENT: register CLI commands only, plugin is inert
        -> IF PRESENT: parse CANS.md
          -> Hardening Stack configures all 6 layers
          -> Clinical Skill Registry loads credential-gated skills
          -> Audit Pipeline begins logging
          -> CLI commands register with full capability
```

**Path 2: Runtime (every agent action)**
```
User sends message to agent
  -> before_agent_start hook fires
    -> Hardening Stack injects CANS protocol into context
    -> Audit Pipeline logs session start
  -> Agent processes, decides to use a tool
    -> before_tool_call hook fires
      -> Safety Guard evaluates against CANS scope
        -> ALLOW: tool executes, audit logged
        -> DENY: tool blocked, audit logged, user notified
        -> ASK: exec approval triggered, awaits provider decision
  -> Agent produces output
    -> Audit Pipeline logs completion
```

**Path 3: Onboarding (first-time setup)**
```
Provider runs `careagent init`
  -> Onboarding Engine starts structured interview
    -> Collects: identity, credentials, specialty, philosophy, voice, autonomy
    -> Generates CANS.md in workspace root
    -> Reads existing SOUL.md, AGENTS.md, USER.md
    -> Supplements with clinical personality, scope boundaries, documentation style
    -> Activation Gate detects CANS.md
    -> Hardening Stack activates
    -> Clinical skills load
    -> Audit Pipeline logs onboarding completion
  -> Provider runs `careagent status` to verify
```

## Component Deep Dives

### 1. Plugin Shell

The entry point follows OpenClaw's plugin convention precisely.

**Structure:**
```
@careagent/provider-core/
  package.json          # openclaw.extensions, peer dependency on openclaw
  src/
    index.ts            # exports register(api)
    activation/         # Activation Gate
    onboarding/         # Onboarding Engine
    hardening/          # Hardening Stack (6 layers)
    skills/             # Clinical Skill Registry
    audit/              # Audit Pipeline
    cli/                # CLI Commands
    types/              # Shared TypeScript types
```

**package.json manifest:**
```json
{
  "name": "@careagent/provider-core",
  "openclaw": {
    "extensions": ["./dist/index.js"],
    "configSchema": "./dist/config-schema.js",
    "slots": ["tool"],
    "catalog": {
      "name": "CareAgent",
      "description": "Clinical activation layer"
    }
  },
  "peerDependencies": {
    "openclaw": ">=1.x"
  }
}
```

**Registration pattern (HIGH confidence -- matches ClawBands and OpenClaw docs):**
```typescript
// src/index.ts
import type { PluginAPI } from 'openclaw/plugin-sdk';
import { ActivationGate } from './activation/gate';
import { HardeningStack } from './hardening/stack';
import { ClinicalSkillRegistry } from './skills/registry';
import { AuditPipeline } from './audit/pipeline';
import { OnboardingEngine } from './onboarding/engine';
import { registerCLI } from './cli/commands';

export function register(api: PluginAPI): void {
  const audit = new AuditPipeline(api);
  const gate = new ActivationGate(api);

  // CLI always registers (needed for `careagent init` before CANS exists)
  registerCLI(api, gate, audit);

  // Check activation
  const cans = gate.check();
  if (!cans) {
    audit.log({ type: 'activation', status: 'inactive', reason: 'no CANS.md' });
    return; // Plugin is inert without CANS.md
  }

  // Activate clinical layer
  const hardening = new HardeningStack(api, cans, audit);
  hardening.activate();

  const skills = new ClinicalSkillRegistry(api, cans, audit);
  skills.loadAll();

  audit.log({ type: 'activation', status: 'active', provider: cans.provider.name });
}
```

### 2. Activation Gate

The simplest component, but the most important architectural decision in the system. CANS.md presence is a **binary gate**, not a gradient.

**Design principles:**
- File presence = active. File absence = inert. No partial states.
- CANS.md lives in workspace root (same level as SOUL.md, AGENTS.md).
- Parsed once at startup, cached for session lifetime.
- Schema-validated: if CANS.md exists but is malformed, treat as absent + log error.

**CANS.md structure (Markdown with YAML frontmatter):**
```markdown
---
version: "1.0"
provider:
  name: "Dr. Jane Smith"
  license:
    type: "MD"
    state: "CA"
    number: "A12345"
    verified: false  # Always false in dev -- future Axon verification
  specialty: "Neurosurgery"
  subspecialty: "Spine"
  institution: "University Medical Center"
  privileges:
    - "neurosurgical procedures"
    - "spine surgery"
    - "neurotrauma"
autonomy:
  chart: "autonomous"      # draft without approval
  order: "supervised"       # requires approval before execution
  charge: "supervised"
  perform: "manual"         # never AI-driven
clinical_voice:
  tone: "direct, concise"
  documentation_style: "problem-oriented"
  eponyms: true
  abbreviations: "standard neurosurgery"
---

# Care Agent Nervous System

[Free-form clinical philosophy, scope boundaries, practice patterns]
```

**Validation logic:**
```typescript
export class ActivationGate {
  check(): CANSDocument | null {
    const cansPath = path.join(this.workspacePath, 'CANS.md');
    if (!fs.existsSync(cansPath)) return null;

    const raw = fs.readFileSync(cansPath, 'utf-8');
    const parsed = this.parseFrontmatter(raw);
    const validation = this.validateSchema(parsed);

    if (!validation.valid) {
      this.audit.log({ type: 'activation_error', errors: validation.errors });
      return null; // Malformed = inactive, never partially active
    }

    return parsed as CANSDocument;
  }
}
```

### 3. Onboarding Engine

A structured conversational flow that produces CANS.md. This is NOT a free-form chat -- it is a guided interview with specific data extraction goals.

**Architecture decision: Agent-driven interview, not form-based.**

Rationale: The provider is already in an AI agent context (OpenClaw). The interview should feel natural, not like filling out a form. The onboarding agent uses a structured prompt template but allows conversational flow, extracting structured data from natural responses.

**Interview stages (sequential, each must complete before next):**

| Stage | Extracts | Output Field |
|-------|----------|--------------|
| 1. Identity | Name, credentials, license info | `provider.name`, `provider.license` |
| 2. Specialty | Primary specialty, subspecialty, board certification | `provider.specialty`, `provider.subspecialty` |
| 3. Institution | Practice setting, privileges, scope | `provider.institution`, `provider.privileges` |
| 4. Clinical Philosophy | Practice philosophy, risk tolerance, ethical boundaries | Free-form section |
| 5. Documentation Voice | Tone, style, abbreviation preferences, template preferences | `clinical_voice` |
| 6. Autonomy Preferences | Per-action autonomy tiers (chart/order/charge/perform) | `autonomy` |

**Workspace supplementation:** After generating CANS.md, the onboarding engine reads existing workspace files and appends clinical context:
- SOUL.md: Add clinical personality traits, scope awareness
- AGENTS.md: Add clinical agent capabilities, boundaries
- USER.md: Add provider preferences, communication style

**Critical constraint:** Supplementation is additive only. Never overwrite existing content. Use clearly marked sections (`<!-- CareAgent Clinical Context -->`) so they can be identified and updated.

### 4. Hardening Stack

Six layers, ordered from outermost (coarsest) to innermost (finest). Each layer is independently testable and independently bypassable for debugging.

```
Layer 1: Tool Policy Lockdown (outermost -- prevents tool access)
  Layer 2: Exec Approval Rules (gates command execution)
    Layer 3: CANS Protocol Injection (shapes agent behavior)
      Layer 4: Docker Sandbox (isolates execution environment)
        Layer 5: Safety Guard (real-time action evaluation)
          Layer 6: Audit Trail (innermost -- records everything)
```

| Layer | Mechanism | OpenClaw Integration | When It Acts |
|-------|-----------|---------------------|--------------|
| **1. Tool Policy Lockdown** | Configures OpenClaw's native tool policy system. Denies tools outside clinical scope. Uses `deny` lists derived from CANS.md privileges. | `openclaw.json` tool policy configuration | Before tool resolution |
| **2. Exec Approval Rules** | Configures OpenClaw's native exec approval. Sets `tools.exec.ask: "always"` for clinical sessions. Extends safe binaries list to include clinical-safe read-only tools. | `openclaw.json` exec configuration | Before command execution |
| **3. CANS Protocol Injection** | Injects CANS.md content and clinical behavioral rules into agent system prompt via `before_agent_start` hook. Adds scope boundaries, documentation patterns, autonomy rules. | `before_agent_start` hook | Session initialization |
| **4. Docker Sandbox** | Configures OpenClaw's native Docker sandboxing for clinical sessions. Enforces `network: "none"` for PHI protection. Mounts workspace read-only where possible. | `openclaw.json` sandbox configuration | Container creation |
| **5. Safety Guard** | Registers `before_tool_call` hook handler. Evaluates every proposed tool call against CANS.md scope (credentials, privileges, autonomy tier). Can ALLOW, DENY, or escalate to ASK. | `before_tool_call` hook | Every tool invocation |
| **6. Audit Trail** | Logs every event from all other layers. Append-only. Structured. The innermost layer because it must capture everything, including events from other hardening layers. | Background service | Continuous |

**CRITICAL DEPENDENCY NOTE:** `before_tool_call` hook has type definitions but call sites were missing (issue #6535). PR #6570 implemented it. CareAgent MUST verify this hook fires at runtime. If it does not, the Safety Guard (Layer 5) degrades to a no-op. The system must detect this and warn loudly -- it cannot silently fail. Design the Safety Guard with a "liveness check" that confirms the hook was actually called during the first tool invocation of each session.

```typescript
// Hardening Stack orchestrator
export class HardeningStack {
  activate(): void {
    // Layer 1: Tool policies (OpenClaw native config)
    this.configureToolPolicies(this.cans);

    // Layer 2: Exec approvals (OpenClaw native config)
    this.configureExecApprovals(this.cans);

    // Layer 3: CANS injection (before_agent_start hook)
    this.api.on('before_agent_start', (context) => {
      return this.injectCANSProtocol(context, this.cans);
    });

    // Layer 4: Docker sandbox (OpenClaw native config)
    this.configureSandbox(this.cans);

    // Layer 5: Safety guard (before_tool_call hook)
    this.api.on('before_tool_call', (toolCall) => {
      return this.evaluateSafetyGuard(toolCall, this.cans);
    });

    // Layer 6: Audit trail (always on via AuditPipeline)
    this.audit.log({ type: 'hardening_activated', layers: 6 });
  }
}
```

### 5. Clinical Skill Registry

Separate from OpenClaw's general skill loading. Clinical skills require credential gating that general skills do not.

**Two-tier skill model:**

| Tier | Source | Gating | Verification | Updates |
|------|--------|--------|--------------|---------|
| **General skills** | ClawHub, workspace | None (OpenClaw handles) | None (OpenClaw handles) | Auto-update OK |
| **Clinical skills** | CareAgent clinical registry | CANS.md credentials required | Checksum at install, verify at load | Version-pinned, manual approval |

**Clinical skill structure:**
```
clinical-skills/
  chart-skill/
    SKILL.md          # Skill instructions (injected into TOOLS.md)
    package.json      # Metadata + credential requirements
    checksum.json     # SHA-256 of all skill files at install time
    templates/        # Clinical documentation templates
    src/
      index.ts        # Skill implementation
```

**Credential gating in package.json:**
```json
{
  "careagent": {
    "requires": {
      "license": ["MD", "DO"],
      "specialty": ["Neurosurgery", "Orthopedic Surgery"],
      "privileges": ["neurosurgical procedures"]
    },
    "integrity": {
      "algorithm": "sha256",
      "pinned_version": "1.0.0"
    }
  }
}
```

**Loading flow:**
```
Clinical Skill Registry startup
  -> Discover skills in clinical-skills/ directory
  -> For each skill:
    -> Read package.json credential requirements
    -> Compare against CANS.md credentials
      -> MATCH: proceed to integrity check
      -> NO MATCH: skip, audit log "skill denied: insufficient credentials"
    -> Verify checksum against checksum.json
      -> VALID: load skill, inject into TOOLS.md
      -> INVALID: skip, audit log "skill integrity failure"
    -> Verify version matches pinned version
      -> MATCH: skill is active
      -> MISMATCH: skip, audit log "skill version mismatch"
```

### 6. Audit Pipeline

Event sourcing pattern adapted for clinical compliance. Every significant action produces an immutable, structured audit event.

**Design decisions:**
- **File-based, not database.** AUDIT.log is a JSONL file (one JSON object per line). Simple, portable, inspectable with standard tools. No database dependency.
- **Append-only enforcement.** Open file with `O_APPEND | O_WRONLY`. Never read from AUDIT.log during normal operation (only `careagent status` reads it).
- **Structured events.** Every event has: timestamp, event_type, actor, action, target, outcome, session_id, trace_id. Domain-specific fields vary by event type.
- **No production cryptographic integrity yet.** Hash chaining and digital signatures are out of scope per PROJECT.md. The architecture supports adding them later (each event includes a `previous_hash` field that is null for now).

**Event schema:**
```typescript
interface AuditEvent {
  timestamp: string;           // ISO 8601
  event_type: AuditEventType;  // 'tool_call' | 'tool_blocked' | 'skill_loaded' | etc.
  session_id: string;
  trace_id: string;            // Links related events
  actor: string;               // Provider name from CANS.md
  action: string;              // What was attempted
  target: string;              // What was acted upon
  outcome: 'allowed' | 'denied' | 'escalated' | 'error';
  details: Record<string, unknown>; // Event-specific payload
  previous_hash: string | null;     // Future: hash chain integrity
}

type AuditEventType =
  | 'activation'           // Plugin activation/deactivation
  | 'onboarding_start'     // Interview began
  | 'onboarding_complete'  // CANS.md generated
  | 'hardening_activated'  // All 6 layers configured
  | 'tool_call'            // Tool invocation (allowed)
  | 'tool_blocked'         // Tool invocation (denied by safety guard)
  | 'tool_escalated'       // Tool invocation (sent to exec approval)
  | 'skill_loaded'         // Clinical skill loaded successfully
  | 'skill_denied'         // Clinical skill denied (credential mismatch)
  | 'skill_integrity_fail' // Clinical skill checksum mismatch
  | 'session_start'        // Clinical session began
  | 'session_end'          // Clinical session ended
  | 'cans_update_proposed' // Agent proposed CANS.md update
  | 'cans_update_accepted' // Provider accepted CANS.md update
  | 'cans_update_rejected' // Provider rejected CANS.md update
  | 'error';               // System error
```

**AUDIT.log example:**
```jsonl
{"timestamp":"2026-02-17T10:00:00Z","event_type":"activation","session_id":"s1","trace_id":"t1","actor":"system","action":"activate","target":"careagent","outcome":"allowed","details":{"provider":"Dr. Smith","layers":6},"previous_hash":null}
{"timestamp":"2026-02-17T10:00:01Z","event_type":"skill_loaded","session_id":"s1","trace_id":"t1","actor":"system","action":"load_skill","target":"chart-skill","outcome":"allowed","details":{"version":"1.0.0","checksum_valid":true},"previous_hash":null}
{"timestamp":"2026-02-17T10:05:00Z","event_type":"tool_call","session_id":"s2","trace_id":"t2","actor":"Dr. Smith","action":"chart_note","target":"patient_encounter","outcome":"allowed","details":{"skill":"chart-skill","template":"operative_note"},"previous_hash":null}
```

### 7. CLI Commands

Two commands that provide the human interface to CareAgent.

**`careagent init`** -- Triggers onboarding. Only available when CANS.md does NOT exist (otherwise: "CareAgent is already initialized. Run `careagent status` to check configuration.").

**`careagent status`** -- Reports current state. Available always. Output includes:
- Activation state (active/inactive)
- CANS.md summary (provider, specialty, autonomy settings)
- Hardening layers status (all 6, individually: active/degraded/inactive)
- Loaded clinical skills (name, version, credential match)
- Audit stats (event count, last event timestamp, any errors)
- Hook liveness status (did before_tool_call actually fire?)

## Patterns to Follow

### Pattern 1: Graceful Degradation Over Hard Failure

**What:** When an OpenClaw integration point is unavailable (e.g., `before_tool_call` hook not wired), the plugin should degrade gracefully rather than crash.

**When:** Any interaction with OpenClaw's plugin API that may not be available in all versions.

**Why:** OpenClaw is evolving. Hook call sites are being added incrementally (issue #6535). CareAgent must work across versions.

**Implementation:**
```typescript
// Register hook with liveness tracking
let hookFired = false;

api.on('before_tool_call', (toolCall) => {
  hookFired = true;
  return safetyGuard.evaluate(toolCall, cans);
});

// After first tool call in session, check liveness
api.on('before_agent_start', (context) => {
  // Schedule a check after first tool interaction
  setTimeout(() => {
    if (!hookFired) {
      audit.log({
        type: 'error',
        action: 'hook_liveness_check',
        outcome: 'error',
        details: {
          hook: 'before_tool_call',
          message: 'Hook registered but never fired. Safety Guard Layer 5 is DEGRADED.',
          mitigation: 'Relying on Layer 1 (tool policies) and Layer 2 (exec approvals) for safety.'
        }
      });
      // Surface warning to provider
      context.warn('CareAgent Safety Guard is degraded: before_tool_call hook not active in this OpenClaw version.');
    }
  }, 30000); // Check after 30 seconds
});
```

### Pattern 2: Configuration Over Code for OpenClaw Native Features

**What:** Use OpenClaw's configuration system (`openclaw.json`) for features it natively supports (tool policies, exec approvals, sandbox settings). Reserve hooks and custom code for CareAgent-specific logic.

**When:** Implementing hardening layers 1, 2, and 4.

**Why:** Native configuration is more stable than hook-based interception. It survives OpenClaw updates. It leverages OpenClaw's own policy resolution chain (deny always wins).

**Implementation:**
```typescript
// GOOD: Use OpenClaw's native tool policy system
configureToolPolicies(cans: CANSDocument): void {
  // Write to openclaw.json or use api.config()
  this.api.config.set('tools.policy', {
    deny: this.deriveBlockedTools(cans),
    allow: this.deriveClinicalTools(cans),
  });
}

// BAD: Re-implementing tool blocking in a hook
// This fights OpenClaw rather than extending it
```

### Pattern 3: Emit-and-Forget Audit Events

**What:** Every component emits audit events to the pipeline without waiting for confirmation. The audit pipeline handles buffering and writing.

**When:** All audit event emission throughout the system.

**Why:** Audit logging must never block clinical workflows. A slow disk write should not delay the provider's work.

**Implementation:**
```typescript
export class AuditPipeline {
  private buffer: AuditEvent[] = [];
  private writeStream: fs.WriteStream;

  log(event: Partial<AuditEvent>): void {
    const full = this.enrich(event); // Add timestamp, session_id, trace_id
    this.buffer.push(full);
    this.flush(); // Non-blocking
  }

  private flush(): void {
    while (this.buffer.length > 0) {
      const event = this.buffer.shift()!;
      this.writeStream.write(JSON.stringify(event) + '\n');
    }
  }
}
```

### Pattern 4: Schema-First CANS.md

**What:** Define CANS.md structure as a TypeBox schema (matching OpenClaw's convention). Validate at parse time. Type-safe throughout the codebase.

**When:** CANS.md parsing, onboarding generation, runtime access.

**Why:** Malformed CANS.md must never partially activate the clinical layer. Schema validation is the single gate.

```typescript
import { Type, Static } from '@sinclair/typebox';

const CANSSchema = Type.Object({
  version: Type.String(),
  provider: Type.Object({
    name: Type.String(),
    license: Type.Object({
      type: Type.Union([Type.Literal('MD'), Type.Literal('DO'), Type.Literal('NP'), Type.Literal('PA')]),
      state: Type.String(),
      number: Type.String(),
      verified: Type.Boolean(),
    }),
    specialty: Type.String(),
    // ...
  }),
  autonomy: Type.Object({
    chart: Type.Union([Type.Literal('autonomous'), Type.Literal('supervised'), Type.Literal('manual')]),
    order: Type.Union([Type.Literal('autonomous'), Type.Literal('supervised'), Type.Literal('manual')]),
    charge: Type.Union([Type.Literal('autonomous'), Type.Literal('supervised'), Type.Literal('manual')]),
    perform: Type.Union([Type.Literal('autonomous'), Type.Literal('supervised'), Type.Literal('manual')]),
  }),
  // ...
});

type CANSDocument = Static<typeof CANSSchema>;
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Wrapping OpenClaw's Execution

**What:** Intercepting OpenClaw's core execution loop by wrapping or monkey-patching internal functions.

**Why bad:** Breaks on OpenClaw updates. Creates invisible coupling. Violates "extend, don't fork."

**Instead:** Use only documented extension points: hooks, tool registration, skill injection, configuration. If a needed hook doesn't exist, file an issue upstream and design for graceful degradation until it's available.

### Anti-Pattern 2: Storing Clinical State Outside CANS.md

**What:** Spreading clinical configuration across multiple files, environment variables, or databases.

**Why bad:** CANS.md is the single activation gate. If clinical state lives elsewhere, the binary gate property breaks. You get partial activation states that are impossible to reason about.

**Instead:** Everything clinical goes in CANS.md or derives from it at runtime. Supplementary workspace files (SOUL.md additions) are presentation-only -- they don't gate behavior.

### Anti-Pattern 3: Synchronous Audit Blocking

**What:** Making tool execution wait for audit log writes to complete before proceeding.

**Why bad:** Disk I/O latency directly impacts clinical workflow speed. Provider frustration leads to disabling the system.

**Instead:** Emit-and-forget pattern with buffered writes. Accept the theoretical risk of losing the last few events on a crash in exchange for never blocking the provider.

### Anti-Pattern 4: Hardcoding Clinical Domain Knowledge

**What:** Embedding specialty-specific medical knowledge (drug interactions, procedure codes, anatomy) directly in plugin code.

**Why bad:** The plugin is a clinical activation *layer*, not a clinical knowledge *base*. Hardcoded domain knowledge becomes stale, wrong, or scope-inappropriate. It makes the plugin specialty-specific rather than specialty-agnostic.

**Instead:** Clinical domain knowledge lives in clinical skills, CANS.md scope definitions, and the LLM's training data. The plugin provides the *framework* for clinical behavior; skills provide the *content*.

### Anti-Pattern 5: Building a Custom Permission System

**What:** Implementing custom RBAC, ACL, or permission logic inside CareAgent.

**Why bad:** OpenClaw already has a layered tool policy system with "deny always wins" semantics and per-agent overrides. Duplicating this creates conflicts and confusion.

**Instead:** Map clinical credential requirements to OpenClaw's native tool policy configuration. Use CANS.md credentials to *derive* tool policy rules, then let OpenClaw enforce them.

## Build Order (Dependency-Driven)

Components must be built in dependency order. Each phase produces a testable, demonstrable artifact.

```
Phase 1: Plugin Shell + Activation Gate + Audit Pipeline
   |
   |  (These three have zero dependencies on each other beyond
   |   basic wiring. They form the skeleton everything else attaches to.)
   |
Phase 2: CLI Commands + Onboarding Engine
   |
   |  (Requires Plugin Shell for registration, Activation Gate for
   |   CANS.md generation, Audit Pipeline for logging. Can't build
   |   hardening until we can generate CANS.md.)
   |
Phase 3: Hardening Stack (all 6 layers)
   |
   |  (Requires CANS.md to exist, which requires onboarding.
   |   Layers 1-4 use OpenClaw native config.
   |   Layer 5 uses before_tool_call hook.
   |   Layer 6 is the Audit Pipeline from Phase 1.)
   |
Phase 4: Clinical Skill Registry + chart-skill
   |
   |  (Requires hardening to be active -- skills should never load
   |   into an unhardened environment. chart-skill is the first
   |   concrete clinical skill, proving the registry works.)
   |
Phase 5: End-to-End Integration + Polish
   |
   |  (Full flow: fresh OpenClaw -> install -> init -> onboarding ->
   |   hardening -> skill loading -> clinical work -> audit verification.
   |   Includes CANS continuous improvement, open-source readiness.)
```

**Rationale for this ordering:**

1. **Plugin Shell + Activation Gate + Audit first** because everything else needs them. You cannot test any component without the ability to register with OpenClaw, check activation state, and log events.

2. **CLI + Onboarding second** because you cannot test hardening or skill loading without a CANS.md, and you cannot generate CANS.md without the onboarding engine.

3. **Hardening third** because clinical skills must NEVER load into an unhardened environment. Building skills before hardening creates a window where unprotected clinical tools could execute.

4. **Clinical skills fourth** because they depend on the full hardening stack being active, CANS.md existing for credential gating, and the audit pipeline for integrity logging.

5. **Integration last** because it's the only phase that requires all other components to exist simultaneously.

## Scalability Considerations

| Concern | Single Provider (MVP) | Multi-Provider (future) | Institutional (future) |
|---------|----------------------|------------------------|----------------------|
| CANS.md | One file per workspace | One file per agent workspace | Institutional CANS template + per-provider overrides |
| Audit log | Single AUDIT.log file | Per-provider AUDIT.log | Centralized audit service (Axon) |
| Skill registry | Local directory | Shared clinical skill registry | Institutional skill governance |
| Hardening | Per-workspace config | Per-agent hardening profiles | Institutional security policies |
| Credential verification | Self-attested | Peer-verified | Axon credentialing infrastructure |

The MVP architecture (single provider, single workspace) is deliberately simple. The component boundaries are drawn so that each concern can be independently scaled without restructuring the others. The Activation Gate abstraction is the key: today it reads a local file; tomorrow it could query an Axon credentialing service. The rest of the system only sees a `CANSDocument` object.

## Plugin Boundary Contract

The most critical architectural decision is what CareAgent owns versus what OpenClaw owns. Violating this boundary creates coupling that breaks on upstream updates.

| Capability | Owner | CareAgent's Role |
|-----------|-------|-----------------|
| Plugin loading & discovery | OpenClaw | Provide correct manifest |
| Tool policy enforcement | OpenClaw | Configure policies via `openclaw.json` or API |
| Exec approval prompts | OpenClaw | Configure approval rules |
| Docker sandbox lifecycle | OpenClaw | Configure sandbox settings |
| Hook execution | OpenClaw | Register handlers |
| Skill injection into TOOLS.md | OpenClaw | Place skills in correct directory with SKILL.md |
| Workspace file management | OpenClaw | Read existing files, supplement with marked sections |
| Agent system prompt | OpenClaw | Inject via `before_agent_start` hook |
| **CANS.md schema & lifecycle** | **CareAgent** | Full ownership |
| **Clinical credential gating** | **CareAgent** | Full ownership |
| **Clinical skill integrity** | **CareAgent** | Full ownership |
| **Onboarding interview** | **CareAgent** | Full ownership |
| **Audit event schema & pipeline** | **CareAgent** | Full ownership |
| **Safety guard evaluation logic** | **CareAgent** | Full ownership |

**Rule of thumb:** If OpenClaw already does it, configure it. If it's clinical-specific, own it.

## Sources

- [OpenClaw GitHub Repository](https://github.com/openclaw/openclaw) - Plugin system, workspace architecture (HIGH confidence)
- [OpenClaw Plugin System - DeepWiki](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins) - Plugin SDK, manifest system, integration slots (HIGH confidence)
- [OpenClaw Tool Security and Sandboxing - DeepWiki](https://deepwiki.com/openclaw/openclaw/6.2-tool-security-and-sandboxing) - Tool policies, exec approvals, Docker sandbox (HIGH confidence)
- [ClawBands Security Middleware](https://github.com/SeyZ/clawbands) - Real-world before_tool_call hook usage, security middleware pattern (HIGH confidence)
- [Plugin Hook Issue #6535](https://github.com/openclaw/openclaw/issues/6535) - Hook call site status, PR #6570 for before_tool_call (HIGH confidence)
- [Lakera OpenClaw Skill Security Audit](https://www.lakera.ai/blog/the-agent-skill-ecosystem-when-ai-extensions-become-a-malware-delivery-channel) - Skill ecosystem vulnerabilities, integrity verification needs (HIGH confidence)
- [Engineering AI Agents for Clinical Workflows - arXiv](https://arxiv.org/html/2602.00751v1) - Clean + Event-Driven architecture for clinical AI, governance layers, audit design (MEDIUM confidence)
- [Foundational Architecture for Healthcare AI Agents - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12629813/) - Four-component framework, autonomy levels, safety patterns (MEDIUM confidence)
- [AI Agent Extensibility Patterns - GoCodeo](https://www.gocodeo.com/post/extensibility-in-ai-agent-frameworks-hooks-plugins-and-custom-logic) - Hook system design, plugin interfaces, lifecycle patterns (MEDIUM confidence)
- [Agent Gate Execution Authority](https://github.com/SeanFDZ/agent-gate) - Tool call interception, policy enforcement pattern (MEDIUM confidence)
- [Append-Only Audit Trail Patterns](https://www.designgurus.io/answers/detail/how-do-you-enforce-immutability-and-appendonly-audit-trails) - Event sourcing, immutable logging design (MEDIUM confidence)
