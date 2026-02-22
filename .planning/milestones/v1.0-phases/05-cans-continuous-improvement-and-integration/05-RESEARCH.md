# Phase 5: CANS Continuous Improvement and Integration - Research

**Researched:** 2026-02-19
**Domain:** Usage pattern observation, CANS.md refinement proposals, end-to-end integration testing, security hardening validation
**Confidence:** HIGH

## Summary

Phase 5 has two distinct halves: (1) a refinement engine that observes how the provider actually uses CareAgent, detects divergences from CANS.md declarations, and proposes batched updates with full audit trails; and (2) comprehensive end-to-end integration testing covering the complete install-to-clinical-agent flow, error paths, and adversarial security scenarios against all six hardening layers.

The refinement engine is a self-contained new subsystem (`src/refinement/`) that introduces an observation store, a pattern matcher, a proposal generator, and a proposal presentation/resolution flow. It reads from CANS.md and the audit log, proposes changes, and -- only on explicit provider approval -- writes updates back to CANS.md using the existing `stringifyYAML`, `generateCANSContent`, and `updateKnownGoodHash` infrastructure. Scope fields are explicitly excluded from all proposals.

The integration testing half exercises the complete system built across Phases 1-4 plus the new refinement engine. It requires a realistic synthetic neurosurgeon persona, tests happy/error/adversarial paths, and validates that each hardening layer correctly blocks unauthorized actions. This phase does NOT write user-facing docs (Phase 6 territory) and does NOT implement the Neuron/Protocol stubs (those are v2/ecosystem concerns despite the Phase 5 annotations in the stubs).

**Primary recommendation:** Build the refinement engine as a pure, file-based subsystem with no new dependencies. Store observations as append-only JSONL in `.careagent/observations.jsonl`. Use the existing `parseFrontmatter` + `stringifyYAML` + `updateKnownGoodHash` chain for CANS.md modifications. Integration tests should use real temp workspaces (established pattern) with the synthetic neurosurgeon persona exercising every subsystem.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Watch for ALL observable divergence patterns: voice drift, autonomy tier mismatch, unused credential sections, skill usage frequency, and any other measurable divergence between CANS.md declarations and actual behavior
- Scope of practice is NEVER proposed for change -- scope fields are sacrosanct and off-limits for the refinement engine
- All other CANS.md fields (including identity fields like name/NPI if they look stale) are eligible for proposals
- Require a clear pattern (5+ observations of the same divergence) before generating a proposal -- minimize false positives
- Proactive batched delivery: collect observations during usage and present a batch of proposals at session start or end
- Proposals show BOTH a natural language explanation (WHY the change is suggested) and a diff view (WHAT would change in CANS.md)
- Provider actions on a proposal: Accept, Reject, or Defer (no modify -- accept as-is or reject)
- Batch presentation: show summary list of all pending proposals first, provider picks which to review in detail
- Accepted proposals write to CANS.md immediately -- no additional confirmation step after acceptance
- Rejected proposals can resurface after a higher observation threshold (e.g., 10+ additional observations) with updated evidence
- Deferred proposals persist indefinitely in the queue until the provider explicitly acts on them
- Each proposal includes a human-readable evidence summary explaining the observations that triggered it
- Every proposal lifecycle event (proposed, accepted, rejected, deferred, resurfaced) is recorded in AUDIT.log
- Integration tests cover happy path + error paths + adversarial scenarios
- Security review is automated test scenarios exercising each of the six hardening layers
- Phase 5 verifies the install-to-clinical-agent path works but does NOT write user-facing docs
- Integration tests use a realistic synthetic neurosurgeon persona

