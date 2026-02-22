# Phase 7: Production Wiring Gap Closure - Research

**Researched:** 2026-02-21
**Domain:** Cross-subsystem integration wiring within a TypeScript/ESM Node.js plugin
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CANS-08 | CareAgent can propose updates to CANS.md based on observed usage patterns | `refinement.observe()` exists and is fully functional — needs a production caller in `openclaw.ts` (bootstrap handler or tool-call handler) to feed observations into the engine |
| SKIL-05 | chart-skill generates template-constrained clinical documentation in provider's voice | `buildChartSkillInstructions(voice?)` exists and is tested — needs to be called from `openclaw.ts` after a successful `loadClinicalSkills()` call, then injected via `onAgentBootstrap` |
| SKIL-06 | chart-skill includes neurosurgery-specific templates (operative note, H&P, progress note) | All three TypeScript template objects exist — same fix as SKIL-05: injecting `buildChartSkillInstructions()` output into agent context makes them available at runtime |
| PORT-02 | Platform detection duck-types the API object to auto-select the correct adapter | `detectPlatform(api)` exists and has 9 unit tests — needs to be called at the top of `register(api)` in `openclaw.ts` before `createAdapter(api)`, and at the top of `activate()` in `standalone.ts` |
| ONBD-04 | `careagent status` shows activation state, CANS summary, hardening status, loaded clinical skills, and audit stats | `formatStatus()` exists and covers all items except loaded skills — needs skill loading results surfaced; the cleanest approach is a skill cache file (`.careagent/skill-load-results.json`) written by entry points and read by `formatStatus()` |
</phase_requirements>

---

## Summary

Phase 7 is exclusively a **production wiring phase** — all five target subsystems are fully implemented, unit-tested, and exported, but their entry points do not call them. No new logic needs to be invented. The task is surgical: add call sites in the right places, pass the right arguments, and add tests that prove the wires are live.

The audit identified five integration gaps via the v1.0 Milestone Audit (`.planning/v1.0-MILESTONE-AUDIT.md`). Each gap has a clear diagnosis and a minimal fix:
1. `refinement.observe()` — no production caller (fix: hook bootstrap or tool-call handler in `openclaw.ts`)
2. `buildChartSkillInstructions()` — called nowhere after skill loading (fix: call after `loadClinicalSkills()` success and inject via bootstrap handler)
3. `detectPlatform()` — exported but never called (fix: call at entry point before `createAdapter()`)
4. `careagent status` missing skill display (fix: write skill results to a cache file; read it in `formatStatus()`)
5. No CONTEXT.md exists for this phase — no locked user decisions. All implementation choices are at Claude's discretion.

The primary risk is **test regression**. The existing suite has 697 passing tests (not 679 — grew since audit). Every change must preserve this. The secondary risk is **bootstrap handler ordering** — the hardening engine already registers an `onAgentBootstrap` handler; the chart-skill injection handler must be registered after the hardening handler so protocol rules and skill instructions both reach the agent context as separate files.

**Primary recommendation:** Wire all five gaps in `openclaw.ts` and `standalone.ts` with minimal, targeted changes. Persist skill results to `.careagent/skill-load-results.json` for status command consumption. Add focused integration tests for each wire. Do not touch the subsystem implementations — they are correct.

---

## Standard Stack

No new libraries needed. This phase uses only what is already in the codebase.

### Core (already installed)

| Module | Version | Purpose | Notes |
|--------|---------|---------|-------|
| Node.js `fs` (built-in) | >= 22.12.0 | Read/write skill cache file | `writeFileSync`, `existsSync`, `readFileSync` |
| Node.js `path` (built-in) | >= 22.12.0 | Path resolution in entry points | already used throughout |
| `@sinclair/typebox` | ~0.34.0 | Schema validation (already used) | no new usage in this phase |
| `vitest` | ~4.0.0 | Test framework | consistent with all 50 existing test files |

### No new dependencies required

This phase adds zero npm dependencies. All needed APIs are:
- Already imported in `openclaw.ts`/`standalone.ts`
- Or are Node.js built-ins
- Or are already exported by existing modules

**Installation:**
```bash
# No new packages to install
```

---

## Architecture Patterns

### Existing Project Structure (relevant to this phase)