### Claude's Discretion
- Observation storage format and persistence mechanism
- Exact re-proposal threshold after rejection (suggested 10+ but Claude can tune)
- Session boundary detection for batched proposal delivery
- Specific adversarial test scenarios beyond the categories above
- Internal architecture of the refinement engine (pattern matcher, observation store, proposal generator)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CANS-08 | CareAgent can propose updates to CANS.md based on observed usage patterns | Refinement engine architecture: observation store + pattern matcher + proposal generator. Observations stored as JSONL, pattern detection via field-specific matchers, proposals generated with natural language explanation + YAML diff |
| CANS-09 | Provider must approve or reject proposed CANS.md changes -- no automatic modifications | Three-action proposal resolution (Accept/Reject/Defer). Accept writes to CANS.md via existing `writeFileSync` + `updateKnownGoodHash`. Reject records in audit and optionally queues for re-proposal. Defer persists in queue indefinitely |
| CANS-10 | Every CANS.md modification (proposed, accepted, rejected) is recorded in AUDIT.log | Existing `AuditPipeline.log()` with action types: `cans_proposal_created`, `cans_proposal_accepted`, `cans_proposal_rejected`, `cans_proposal_deferred`, `cans_proposal_resurfaced` |
| INTG-01 | End-to-end flow works: fresh install -> onboard -> personalized agent -> skills -> docs -> audit | Integration test using temp workspace: create mock API, run register(), verify activation_check=active, skills loaded, audit chain intact |
| INTG-02 | Security review validates all six hardening layers block unauthorized actions | Six targeted test scenarios: (1) prohibited tool blocked, (2) unlisted exec blocked, (3) protocol rules injected, (4) Docker detection reports correctly, (5) safety guard intercepts, (6) all results audit-logged. Plus adversarial: scope violation, audit tampering, skill file modification |
| INTG-03 | A developer can install, run onboarding, and interact with a functional clinical agent by following documentation alone | Automated "smoke test from scratch" that simulates the install-to-interaction path using only the public API. Validates the path works without verifying docs (docs are Phase 6) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:fs | built-in | File I/O for observations, proposals, CANS.md writes | Zero-dep constraint; all existing file ops use this |
| node:crypto | built-in | SHA-256 for integrity hashing after CANS.md updates | Already used by cans-integrity.ts and audit writer |
| @sinclair/typebox | ~0.34.0 | Schema validation for observation and proposal types | Project standard; all schemas use TypeBox |
| yaml (vendored) | ^2.8.2 | YAML parse/stringify for CANS.md round-trips | Already vendored at src/vendor/yaml/; used by cans-parser, cans-generator |
| vitest | ~4.0.0 | Testing framework for unit and integration tests | Project standard; 608 existing tests |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:readline/promises | built-in | Interactive proposal presentation (terminal I/O) | When presenting proposal batches in CLI mode |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONL file for observations | SQLite | SQLite would add a dependency; JSONL is append-only and aligns with audit log pattern |
| Separate proposal queue file | Embedded in observation store | Separate file is cleaner; proposals have different lifecycle than raw observations |

**Installation:**
```bash
# No new dependencies needed -- zero-dep constraint
# All required functionality comes from Node.js built-ins and existing vendored packages
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── refinement/                  # NEW — Phase 5
│   ├── index.ts                 # Public API re-exports
│   ├── types.ts                 # Observation, Proposal, ProposalResolution types
│   ├── observation-store.ts     # Append-only JSONL observation storage
│   ├── pattern-matcher.ts       # Divergence detection per CANS field category
│   ├── proposal-generator.ts    # Creates proposals from detected patterns
│   ├── proposal-queue.ts        # Manages proposal lifecycle (pending/accepted/rejected/deferred)
│   └── refinement-engine.ts     # Top-level orchestrator composing all components
├── entry/
│   ├── openclaw.ts              # MODIFIED — wire refinement engine (Step 7)
│   ├── standalone.ts            # MODIFIED — expose refinement on ActivateResult
│   └── core.ts                  # MODIFIED — re-export refinement types
├── cli/
│   └── commands.ts              # MODIFIED — add `careagent proposals` command
test/
├── unit/
│   └── refinement/              # NEW — unit tests for each refinement component
│       ├── observation-store.test.ts
│       ├── pattern-matcher.test.ts
│       ├── proposal-generator.test.ts
│       ├── proposal-queue.test.ts
│       └── refinement-engine.test.ts
├── integration/
│   ├── refinement.test.ts       # NEW — refinement end-to-end
│   ├── e2e-flow.test.ts         # NEW — INTG-01 full flow
│   └── security-review.test.ts  # NEW — INTG-02 hardening validation
```

### Pattern 1: Observation Store (Append-Only JSONL)
**What:** Store usage observations as append-only JSONL in `.careagent/observations.jsonl`, mirroring the audit log pattern.
**When to use:** For all usage pattern recording.
**Example:**
```typescript
// Follows the same pattern as AuditWriter
interface Observation {
  timestamp: string;
  session_id: string;
  category: ObservationCategory; // 'voice' | 'autonomy' | 'credential' | 'skill_usage' | 'identity'
  field_path: string;            // e.g., 'clinical_voice.tone', 'autonomy.chart'
  declared_value: unknown;       // What CANS.md says
  observed_value: unknown;       // What the provider actually did
  context?: string;              // Optional context about the observation
}

class ObservationStore {
  private readonly storePath: string;

  constructor(workspacePath: string) {
    this.storePath = join(workspacePath, '.careagent', 'observations.jsonl');
  }

  append(obs: Observation): void {
    appendFileSync(this.storePath, JSON.stringify(obs) + '\n', { flag: 'a' });
  }

  // Read all observations, optionally filtered by category or field_path
  query(filter?: { category?: string; field_path?: string }): Observation[] {
    // Read JSONL, parse lines, apply filter
  }
}
```

### Pattern 2: Pattern Matcher (Field-Category Divergence Detection)
**What:** Detect when 5+ observations show the same divergence between CANS.md declarations and actual usage.
**When to use:** Called during proposal generation (session boundary or explicit check).
**Example:**
```typescript
interface DivergencePattern {
  field_path: string;
  category: ObservationCategory;
  observation_count: number;
  declared_value: unknown;
  most_common_observed: unknown;  // The value the provider actually uses most
  evidence_summary: string;       // Human-readable explanation
}

// Group observations by field_path, count divergences, threshold at 5+
function detectDivergences(
  observations: Observation[],
  existingProposals: Proposal[],
  threshold: number = 5,
): DivergencePattern[] {
  // Group by field_path
  // Count observations where declared !== observed
  // Filter to groups with count >= threshold
  // Exclude fields that already have pending/deferred proposals
  // Exclude scope fields (NEVER propose scope changes)
}
```

### Pattern 3: Proposal with Diff View
**What:** Generate proposals that show both natural language explanation and YAML diff.
**When to use:** When a divergence pattern crosses the threshold.
**Example:**
```typescript
interface Proposal {
  id: string;                    // UUID
  created_at: string;
  field_path: string;
  category: ObservationCategory;
  current_value: unknown;
  proposed_value: unknown;
  evidence_summary: string;      // Human-readable: "5 of your last 8 progress notes used..."
  observation_count: number;
  status: 'pending' | 'accepted' | 'rejected' | 'deferred';
  resolved_at?: string;
  rejection_count?: number;      // How many times this field has been rejected
}

// Diff view generation: show current vs proposed as unified diff
function generateDiffView(proposal: Proposal): string {
  return [
    `--- CANS.md (current)`,
    `+++ CANS.md (proposed)`,
    `@@ ${proposal.field_path} @@`,
    `- ${formatValue(proposal.current_value)}`,
    `+ ${formatValue(proposal.proposed_value)}`,
  ].join('\n');
}
```