```
src/
├── entry/
│   ├── openclaw.ts          # PRIMARY: 4 of 5 gaps close here
│   ├── standalone.ts        # SECONDARY: detectPlatform + skill injection here
│   └── core.ts              # Pure re-exports, no changes needed
├── cli/
│   └── status-command.ts    # ONBD-04: add loadedSkills display
├── skills/
│   ├── loader.ts            # loadClinicalSkills() — no changes
│   └── chart-skill/
│       └── index.ts         # buildChartSkillInstructions() — no changes
├── refinement/
│   └── refinement-engine.ts # observe() — no changes
└── adapters/
    └── detect.ts            # detectPlatform() — no changes
```

### Pattern 1: Bootstrap Handler for Chart-Skill Instruction Injection (SKIL-05, SKIL-06)

**What:** After `loadClinicalSkills()` returns loaded skills, check if `chart-skill` loaded. If yes, call `buildChartSkillInstructions(cans.voice)` and register an additional `onAgentBootstrap` handler that injects the instructions as a workspace file.

**When to use:** At the end of the skill loading block in `openclaw.ts`, before Step 7 (audit integrity service registration). Mirror in `standalone.ts`.

**How the bootstrap context works:** `onAgentBootstrap` receives a `BootstrapContext` with an `addFile(name, content)` method. The hardening engine already calls `injectProtocol(context, cans)` which uses `addFile`. Chart-skill instructions should be added as a separate file (e.g., `CHART_SKILL_INSTRUCTIONS`) so they are distinct from the protocol rules.

**Example (in `openclaw.ts` after skill loading block):**
```typescript
// SKIL-05, SKIL-06: Inject chart-skill instructions if chart-skill loaded
const chartSkillLoaded = loadedSkills.some(s => s.skillId === CHART_SKILL_ID);
if (chartSkillLoaded) {
  const instructions = buildChartSkillInstructions(cans.voice);
  adapter.onAgentBootstrap((context) => {
    context.addFile('CHART_SKILL_INSTRUCTIONS', instructions);
  });
}
```

**Import to add in `openclaw.ts`:**
```typescript
import { CHART_SKILL_ID, buildChartSkillInstructions } from '../skills/chart-skill/index.js';
```

### Pattern 2: Observation Feed in Bootstrap Handler (CANS-08)

**What:** Register an `onAgentBootstrap` handler that calls `refinement.observe()` to record that a session started. This creates at least one production call site for `observe()` making the CANS Continuous Improvement E2E flow live.

**Key design decision:** The bootstrap handler is the correct location because:
- It fires once per agent session (not on every tool call, which would flood observations)
- It has access to `cans` (the CANS document) for context
- It is already registered by the hardening engine for protocol injection

**Example (in `openclaw.ts` after refinement engine creation):**
```typescript
// CANS-08: Feed session-start observation into refinement engine
adapter.onAgentBootstrap((_context) => {
  refinement.observe({
    category: 'session',
    field_path: 'provider.specialty',
    declared_value: cans.provider.specialty ?? 'none',
    observed_value: cans.provider.specialty ?? 'none',
  });
});
```

**Note on observation category:** Looking at `src/refinement/types.ts`, the `ObservationCategory` type needs to be checked to confirm valid values before implementation. The planner must verify this.

### Pattern 3: detectPlatform() at Entry Point (PORT-02)

**What:** Call `detectPlatform(api)` at the very top of `register(api)` in `openclaw.ts` before creating the adapter. The result can be logged for observability. In `standalone.ts`, call it similarly before creating the standalone adapter.

**Why it doesn't change behavior:** `openclaw.ts` always creates an OpenClaw adapter — `detectPlatform()` for documentation/logging purposes. The real value of PORT-02 is that a *unified* entry point could use the result to switch adapters. However, since the project has separate entry points per platform (`openclaw.ts`, `standalone.ts`), the simplest PORT-02 closure is demonstrating detectPlatform is called, even if the detection result is only logged.

**Example (in `openclaw.ts`):**
```typescript
import { detectPlatform } from '../adapters/detect.js';

export default function register(api: unknown): void {
  const platform = detectPlatform(api);
  // Step 1: Create adapter (platform confirmed as 'openclaw')
  const adapter = createAdapter(api);
  adapter.log('info', `[CareAgent] Platform detected: ${platform}`);
  // ... rest of registration
}
```

### Pattern 4: Skill Cache File for Status Command (ONBD-04)

**What:** After `loadClinicalSkills()` returns results, serialize loaded skill IDs to `.careagent/skill-load-results.json`. The `formatStatus()` function reads this file (if present) and includes a "Loaded Skills" section.