### Pattern 4: CANS.md Write-Back (Reuse Existing Infrastructure)
**What:** When a proposal is accepted, modify CANS.md using the existing parse/modify/write/hash chain.
**When to use:** On provider acceptance of a proposal.
**Example:**
```typescript
// Reuse existing infrastructure:
// 1. parseFrontmatter() to read current CANS.md
// 2. Deep-merge the proposed change into the parsed document
// 3. stringifyYAML() to serialize back
// 4. writeFileSync() for atomic write
// 5. updateKnownGoodHash() to reseed integrity hash

function applyProposal(
  workspacePath: string,
  proposal: Proposal,
  audit: AuditPipeline,
): void {
  const cansPath = join(workspacePath, 'CANS.md');
  const raw = readFileSync(cansPath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);

  // Apply the field change via dot-path navigation
  setNestedValue(frontmatter!, proposal.field_path, proposal.proposed_value);

  // Re-validate against CANSSchema before writing
  if (!Value.Check(CANSSchema, frontmatter)) {
    throw new Error('Proposed change would create invalid CANS.md');
  }

  // Write back
  const yaml = stringifyYAML(frontmatter);
  const content = `---\n${yaml}---\n\n${body}`;
  writeFileSync(cansPath, content, 'utf-8');
  updateKnownGoodHash(workspacePath, content);

  // Audit
  audit.log({
    action: 'cans_proposal_accepted',
    actor: 'provider',
    outcome: 'allowed',
    action_state: 'provider-approved',
    details: {
      proposal_id: proposal.id,
      field_path: proposal.field_path,
      old_value: proposal.current_value,
      new_value: proposal.proposed_value,
    },
  });
}
```

### Pattern 5: Scope Field Protection
**What:** Hard-coded exclusion of scope fields from all proposal generation.
**When to use:** As a safety invariant in the pattern matcher.
**Example:**
```typescript
// These field paths are NEVER eligible for proposals
const SACROSANCT_FIELDS = new Set([
  'scope',
  'scope.permitted_actions',
  'scope.prohibited_actions',
  'scope.institutional_limitations',
]);

function isScopeField(fieldPath: string): boolean {
  return fieldPath.startsWith('scope.') || fieldPath === 'scope';
}

// Called in detectDivergences() as an invariant check
// Also called in applyProposal() as a safety net
```

### Pattern 6: Integration Test Workspace Pattern
**What:** Real temp workspaces with synthetic neurosurgeon persona for E2E testing.
**When to use:** For all integration tests (established in Phases 1-4).
**Example:**
```typescript
// Follows the same mkdtempSync pattern established across 7 integration test files
function createE2EWorkspace(): { dir: string; api: MockAPI; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'careagent-e2e-'));
  // Write CANS.md with synthetic neurosurgeon data
  createCANSFile(dir, syntheticNeurosurgeonCANS);
  // Create mock API
  const api = createMockAPI(dir);
  return {
    dir,
    api,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
```

### Anti-Patterns to Avoid
- **Automatic CANS.md modification:** NEVER modify CANS.md without explicit provider approval. The refinement engine proposes; only the provider approves.
- **Scope field proposals:** NEVER generate proposals for `scope.*` fields. This is a safety invariant, not a preference.
- **In-memory-only observations:** Observations MUST persist to disk. Loss of observations means loss of pattern detection accuracy.
- **Blocking proposal presentation:** Proposals should be presented at session boundaries (start/end), not interrupting active clinical work.
- **Hash chain breakage:** After any CANS.md write, `updateKnownGoodHash()` MUST be called atomically. Forgetting this causes false tamper alerts on next load.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML round-tripping | Custom YAML parser | Vendored `yaml` package (`parseYAML`/`stringifyYAML`) | YAML 1.2 edge cases (Norway problem, implicit types) are landmines |
| Schema validation | Manual field checking | TypeBox `Value.Check()` + `Value.Errors()` | Already used everywhere; catches schema drift automatically |
| Hash integrity | Custom hash chain | Existing `updateKnownGoodHash()` from cans-integrity.ts | Already handles first-load trust, store path, atomic writes |
| Audit logging | Direct file writes | `AuditPipeline.log()` | Hash chaining, session/trace IDs, schema enforcement already built |
| CANS.md parsing | RegExp frontmatter extraction | `parseFrontmatter()` from cans-parser.ts | Handles edge cases (empty blocks, malformed delimiters, non-object YAML) |
| Diff generation | Full unified diff library | Simple field-level before/after display | Proposals change one field at a time; full diff is overkill |

**Key insight:** Phase 5's refinement engine should compose existing subsystems (audit, activation, cans-integrity, yaml vendor) rather than reimplementing any of their concerns. The write-back path for accepted proposals reuses exactly the same chain that onboarding uses: parse -> modify -> stringify -> write -> hash-update.

## Common Pitfalls

### Pitfall 1: YAML Round-Trip Fidelity
**What goes wrong:** Parsing YAML, modifying one field, and re-stringifying can reorder keys, strip comments, change quoting style, or alter whitespace, creating a noisy diff that confuses the provider.
**Why it happens:** The `yaml` package does not preserve formatting by default.
**How to avoid:** Accept that re-stringification will normalize formatting. The CANS.md file is machine-generated (onboarding creates it), so consistent formatting is fine. Document this behavior. Validate the result against CANSSchema before writing.
**Warning signs:** Provider complaints about "unexpected changes" in CANS.md after accepting a single-field proposal.

### Pitfall 2: Observation Store Unbounded Growth
**What goes wrong:** The observations.jsonl file grows indefinitely as the provider uses CareAgent over months/years, eventually causing slow reads.
**Why it happens:** Append-only stores without compaction grow forever.
**How to avoid:** Implement a simple compaction strategy: after a proposal is resolved, observations that contributed to it can be archived or summarized. Alternatively, read only the last N observations for pattern detection. Start simple (read all), add compaction if needed.
**Warning signs:** `detectDivergences()` taking >100ms on a large observation file.

### Pitfall 3: Integrity Hash Desync After CANS.md Modification
**What goes wrong:** Writing to CANS.md without calling `updateKnownGoodHash()` causes the activation gate to detect a "tampered" file on next load, blocking clinical mode.
**Why it happens:** The integrity check compares file content hash against the stored known-good hash. Any write changes the file hash.
**How to avoid:** Always call `updateKnownGoodHash(workspacePath, content)` immediately after `writeFileSync(cansPath, content)`. This is already the pattern in `review.ts` (onboarding). Follow it exactly.
**Warning signs:** "SHA-256 hash mismatch" error on startup after accepting a proposal.

### Pitfall 4: Race Condition Between Proposal Resolution and Active Session
**What goes wrong:** Provider accepts a proposal that changes an autonomy tier while a skill is actively using the old tier, causing inconsistent behavior within a session.
**Why it happens:** CANS.md is read once at activation; mid-session changes are not reflected until next activation.
**How to avoid:** Document that accepted proposals take effect on next session/activation. The current architecture reads CANS.md once at startup (in `ActivationGate.check()`). Changing this to hot-reload is Phase 5 discretion but adds significant complexity for minimal benefit.
**Warning signs:** Provider confusion about why an accepted change "didn't take effect."

### Pitfall 5: False Positive Proposals from Insufficient Context
**What goes wrong:** The system proposes a voice change because it observed "conversational" notes, but the provider was deliberately using a different tone for a specific patient encounter.
**Why it happens:** Individual observations lack context; the 5-observation threshold helps but does not eliminate false positives.
**How to avoid:** The threshold (5+) was chosen to minimize this. Each proposal includes an evidence summary so the provider can evaluate. Rejected proposals raise the bar to 10+ before resurfacing. The Reject action is explicitly designed for this case.
**Warning signs:** High rejection rate on proposals.

### Pitfall 6: Scope Field Leakage
**What goes wrong:** A bug in the pattern matcher or proposal generator creates a proposal that modifies scope fields, violating the sacrosanct constraint.
**Why it happens:** Scope protection is implemented as a filter, and filters can have bugs.
**How to avoid:** Defense in depth: (1) pattern matcher excludes scope observations from divergence detection, (2) proposal generator refuses to create scope proposals, (3) `applyProposal()` has a final safety check that throws if the field_path starts with `scope`. Three layers of protection.
**Warning signs:** Any test that creates a scope-related observation should verify no proposal is generated.

## Code Examples