**Why a cache file (not passing results directly):** `formatStatus(workspacePath)` currently takes only a workspace path — no live skill loading occurs at status-check time. Status is a read-only snapshot. Adding a runtime parameter would require changing the `commands.ts` wiring and the `runStatusCommand` signature significantly. A cache file follows the existing pattern used for `cans-integrity.json`.

**Cache file location:** `.careagent/skill-load-results.json`

**Cache file schema:**
```typescript
interface SkillCacheEntry {
  skillId: string;
  loaded: boolean;
  version?: string;
  reason?: string;
}
interface SkillCache {
  timestamp: string;
  results: SkillCacheEntry[];
}
```

**Write in `openclaw.ts`:**
```typescript
import { mkdirSync, writeFileSync } from 'node:fs';

// After loadClinicalSkills():
const cacheDir = join(workspacePath, '.careagent');
mkdirSync(cacheDir, { recursive: true });
writeFileSync(
  join(cacheDir, 'skill-load-results.json'),
  JSON.stringify({ timestamp: new Date().toISOString(), results: skillResults }, null, 2),
  'utf-8',
);
```

**Read in `formatStatus()` in `status-command.ts`:**
```typescript
function readSkillCache(workspacePath: string): SkillCacheEntry[] {
  const cachePath = join(workspacePath, '.careagent', 'skill-load-results.json');
  if (!existsSync(cachePath)) return [];
  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return data.results ?? [];
  } catch {
    return [];
  }
}
```

**Display in `formatStatus()`** (add after hardening line):
```
Clinical Skills:
  chart-skill (v1.0.0):  Loaded
  [skill-id]:            Not Loaded — [reason]
```

Or when no cache:
```
Clinical Skills:   Not loaded in this session
```

### Anti-Patterns to Avoid

- **Modifying subsystem logic:** All five subsystem functions are correct. Do not touch `refinement-engine.ts`, `loader.ts`, `chart-skill/index.ts`, or `detect.ts`.
- **Adding runtime parameters to `formatStatus()`:** This would cascade to `commands.ts` and break existing tests. Use the cache file pattern.
- **Calling `buildChartSkillInstructions()` before `loadClinicalSkills()`:** The instructions reference voice directives from CANS — `cans.voice` is available, but there's no point computing them unless chart-skill actually loaded.
- **Registering bootstrap handlers before `engine.activate()`:** The hardening engine must activate first so the protocol injection bootstrap runs before clinical skill injection.
- **Calling `observe()` on every tool call:** This would produce far too many observations. Once per session (bootstrap) or once per distinct tool category is appropriate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill result persistence | Custom serialization | `JSON.stringify`/`JSON.parse` with `writeFileSync`/`readFileSync` | Already used for `cans-integrity.json` in same `.careagent/` dir |
| Platform selection | Custom duck-typing logic | `detectPlatform()` from `../adapters/detect.ts` | Already tested with 9 unit tests, exactly the right tool |
| Chart instruction building | Custom template string | `buildChartSkillInstructions(voice?)` from `../skills/chart-skill/index.js` | Already unit-tested with voice adapter; handles all three templates |
| Observation recording | Custom observation format | `refinement.observe()` from already-created `RefinementEngine` | Engine handles session_id, timestamp injection automatically |
| Skill ID constant | Magic string `'chart-skill'` | `CHART_SKILL_ID` exported from `../skills/chart-skill/index.js` | Type-safe constant, already exported from `src/skills/index.ts` |

**Key insight:** Every piece of logic this phase needs already exists and is tested. The only new code is the glue between them.

---

## Common Pitfalls

### Pitfall 1: `cans.voice` May Be Undefined

**What goes wrong:** `buildChartSkillInstructions(voice?)` accepts an optional `Voice` argument. The `CANSDocument` schema may not require a `voice` field. Passing `cans.voice` may pass `undefined`, which the function handles gracefully (returns generic instructions). This is correct behavior — do not add a guard that skips injection when voice is undefined.

**Why it happens:** Developers assume required fields must be present before calling the function.

**How to avoid:** Pass `cans.voice` directly — the function signature is `buildChartSkillInstructions(voice?: Voice)` so `undefined` is valid.

**Warning signs:** If voice-specific instructions are not appearing, check whether `cans.voice` is populated in the test workspace's CANS.md.

### Pitfall 2: Skill Cache File Races with formatStatus()