### Observation Categories and Field Mapping
```typescript
// Source: CONTEXT.md decisions + CANS schema analysis
type ObservationCategory =
  | 'voice'          // clinical_voice.tone, documentation_style, eponyms, abbreviations
  | 'autonomy'       // autonomy.chart, order, charge, perform
  | 'credential'     // provider.credential_status, license fields
  | 'skill_usage'    // skills.rules frequency tracking
  | 'identity';      // provider.name, npi, institution

// Maps observation categories to CANS field paths
const CATEGORY_FIELDS: Record<ObservationCategory, string[]> = {
  voice: [
    'clinical_voice.tone',
    'clinical_voice.documentation_style',
    'clinical_voice.eponyms',
    'clinical_voice.abbreviations',
  ],
  autonomy: [
    'autonomy.chart',
    'autonomy.order',
    'autonomy.charge',
    'autonomy.perform',
  ],
  credential: [
    'provider.credential_status',
    'provider.institution',
  ],
  skill_usage: [
    // Dynamic: skills.rules entries
  ],
  identity: [
    'provider.name',
    'provider.npi',
    'provider.specialty',
    'provider.subspecialty',
  ],
};
```

### Proposal Queue Persistence
```typescript
// Source: Project pattern (JSONL append-only) + CONTEXT.md decisions
// Stored in .careagent/proposals.json (JSON, not JSONL, because proposals are updated in place)
interface ProposalStore {
  proposals: Proposal[];
  last_updated: string;
}

function loadProposalQueue(workspacePath: string): ProposalStore {
  const queuePath = join(workspacePath, '.careagent', 'proposals.json');
  if (!existsSync(queuePath)) {
    return { proposals: [], last_updated: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(queuePath, 'utf-8'));
}

function saveProposalQueue(workspacePath: string, store: ProposalStore): void {
  const queuePath = join(workspacePath, '.careagent', 'proposals.json');
  writeFileSync(queuePath, JSON.stringify(store, null, 2), 'utf-8');
}
```

### Refinement Engine Orchestration
```typescript
// Source: Composed from existing project patterns
interface RefinementEngine {
  /** Record a usage observation. */
  observe(obs: Omit<Observation, 'timestamp' | 'session_id'>): void;

  /** Detect divergence patterns and generate new proposals. */
  generateProposals(): Proposal[];

  /** Get all pending + deferred proposals for presentation. */
  getPendingProposals(): Proposal[];

  /** Resolve a proposal: accept, reject, or defer. */
  resolveProposal(
    proposalId: string,
    action: 'accept' | 'reject' | 'defer',
  ): void;
}

function createRefinementEngine(config: {
  workspacePath: string;
  audit: AuditPipeline;
  sessionId: string;
}): RefinementEngine {
  const store = new ObservationStore(config.workspacePath);
  const queue = loadProposalQueue(config.workspacePath);
  // ...compose components
}
```

### Security Review Test Scenarios (INTG-02)
```typescript
// Source: CONTEXT.md adversarial scenarios + hardening layers analysis
describe('INTG-02: Security Review', () => {
  // Layer 1: Tool policy lockdown
  it('blocks prohibited tools when CANS is active', () => {
    // Create engine, activate with CANS, check a non-permitted tool
    const result = engine.check({ toolName: 'WebSearch', params: {} });
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('tool-policy');
  });

  // Layer 2: Exec allowlist
  it('blocks unlisted exec commands', () => {
    const result = engine.check({ toolName: 'Bash', params: { command: 'rm -rf /' } });
    expect(result.allowed).toBe(false);
    expect(result.layer).toBe('exec-allowlist');
  });

  // Layer 3: CANS protocol injection
  it('injects protocol rules into bootstrap context', () => {
    // Verify onAgentBootstrap handler was registered and adds rules
  });

  // Layer 4: Docker sandbox detection
  it('reports Docker status in audit without blocking', () => {
    // Layer 4 is report-only, never blocks
  });

  // Layer 5: Safety guard (composed via engine)
  it('engine short-circuits on first deny', () => {
    // Submit a tool that fails Layer 1; verify Layer 2 is not evaluated
  });

  // Layer 6: Audit trail integration
  it('every layer result is logged to AUDIT.log', () => {
    // Check audit log for hardening_check entries for all layers
  });

  // Adversarial: scope violation attempt
  it('blocks tool call that would violate scope boundaries', () => {
    // Submit a scope-prohibited action, verify blocked
  });

  // Adversarial: audit log tampering
  it('detects tampered audit log via chain verification', () => {
    // Manually edit an audit log line, verify verifyChain() reports broken
  });

  // Adversarial: skill file modification
  it('rejects skill with modified files', () => {
    // Create skill, tamper with SKILL.md, verify loader rejects it
  });
});
```