**What goes wrong:** If the plugin registers (writes cache) and `formatStatus()` is called in the same test, the cache may not be written before the status check runs.

**Why it happens:** Testing integration of two things that weren't previously connected.

**How to avoid:** In tests for the status command with skill display, always write the cache file directly (or register the plugin first) before calling `formatStatus()`. Tests should not depend on the exact plugin startup sequence within the same test.

**Warning signs:** Status tests show "Not loaded in this session" even when a mock skill cache is expected.

### Pitfall 3: Bootstrap Handler Count Assertion Breaks Existing Tests

**What goes wrong:** The existing e2e-flow test checks `handlers['agent:bootstrap']` is defined. Adding a second `onAgentBootstrap` registration for chart-skill instructions might cause assertion failures if the mock adapter replaces the handler rather than queuing multiple handlers.

**Why it happens:** The mock adapter in `e2e-flow.test.ts` stores handlers in a `Record<string, Function>` — calling `on(event, handler)` twice for the same event overwrites the first.

**How to avoid:** Check how `createMockAPI` in `e2e-flow.test.ts` handles repeated handler registration for the same event. If it overwrites, the fix is to call `buildChartSkillInstructions()` and inject the instructions *inside the existing* `onAgentBootstrap` handler in the hardening engine, not as a separate registration. Better: add the chart-skill file injection directly to the bootstrap handler registered after skill loading — but use a separate `onAgentBootstrap` call only if the adapter supports it.

**Actual current state:** Looking at `openclaw-adapter.ts` (to be verified), the adapter may support multiple bootstrap handlers via an array. Check before assuming single-handler behavior.

**Warning signs:** Test `INTG-01: End-to-End Flow` fails with "bootstrap handler not defined" or chart instructions are undefined.

### Pitfall 4: ObservationCategory Type Constraint

**What goes wrong:** `refinement.observe()` requires a `category` field typed as `ObservationCategory`. Using an invalid string literal causes a TypeScript error.

**Why it happens:** Researcher doesn't check the type definition before specifying the observe() call.

**How to avoid:** Check `src/refinement/types.ts` for the valid `ObservationCategory` values before writing the call. The planner should enumerate them and pick an appropriate one for session-start observations.

**Warning signs:** TypeScript compile error: `Type '"session"' is not assignable to type 'ObservationCategory'`.

### Pitfall 5: detectPlatform() Return Value Not Actionable in Dedicated Entry Points

**What goes wrong:** Planner wastes time trying to make `detectPlatform()` actually switch adapters in `openclaw.ts` — but that entry point is always OpenClaw-only by design. The call would always return `'openclaw'`.

**Why it happens:** Requirements are interpreted too literally.

**How to avoid:** PORT-02's spirit is "auto-selection via duck-typing" — the simplest conformant implementation is: call `detectPlatform(api)` in `openclaw.ts` and log the result. The audit gap was that `detectPlatform()` was never called anywhere. Calling it (even just for logging) closes the gap. The planner may also consider adding a unified entry point that genuinely switches, but that is scope creep for this phase.

---

## Code Examples

### The Five Wiring Points (authoritative — from actual codebase)

#### CANS-08: observe() call site

From `src/refinement/refinement-engine.ts` (RefinementEngine interface):
```typescript
// observe() signature:
observe(obs: Omit<Observation, 'timestamp' | 'session_id'>): void;

// Observation type (from refinement/types.ts — planner must verify ObservationCategory values):
interface Observation {
  category: ObservationCategory;
  field_path: string;
  declared_value: unknown;
  observed_value: unknown;
  timestamp: string;        // auto-injected by engine
  session_id: string;       // auto-injected by engine
}
```

#### SKIL-05/06: buildChartSkillInstructions() call site

From `src/skills/chart-skill/index.ts`:
```typescript
// Signature:
export function buildChartSkillInstructions(voice?: Voice): string;

// CHART_SKILL_ID constant:
export const CHART_SKILL_ID = 'chart-skill' as const;

// SkillLoadResult (from skills/types.ts):
interface SkillLoadResult {
  skillId: string;
  loaded: boolean;
  version?: string;
  directory?: string;
  reason?: string;
}
```

#### PORT-02: detectPlatform() call site

From `src/adapters/detect.ts`:
```typescript
// Signature:
export function detectPlatform(api: unknown): DetectedPlatform;
export type DetectedPlatform = 'openclaw' | 'standalone';
```

#### ONBD-04: skill cache in status-command.ts

Existing `formatStatus()` signature (from `src/cli/status-command.ts`):
```typescript
export function formatStatus(workspacePath: string): string;
export function runStatusCommand(workspacePath: string): void;
```

Note: Signature must not change — it is called from `commands.ts` directly:
```typescript
// commands.ts line 22-26:
adapter.registerCliCommand({
  name: 'careagent status',
  description: 'Show CareAgent activation state and system health',
  handler: () => {
    runStatusCommand(workspacePath);
  },
});
```

### Existing bootstrap injection pattern (HARD-03 in engine.ts)

```typescript
// engine.ts — how protocol injection already works:
adapter.onAgentBootstrap((context) => {
  injectProtocol(context, cans);  // calls context.addFile() internally
});

// BootstrapContext interface (from adapters/types.ts):
export interface BootstrapContext {
  addFile(name: string, content: string): void;
}
```

### Existing integrity cache pattern (model for skill cache)

From `src/activation/cans-integrity.ts` (inferred pattern):
```typescript
// Stores: .careagent/cans-integrity.json
// Format: { hash: string, timestamp: string }
// Used by: gate.ts (write), status-command.ts (read)
```

The skill cache should follow this same convention — written by entry points, read by the status command.

---

## Open Questions

1. **What are the valid `ObservationCategory` values?**
   - What we know: `refinement.observe()` requires a `category: ObservationCategory` field. The test uses `'voice'` as the category.
   - What's unclear: Is `'session'` a valid `ObservationCategory`? Does the type need to be extended to add a `'session'` category for the bootstrap observer, or should the existing `'voice'` or another existing category be used?
   - Recommendation: Planner must read `src/refinement/types.ts` before writing the `observe()` call. If `'session'` is not a valid category, use `'voice'` with `field_path: 'voice.chart'` to record session context without requiring type changes.

2. **Does the OpenClaw adapter support multiple `onAgentBootstrap` registrations?**
   - What we know: The hardening engine calls `adapter.onAgentBootstrap()` once for protocol injection. If we add a second call for chart-skill instructions, the behavior depends on the adapter implementation.
   - What's unclear: Does `src/adapters/openclaw/index.ts` queue multiple bootstrap handlers or overwrite?
   - Recommendation: Planner must read `src/adapters/openclaw/index.ts` and `src/adapters/standalone/index.ts`. If single-handler, inject chart-skill content within the same bootstrap handler (e.g., `injectProtocol` already calls `context.addFile` — add another `context.addFile` call in `openclaw.ts` for chart-skill instructions). If multi-handler, use separate registrations.

3. **Should `formatStatus()` signature change, or should skill data be loaded internally?**
   - What we know: `formatStatus(workspacePath: string): string` is the current signature. 12 existing tests in `status-command.test.ts` + integration tests in `status.test.ts` call it this way.
   - What's unclear: Could skill results be loaded live (re-running `loadClinicalSkills()` in `formatStatus()`) vs. reading a cache?
   - Recommendation: Use a cache file. Running `loadClinicalSkills()` in `formatStatus()` would require `cans`, `validator`, and `skillsDir` — all unavailable in the status command without major refactoring. Cache file is cleaner and does not require signature changes.

4. **How should the status command display skills when the cache does not exist (no plugin run in this session)?**
   - What we know: The requirement says "loaded clinical skills" should be displayed.
   - What's unclear: If `formatStatus()` is called before the plugin has ever run (or in a standalone test without a plugin boot), what should be shown?
   - Recommendation: Show `"Clinical Skills:   Not loaded in this session"` when cache is absent or empty. This is consistent with the existing pattern (e.g., showing `N/A` for audit stats when no log exists).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-phase siloed testing | Cross-phase integration tests + milestone audit | Phase 5 | Audit now catches production wiring gaps that unit tests miss |
| Hardcoded platform assumptions | PlatformAdapter interface + duck-typing | Phase 2.1 | Enables PORT-02 closure |
| No skill template injection | Bootstrap handler pattern for context injection | Phase 3 (established for protocol) | Chart-skill injection follows the same pattern |