### E2E Flow Test (INTG-01)
```typescript
// Source: Existing integration test patterns from plugin.test.ts and skills.test.ts
describe('INTG-01: End-to-End Flow', () => {
  it('fresh workspace -> register -> activate -> skills -> audit', () => {
    // 1. Create temp workspace
    const dir = mkdtempSync(join(tmpdir(), 'careagent-e2e-'));

    // 2. Write CANS.md with synthetic neurosurgeon
    createCANSFile(dir, syntheticNeurosurgeonCANS);

    // 3. Create chart-skill in skills/ directory
    addTestSkill(join(dir, 'skills'), 'chart-skill', neurosurgeonSkillOpts);

    // 4. Register plugin (simulates OpenClaw loading)
    const api = createMockAPI(dir);
    register(api);

    // 5. Verify: activation active
    // 6. Verify: hardening hooks registered
    // 7. Verify: skills loaded
    // 8. Verify: audit trail intact (verifyChain)
    // 9. Verify: audit contains expected entry sequence
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual CANS.md editing | Phase 5 proposal system | This phase | Provider gets suggested improvements rather than manually tracking drift |
| Single-observation triggers | Threshold-based pattern detection (5+) | This phase | Reduces false positives; only confident patterns generate proposals |
| No CANS evolution | Continuous improvement loop | This phase | CANS.md stays aligned with actual provider behavior over time |

**Deprecated/outdated:**
- Neuron/Protocol stubs: Despite the "Phase 5" annotations in `src/neuron/client.ts` and `src/protocol/server.ts`, these are v2 ecosystem features (COMM-01, COMM-02 in v2 requirements). Phase 5 requirements (CANS-08/09/10, INTG-01/02/03) do not include Neuron/Protocol implementation. The stubs should remain as-is.

## Architecture Notes

### What Already Exists (Do Not Rebuild)
1. **CANS.md parsing:** `parseFrontmatter()` in `src/activation/cans-parser.ts` -- handles all edge cases
2. **CANS.md validation:** `Value.Check(CANSSchema, ...)` in `src/activation/gate.ts` -- enforces schema
3. **CANS.md integrity:** `verifyIntegrity()` and `updateKnownGoodHash()` in `src/activation/cans-integrity.ts`
4. **YAML serialization:** `stringifyYAML()` via vendored yaml package
5. **Audit pipeline:** `AuditPipeline` in `src/audit/pipeline.ts` -- hash-chained append-only log
6. **Hardening engine:** `createHardeningEngine()` in `src/hardening/engine.ts` -- 4 layers + canary
7. **Skill loader:** `loadClinicalSkills()` in `src/skills/loader.ts` -- 6-step pipeline
8. **Credential validator:** `createCredentialValidator()` in `src/credentials/validator.ts`
9. **Entry points:** OpenClaw (`src/entry/openclaw.ts`), standalone (`src/entry/standalone.ts`), core (`src/entry/core.ts`)
10. **CLI commands:** `registerCLI()` in `src/cli/commands.ts` -- `careagent init` + `careagent status`

### What Phase 5 Builds New
1. **Refinement engine** (`src/refinement/`) -- observation store, pattern matcher, proposal generator, proposal queue, engine orchestrator
2. **CLI proposal command** -- `careagent proposals` for batch presentation and resolution
3. **Entry point wiring** -- hook refinement engine into openclaw.ts and standalone.ts
4. **Integration test suite** -- E2E flow, security review, developer install path

### CANS.md Write-Back Chain
The critical path for accepted proposals:
```
parseFrontmatter(raw) → modify field → Value.Check(CANSSchema) → stringifyYAML() → writeFileSync() → updateKnownGoodHash()
```
This is identical to the onboarding write chain in `src/onboarding/review.ts` lines 83-95.

### Observation Recording Points
The refinement engine needs observation hooks at these points:
1. **Hardening engine check results** -- when Layer 3 (CANS injection) observes the LLM not following voice/autonomy rules
2. **Skill usage events** -- which skills are loaded and actually used (already audit-logged)
3. **Chart-skill template usage** -- which templates are chosen (voice adapter observations)
4. **Session patterns** -- how the provider interacts (autonomy tier alignment)

Since audit entries already capture much of this data, the observation store can be populated by scanning recent audit entries rather than requiring new hooks throughout the codebase. This is the cleanest integration path.

### Synthetic Neurosurgeon Persona for Integration Tests
Build on the existing `validCANSData` fixture in `test/fixtures/valid-cans-data.ts`:
```typescript
const syntheticNeurosurgeonCANS = {
  ...validCANSData,
  provider: {
    ...validCANSData.provider,
    name: 'Dr. Sarah Chen',
    npi: '1234567890',
    license: { type: 'MD', state: 'TX', number: 'TX-NS-2024-001', verified: false },
    specialty: 'Neurosurgery',
    subspecialty: 'Spine',
    institution: 'University Medical Center',
    privileges: ['neurosurgical procedures', 'spine surgery', 'craniotomy'],
    credential_status: 'active',
  },
  clinical_voice: {
    tone: 'formal',
    documentation_style: 'structured',
    eponyms: true,
    abbreviations: 'standard medical',
  },
};
```

## Open Questions

1. **Session boundary detection for batched proposals**
   - What we know: Proposals should be presented at session start or end, not mid-workflow
   - What's unclear: How does CareAgent detect "session start" vs "session end" in the OpenClaw plugin lifecycle? The `register()` function runs once at plugin load.
   - Recommendation: Use `register()` as session start (check for pending proposals). Provide `careagent proposals` CLI command for on-demand proposal review. Do not attempt "session end" detection (no reliable signal).

2. **Observation collection mechanism**
   - What we know: Many observations can be derived from existing audit log entries rather than requiring new hooks
   - What's unclear: Whether to scan audit entries retroactively or add explicit observation hooks alongside audit logging
   - Recommendation: Start with explicit `observe()` calls at key points (hardening checks, skill loads). Audit log scanning is a future optimization. Keep it simple for v1.

3. **Proposal persistence format**
   - What we know: Proposals are updated in place (status changes), unlike observations which are append-only
   - What's unclear: Whether to use JSON (full read/write cycle) or JSONL with status markers
   - Recommendation: Use a single `proposals.json` file (not JSONL). Proposals are few (typically single-digit count), updated frequently (status changes), and need random access by ID. JSON is the right format for this use case.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis (`src/activation/`, `src/audit/`, `src/hardening/`, `src/skills/`, `src/entry/`, `src/onboarding/`) -- direct code inspection of 30+ source files
- CONTEXT.md decisions from user discussion session
- REQUIREMENTS.md requirement definitions (CANS-08, CANS-09, CANS-10, INTG-01, INTG-02, INTG-03)
- STATE.md project history and accumulated decisions from 25 completed plans

### Secondary (MEDIUM confidence)
- Pattern analysis of 608 existing tests across 42 test files for integration test conventions
- Existing fixture patterns (`test/fixtures/valid-cans-data.ts`) for synthetic persona approach

### Tertiary (LOW confidence)
- None -- all recommendations are grounded in existing codebase patterns and explicit user decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies; everything uses existing built-ins and vendored packages
- Architecture: HIGH -- refinement engine follows established project patterns (append-only stores, pipeline composition, TypeBox schemas, real temp workspace tests)
- Pitfalls: HIGH -- identified from direct codebase analysis (integrity hash desync is the most critical; already has established mitigation pattern)
- Integration testing: HIGH -- builds directly on 7 existing integration test files with identical patterns

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable internal architecture; no external dependency changes)