**No deprecated approaches** relevant to this phase. All patterns in use are current.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `/Users/medomatic/Documents/Projects/provider-core/src/entry/openclaw.ts` — complete wiring context, Steps 1-7 documented
- `/Users/medomatic/Documents/Projects/provider-core/src/entry/standalone.ts` — parallel wiring for standalone mode
- `/Users/medomatic/Documents/Projects/provider-core/src/refinement/refinement-engine.ts` — `observe()` signature, engine factory
- `/Users/medomatic/Documents/Projects/provider-core/src/skills/chart-skill/index.ts` — `buildChartSkillInstructions()`, `CHART_SKILL_ID`
- `/Users/medomatic/Documents/Projects/provider-core/src/skills/loader.ts` — `loadClinicalSkills()` pipeline and return type
- `/Users/medomatic/Documents/Projects/provider-core/src/adapters/detect.ts` — `detectPlatform()` implementation
- `/Users/medomatic/Documents/Projects/provider-core/src/adapters/types.ts` — `BootstrapContext.addFile()`, `PlatformAdapter` interface
- `/Users/medomatic/Documents/Projects/provider-core/src/cli/status-command.ts` — `formatStatus()`, `runStatusCommand()`, existing display logic
- `/Users/medomatic/Documents/Projects/provider-core/src/cli/commands.ts` — CLI registration, `runStatusCommand(workspacePath)` call site
- `/Users/medomatic/Documents/Projects/provider-core/src/hardening/engine.ts` — bootstrap handler registration pattern
- `/Users/medomatic/Documents/Projects/provider-core/.planning/v1.0-MILESTONE-AUDIT.md` — canonical gap analysis with evidence
- `/Users/medomatic/Documents/Projects/provider-core/test/unit/cli/status-command.test.ts` — 17 existing tests that must not regress
- `/Users/medomatic/Documents/Projects/provider-core/test/integration/status.test.ts` — 10 existing integration tests
- `/Users/medomatic/Documents/Projects/provider-core/test/integration/e2e-flow.test.ts` — E2E tests covering `register()` and `activate()`
- `/Users/medomatic/Documents/Projects/provider-core/test/unit/adapters/detect.test.ts` — 9 existing unit tests for `detectPlatform()`

### Secondary (MEDIUM confidence — inferred from patterns)

- Skill cache design pattern inferred from `cans-integrity.json` (`.careagent/` directory convention used consistently across the codebase)

### Items Not Yet Verified (planner must confirm before implementation)

- `src/refinement/types.ts` — valid `ObservationCategory` values (must check before writing `observe()` call)
- `src/adapters/openclaw/index.ts` — whether multiple `onAgentBootstrap` registrations are queued or overwritten
- `src/adapters/standalone/index.ts` — same question for standalone adapter

---

## Metadata

**Confidence breakdown:**
- Gap identification: HIGH — directly from v1.0 audit with code evidence
- Fix design: HIGH — all five fixes are minimal, follow existing patterns in the codebase
- Pitfall identification: HIGH — specific to this codebase, verified by reading actual test files
- Open questions: HIGH — accurately identify what planner needs to verify before tasking

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (codebase is stable; no external dependencies changing)

---

## Implementation Summary (for planner)

Five changes, in order of recommended implementation:

| # | Gap | File(s) to Change | Change Type |
|---|-----|-------------------|-------------|
| 1 | PORT-02 `detectPlatform()` | `src/entry/openclaw.ts`, `src/entry/standalone.ts` | Add import + 1-line call at top of entry function |
| 2 | SKIL-05/06 `buildChartSkillInstructions()` | `src/entry/openclaw.ts`, `src/entry/standalone.ts` | Add import + call after skill loading + bootstrap registration |
| 3 | CANS-08 `refinement.observe()` | `src/entry/openclaw.ts`, `src/entry/standalone.ts` | Add `onAgentBootstrap` handler that calls `observe()` |
| 4 | ONBD-04 skill cache write | `src/entry/openclaw.ts`, `src/entry/standalone.ts` | Add `writeFileSync` of skill results after `loadClinicalSkills()` |
| 5 | ONBD-04 skill display in status | `src/cli/status-command.ts` | Add `readSkillCache()` helper + display section in `formatStatus()` |

Tests to add per change:
- PORT-02: 1 integration test confirming `detectPlatform()` is called (log assertion or platform field check)
- SKIL-05/06: 1 integration test confirming chart-skill instructions appear in bootstrap context
- CANS-08: 1 integration test confirming `observe()` is called during plugin registration (check observation store or AUDIT.log)
- ONBD-04 cache: 1 unit test confirming cache file is written with correct structure
- ONBD-04 status: 2-3 unit tests in `status-command.test.ts` for cache-present and cache-absent cases
