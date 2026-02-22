# Phase 8: Workspace Profile Selection Wiring - Research

**Researched:** 2026-02-21
**Domain:** Cross-subsystem integration wiring (detectPlatform -> getWorkspaceProfile -> supplementWorkspaceFiles)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-03 | Workspace file supplementation is configurable per platform via workspace profiles (OpenClaw: SOUL.md + AGENTS.md + USER.md; AGENTS.md standard: single AGENTS.md; standalone: no supplementation) | All three profiles exist and are unit-tested. `getWorkspaceProfile()` is exported but never called at runtime. `detectPlatform()` is now called in both entry points (Phase 7) but its result is only logged, never passed to `getWorkspaceProfile()`. The fix is to thread the detected platform through to `registerCLI` -> `runInitCommand` -> `supplementWorkspaceFiles` so the correct profile is selected. |
</phase_requirements>

---

## Summary

Phase 8 closes the last integration gap identified in the v1.0 Milestone Audit: `detectPlatform()` result is never passed to `getWorkspaceProfile()`, causing all `careagent init` runs to default to the OpenClaw profile regardless of the detected platform. The three workspace profiles (`openclawProfile`, `agentsStandardProfile`, `standaloneProfile`) exist and are unit-tested, and `getWorkspaceProfile(platform)` correctly maps platform strings to profiles. But no production code path calls `getWorkspaceProfile()`.

The fix is a **parameter-threading change** across four functions in the call chain: `register()` / `activate()` -> `registerCLI()` -> `runInitCommand()` -> `supplementWorkspaceFiles()`. Each function already accepts or can be extended to accept the workspace profile. The `runInitCommand` function already has an optional `profile?: WorkspaceProfile` parameter that no caller uses. The `registerCLI` function and `commands.ts` need the platform (or profile) threaded through so the `careagent init` handler can pass it to `runInitCommand`.

There is one design question: how to handle the `agents-standard` platform, since `DetectedPlatform` is `'openclaw' | 'standalone'` and does not include `'agents-standard'`. The `agents-standard` profile is for non-OpenClaw hosts that use AGENTS.md (e.g., Claude Code, Cursor, Windsurf). These platforms would be detected as `'standalone'` by `detectPlatform()`. The solution options are analyzed below.

**Primary recommendation:** Thread `DetectedPlatform` from entry points through `registerCLI` and into `runInitCommand`, calling `getWorkspaceProfile(platform)` to select the correct profile. For `agents-standard` detection, extend `DetectedPlatform` to include `'agents-standard'` with additional duck-typing, OR use a mapping function that maps `DetectedPlatform` to profile keys. The simplest approach that closes PORT-03 is: in `openclaw.ts`, pass `getWorkspaceProfile('openclaw')` to the CLI registration; in `standalone.ts`, pass `getWorkspaceProfile('standalone')` directly. The `agents-standard` path can be handled via configuration or future detection logic.

---

## Standard Stack

### Core (already installed, no changes)

| Module | Version | Purpose | Notes |
|--------|---------|---------|-------|
| Node.js built-ins | >= 22.12.0 | fs, path | Already used in all relevant files |
| `vitest` | ~4.0.0 | Test framework | Consistent with all 51 existing test files |

### No new dependencies required

This phase adds zero npm dependencies. All needed APIs already exist in the codebase:
- `getWorkspaceProfile()` in `src/onboarding/workspace-profiles.ts`
- `detectPlatform()` in `src/adapters/detect.ts`
- `WorkspaceProfile` type in `src/onboarding/workspace-profiles.ts`
- `supplementWorkspaceFiles()` already accepts an optional `profile` parameter

**Installation:**
```bash
# No new packages to install
```

---

## Architecture Patterns

### Current Call Chain (the gap)

```
openclaw.ts: register(api)
  |-- detectPlatform(api)         // returns 'openclaw' -- RESULT UNUSED for profiles
  |-- createAdapter(api)
  |-- registerCLI(adapter, workspacePath, audit)
  |     |-- handler: careagent init
  |           |-- runInitCommand(io, workspacePath, audit)  // NO profile passed
  |                 |-- supplementWorkspaceFiles(ws, data, phil)  // defaults to openclawProfile

standalone.ts: activate(workspacePath)
  |-- detectPlatform(undefined)   // returns 'standalone' -- RESULT UNUSED for profiles
  |-- createStandaloneAdapter()
  |-- (no CLI registration — standalone adapter's registerCliCommand is a no-op)
```

### Target Call Chain (after fix)

```
openclaw.ts: register(api)
  |-- platform = detectPlatform(api)       // 'openclaw'
  |-- profile = getWorkspaceProfile(platform)  // openclawProfile
  |-- registerCLI(adapter, workspacePath, audit, profile)
  |     |-- handler: careagent init
  |           |-- runInitCommand(io, workspacePath, audit, profile)
  |                 |-- supplementWorkspaceFiles(ws, data, phil, profile)  // uses openclawProfile

standalone.ts: activate(workspacePath)
  |-- platform = detectPlatform(undefined)     // 'standalone'
  |-- profile = getWorkspaceProfile(platform)  // standaloneProfile
  |-- (no CLI wired — but activate() could return the profile for programmatic callers)
```

### Pattern 1: Threading a Parameter Through a Call Chain

**What:** Pass the workspace profile from the entry point (where the platform is known) down to the function that uses it (supplementWorkspaceFiles), through intermediate functions that currently do not receive it.

**When to use:** When a value is determined at initialization time but consumed deep in the call stack.

**Files to modify (in order):**

1. **`src/entry/openclaw.ts`** — Call `getWorkspaceProfile(platform)` after `detectPlatform(api)`. Pass the resulting profile to `registerCLI()`.

2. **`src/cli/commands.ts`** — Add `profile?: WorkspaceProfile` parameter to `registerCLI()`. Pass it to `runInitCommand()` in the `careagent init` handler.

3. **`src/cli/init-command.ts`** — Already accepts `profile?: WorkspaceProfile`. No signature change needed. Already passes it to `supplementWorkspaceFiles()`.

4. **`src/onboarding/workspace-writer.ts`** — Already accepts `profile?: WorkspaceProfile` in `supplementWorkspaceFiles()`. Already uses it with `const resolvedProfile = profile ?? openclawProfile`. No change needed.

**Example for `openclaw.ts`:**
```typescript
import { getWorkspaceProfile } from '../onboarding/workspace-profiles.js';

export default function register(api: unknown): void {
  const platform = detectPlatform(api);
  const profile = getWorkspaceProfile(platform);
  const adapter = createAdapter(api);
  // ...
  registerCLI(adapter, workspacePath, audit, profile);
  // ...
}
```

**Example for `commands.ts`:**
```typescript
import type { WorkspaceProfile } from '../onboarding/workspace-profiles.js';

export function registerCLI(
  adapter: PlatformAdapter,
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    description: 'Initialize CareAgent with a clinical onboarding interview',
    handler: async () => {
      const io = createTerminalIO();
      await runInitCommand(io, workspacePath, audit, profile);
    },
  });
  // careagent status handler unchanged
}
```

### Pattern 2: Standalone Entry Point Profile Selection

**What:** In `standalone.ts`, the `activate()` function does not register CLI commands (standalone adapter's `registerCliCommand` is a no-op). However, the profile should still be available for programmatic callers who may use the standalone API to run onboarding.

**Options:**
- **Option A:** Return the profile in the `ActivateResult` interface so library consumers can use it.
- **Option B:** Do nothing — standalone entry point has no CLI, so workspace supplementation via `careagent init` does not apply. The standalone profile (no files) is the correct default when supplementWorkspaceFiles is not called.
- **Option C:** Call `getWorkspaceProfile(platform)` but only store it; make it available via the result object.

**Recommendation:** Option A — add `profile: WorkspaceProfile` to `ActivateResult` and set it from `getWorkspaceProfile(platform)`. This makes the standalone path fully wired for PORT-03 even though the CLI handler is a no-op. A programmatic caller using the standalone API could then access the correct profile.

### Anti-Patterns to Avoid

- **Modifying `getWorkspaceProfile()` internals:** The function is correct. The bug is that nobody calls it.
- **Modifying `supplementWorkspaceFiles()` internals:** The function already accepts an optional profile and defaults to openclawProfile. The fix is in the callers.
- **Modifying `detectPlatform()` internals:** The function is correct. It returns the right platform string.
- **Hardcoding profile selection in `commands.ts`:** Do not hardcode `openclawProfile` in `registerCLI()`. Accept it as a parameter from the entry point.
- **Making profile a required parameter in existing functions:** Keep `profile` optional in `registerCLI()` and `runInitCommand()` to avoid breaking existing tests that call these functions without a profile.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Platform-to-profile mapping | Custom if/else or switch | `getWorkspaceProfile(platform)` | Already exists, handles fallback to openclawProfile, unit-tested with 4 test cases |
| Platform detection | Custom duck-typing | `detectPlatform(api)` | Already wired in Phase 7, 9 unit tests |
| Workspace file write | Custom file logic | `supplementWorkspaceFiles(path, data, phil, profile)` | Already accepts optional profile parameter |

**Key insight:** Every piece of this phase's logic already exists. The only code needed is parameter-passing glue between functions that are already individually correct and tested.

---

## Common Pitfalls

### Pitfall 1: Breaking Existing Tests by Making Profile Required

**What goes wrong:** If `registerCLI` or `runInitCommand` signatures change to require `profile`, all existing test call sites that do not pass a profile will fail to compile.

**Why it happens:** The reflex to make parameters required for explicitness.

**How to avoid:** Keep `profile` as an optional parameter (`profile?: WorkspaceProfile`) in both `registerCLI` and `runInitCommand`. The existing fallback behavior in `supplementWorkspaceFiles` (default to `openclawProfile`) handles the `undefined` case correctly. This ensures backward compatibility.

**Warning signs:** TypeScript compilation errors in test files that call `registerCLI(adapter, path, audit)` or `runInitCommand(io, path, audit)` without a fourth argument.

### Pitfall 2: DetectedPlatform vs. Profile Key Mismatch

**What goes wrong:** `DetectedPlatform` returns `'openclaw' | 'standalone'`, but the `PROFILES` record in `workspace-profiles.ts` has keys `'openclaw' | 'agents-standard' | 'standalone'`. If `detectPlatform()` returns `'standalone'` but the environment is actually an AGENTS.md-standard platform (e.g., Claude Code), the wrong profile (standaloneProfile with zero files) will be selected instead of `agentsStandardProfile`.

**Why it happens:** `detectPlatform()` was designed for PORT-02 (adapter selection), not PORT-03 (profile selection). It distinguishes OpenClaw from everything else. It does not distinguish between standalone library usage and AGENTS.md-standard CLI tools.

**How to avoid:** For v1.0, accept that `detectPlatform()` maps cleanly to two of the three profiles. The `agents-standard` profile is a future concern — it requires either:
1. Extending `DetectedPlatform` with heuristics (e.g., check for `AGENTS.md` file existence)
2. Adding a configuration option to CANS.md
3. Adding an explicit platform override parameter

For now, the fallback behavior in `getWorkspaceProfile()` (unknown platforms default to `openclawProfile`) is acceptable. The success criteria say "AGENTS.md-standard environments select agentsStandardProfile" — but since there is no `agents-standard` detection mechanism yet, the implementation should ensure the path *can* reach `agentsStandardProfile` if the right key is passed.

**Recommendation:** Ensure `getWorkspaceProfile('agents-standard')` works (already tested). The wiring should use `getWorkspaceProfile(platform)` so that if `detectPlatform()` is later extended to return `'agents-standard'`, no further changes are needed downstream. This "leave the door open" approach satisfies PORT-03's configurability requirement.

**Warning signs:** Tests assert `agentsStandardProfile` is selected but `detectPlatform()` never returns `'agents-standard'`.

### Pitfall 3: Standalone Entry Point Has No CLI — Profile Threading Appears Useless

**What goes wrong:** Developer concludes that the standalone entry point does not need profile wiring because `registerCliCommand` is a no-op. Skips adding profile to standalone path. Audit still flags PORT-03 as incomplete for standalone.

**Why it happens:** The standalone adapter's no-op CLI is a design decision, but PORT-03 requires that workspace supplementation is *configurable* per platform — not just OpenClaw.

**How to avoid:** Wire the profile in standalone.ts even though CLI is a no-op. Return the profile in `ActivateResult` so programmatic users of the standalone API can call `supplementWorkspaceFiles(path, data, phil, result.profile)` manually if they choose to.

**Warning signs:** PORT-03 audit check still says "standalone profile unreachable at runtime."

### Pitfall 4: Integration Test Calls `runInitCommand` Without Profile — Still Defaults to OpenClaw

**What goes wrong:** All existing integration tests (onboarding.test.ts, status.test.ts) call `runInitCommand(io, dir, audit)` without a profile. After the fix, these tests still exercise the openclawProfile path (the default). No test actually verifies that the standaloneProfile or agentsStandardProfile path works end-to-end.

**Why it happens:** The fix threads the parameter but no new test verifies the non-default profiles.

**How to avoid:** Add integration tests that:
1. Call `runInitCommand(io, dir, audit, standaloneProfile)` and verify no workspace files are written
2. Call `runInitCommand(io, dir, audit, agentsStandardProfile)` and verify only AGENTS.md is written (not SOUL.md or USER.md)
3. Call `runInitCommand(io, dir, audit, openclawProfile)` and verify SOUL.md, AGENTS.md, and USER.md are all written

**Warning signs:** All tests pass but PORT-03 is still flagged as "agentsStandardProfile unreachable" because no test proves the path works.

---

## Code Examples

### Current State: The Gap

**`src/cli/commands.ts` (current — no profile parameter):**
```typescript
export function registerCLI(
  adapter: PlatformAdapter,
  workspacePath: string,
  audit: AuditPipeline,
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    handler: async () => {
      const io = createTerminalIO();
      await runInitCommand(io, workspacePath, audit);  // <-- NO profile
    },
  });
}
```

**`src/cli/init-command.ts` (current — accepts profile but never receives one):**
```typescript
export async function runInitCommand(
  io: InterviewIO,
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,        // <-- optional, never passed by any caller
): Promise<void> {
  // ...
  const supplemented = supplementWorkspaceFiles(workspacePath, result.data, result.philosophy, profile);
  // profile is always undefined here, so supplementWorkspaceFiles defaults to openclawProfile
}
```

**`src/entry/openclaw.ts` (current — platform detected but not used for profiles):**
```typescript
export default function register(api: unknown): void {
  const platform = detectPlatform(api);  // Returns 'openclaw'
  const adapter = createAdapter(api);
  adapter.log('info', `[CareAgent] Platform detected: ${platform}`);
  // ... platform result is ONLY logged, never used for profile selection
  registerCLI(adapter, workspacePath, audit);  // <-- NO profile
}
```

### Target State: The Fix

**`src/entry/openclaw.ts` (fixed):**
```typescript
import { getWorkspaceProfile } from '../onboarding/workspace-profiles.js';

export default function register(api: unknown): void {
  const platform = detectPlatform(api);
  const profile = getWorkspaceProfile(platform);     // <-- NEW: resolve profile
  const adapter = createAdapter(api);
  adapter.log('info', `[CareAgent] Platform detected: ${platform}`);
  // ...
  registerCLI(adapter, workspacePath, audit, profile); // <-- NEW: pass profile
}
```

**`src/cli/commands.ts` (fixed):**
```typescript
import type { WorkspaceProfile } from '../onboarding/workspace-profiles.js';

export function registerCLI(
  adapter: PlatformAdapter,
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,                        // <-- NEW: optional parameter
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    handler: async () => {
      const io = createTerminalIO();
      await runInitCommand(io, workspacePath, audit, profile); // <-- NEW: forward
    },
  });
}
```

**`src/entry/standalone.ts` (fixed — profile in ActivateResult):**
```typescript
import { getWorkspaceProfile } from '../onboarding/workspace-profiles.js';
import type { WorkspaceProfile } from '../onboarding/workspace-profiles.js';

export interface ActivateResult {
  adapter: PlatformAdapter;
  audit: AuditPipeline;
  activation: ActivationResult;
  engine?: HardeningEngine;
  skills?: SkillLoadResult[];
  refinement?: RefinementEngine;
  profile: WorkspaceProfile;                         // <-- NEW: exposed for callers
}

export function activate(workspacePath?: string): ActivateResult {
  const platform = detectPlatform(undefined);
  const profile = getWorkspaceProfile(platform);     // <-- NEW: resolve profile
  // ...
  return { adapter, audit, activation, engine, skills, refinement, profile };
}
```

### Integration Test Pattern

```typescript
import { runInitCommand } from '../../src/cli/init-command.js';
import {
  openclawProfile,
  standaloneProfile,
  agentsStandardProfile,
} from '../../src/onboarding/workspace-profiles.js';

describe('PORT-03: workspace profile selection', () => {
  it('openclaw profile supplements SOUL.md, AGENTS.md, USER.md', async () => {
    await runInitCommand(io, dir, audit, openclawProfile);
    expect(existsSync(join(dir, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'USER.md'))).toBe(true);
  });

  it('standalone profile supplements no files', async () => {
    await runInitCommand(io, dir, audit, standaloneProfile);
    expect(existsSync(join(dir, 'SOUL.md'))).toBe(false);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(dir, 'USER.md'))).toBe(false);
  });

  it('agents-standard profile supplements only AGENTS.md', async () => {
    await runInitCommand(io, dir, audit, agentsStandardProfile);
    expect(existsSync(join(dir, 'SOUL.md'))).toBe(false);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'USER.md'))).toBe(false);
  });
});
```

---

## Detailed File Change Analysis

### Files That MUST Change

| File | Change | Lines Affected | Risk |
|------|--------|---------------|------|
| `src/entry/openclaw.ts` | Add import of `getWorkspaceProfile`, call it, pass to `registerCLI` | ~3 lines added | LOW — additive |
| `src/cli/commands.ts` | Add `profile?: WorkspaceProfile` parameter, forward to `runInitCommand` | ~3 lines changed | LOW — optional param |
| `src/entry/standalone.ts` | Add import of `getWorkspaceProfile`, call it, add `profile` to `ActivateResult` | ~4 lines added | LOW — additive |

### Files That Need NO Changes

| File | Why |
|------|-----|
| `src/cli/init-command.ts` | Already accepts `profile?: WorkspaceProfile` and passes it through |
| `src/onboarding/workspace-writer.ts` | Already accepts `profile?: WorkspaceProfile` and defaults to openclawProfile |
| `src/onboarding/workspace-profiles.ts` | Profiles and `getWorkspaceProfile()` already work correctly |
| `src/adapters/detect.ts` | `detectPlatform()` already returns the correct platform string |
| `src/entry/core.ts` | Pure re-exports, already exports `getWorkspaceProfile` |

### Test Files

| File | Change Needed |
|------|--------------|
| `test/integration/production-wiring.test.ts` | Add PORT-03 integration tests (profile selection per platform) |
| `test/integration/onboarding.test.ts` | No changes needed (existing tests call without profile, still work) |
| `test/unit/onboarding/workspace-profiles.test.ts` | No changes needed (profiles already tested) |
| `test/unit/onboarding/workspace-writer.test.ts` | No changes needed (supplementWorkspaceFiles with profile already tested implicitly by default) |
| NEW or extended integration test file | Add 3 tests: openclaw/standalone/agents-standard profile selection end-to-end |

---

## The agents-standard Question

### Background

`DetectedPlatform = 'openclaw' | 'standalone'` does not include `'agents-standard'`. The success criteria state: "AGENTS.md-standard environments select agentsStandardProfile." This creates a question: how does the system know it is running in an AGENTS.md-standard environment?

### Analysis

AGENTS.md-standard environments (Claude Code, Cursor, Windsurf) are not OpenClaw. They would be detected as `'standalone'` by `detectPlatform()`. But their workspace convention uses a single `AGENTS.md` file, which means the `agentsStandardProfile` is the correct profile — not `standaloneProfile`.

### Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Extend DetectedPlatform** | Add `'agents-standard'` to the type and detect AGENTS.md presence | Full automation | Changes `detectPlatform` semantics; may misdetect standalone with existing AGENTS.md |
| **B: Platform override parameter** | Add an optional `platformOverride` parameter to `activate()` and `register()` | Explicit, no magic | Caller must know their platform; adds parameter |
| **C: CANS.md configuration** | Add a `platform` field to CANS.md schema | Portable, user-controlled | Schema change; requires onboarding changes |
| **D: Accept two-profile wiring for v1.0** | Wire openclaw and standalone; document agents-standard as future | Minimal change, closes PORT-03 gap | Doesn't fully satisfy success criterion 2 |
| **E: Map at profile level** | Create a `platformToProfile(detected: DetectedPlatform): WorkspaceProfile` function that defaults standalone to standaloneProfile but could be overridden | Clean separation | Slight indirection |

### Recommendation

**Use Option D for v1.0 with a clean extension point.** The critical PORT-03 gap is that `getWorkspaceProfile()` is never called. Wiring it with `detectPlatform()` result closes the gap for openclaw and standalone. The `agents-standard` case requires additional detection logic or configuration that is outside the scope of this wiring phase.

The implementation should:
1. Use `getWorkspaceProfile(platform)` so the mapping goes through the existing function
2. This means if `DetectedPlatform` is later extended to include `'agents-standard'`, zero downstream changes are needed
3. Add a comment noting that `agents-standard` detection is a future enhancement

The existing `getWorkspaceProfile()` function already falls back to `openclawProfile` for unknown platforms. This means even in an AGENTS.md-standard environment, the worst case is that all three files (SOUL.md, AGENTS.md, USER.md) are written instead of just AGENTS.md. This is functional (not broken) — just suboptimal.

---

## Open Questions

1. **How should the standalone `ActivateResult.profile` be exposed?**
   - What we know: The standalone adapter has no CLI, so `careagent init` cannot be invoked. But the profile should be available for programmatic callers.
   - What's unclear: Should `profile` be a required field on `ActivateResult`, or optional?
   - Recommendation: Make it required. The profile is always determinable from `detectPlatform()`. There is no case where it would be undefined.

2. **Should existing integration tests be updated to pass a profile explicitly?**
   - What we know: 55+ existing calls to `runInitCommand(io, dir, audit)` (without profile) exist across test files. These will continue to work because profile is optional and defaults to openclawProfile.
   - What's unclear: Should these be updated to explicitly pass `openclawProfile` for documentation clarity?
   - Recommendation: No. Updating them would be busywork with no functional benefit. The default behavior is correct and intentional.

3. **Should the production-wiring integration test file be extended or a new test file created?**
   - What we know: `test/integration/production-wiring.test.ts` was created in Phase 7 for wiring gaps. PORT-03 is another wiring gap.
   - Recommendation: Extend `production-wiring.test.ts` with a new PORT-03 section. This keeps all wiring gap tests in one file.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded openclawProfile everywhere | Profile system with three profiles + getWorkspaceProfile() | Phase 2.1 (Architectural Alignment) | Made PORT-03 possible, but wiring was deferred |
| Profile parameter not threaded | All callers will thread profile from entry point | Phase 8 (this phase) | Closes PORT-03 gap |

**No deprecated approaches** relevant to this phase. All patterns in use are current.

---

## Sources

### Primary (HIGH confidence -- direct codebase inspection)

- `src/onboarding/workspace-profiles.ts` -- all three profiles, `getWorkspaceProfile()`, `PROFILES` record, `WorkspaceProfile` interface
- `src/onboarding/workspace-writer.ts` -- `supplementWorkspaceFiles()` accepts optional `profile` parameter, defaults to `openclawProfile`
- `src/cli/init-command.ts` -- `runInitCommand()` accepts optional `profile` parameter, passes it to `supplementWorkspaceFiles()`
- `src/cli/commands.ts` -- `registerCLI()` does NOT accept a profile parameter (the gap)
- `src/entry/openclaw.ts` -- `detectPlatform()` called, result logged but not used for profile selection
- `src/entry/standalone.ts` -- `detectPlatform()` called, result logged but not used for profile selection
- `src/adapters/detect.ts` -- `DetectedPlatform = 'openclaw' | 'standalone'` (no 'agents-standard')
- `test/unit/onboarding/workspace-profiles.test.ts` -- 8 unit tests cover all profiles and `getWorkspaceProfile()`
- `test/unit/onboarding/workspace-writer.test.ts` -- 11 unit tests cover `supplementFile()` and `supplementWorkspaceFiles()`
- `test/integration/production-wiring.test.ts` -- Phase 7 wiring tests (pattern for new PORT-03 tests)
- `.planning/v1.0-MILESTONE-AUDIT.md` -- canonical gap analysis: "getWorkspaceProfile() exported but never called at runtime"

### Secondary (MEDIUM confidence -- audit and planning documents)

- `.planning/ROADMAP.md` -- Phase 8 definition, success criteria, dependency on Phase 7
- `.planning/REQUIREMENTS.md` -- PORT-03 description and status (partial)

---

## Metadata

**Confidence breakdown:**
- Gap identification: HIGH -- directly from v1.0 audit with code evidence, confirmed by reading all source files
- Fix design: HIGH -- parameter threading is mechanical; `init-command.ts` and `workspace-writer.ts` already accept the profile parameter
- Pitfall identification: HIGH -- specific to this codebase, verified by reading actual source and test files
- agents-standard question: MEDIUM -- design question with clear options but no single obvious answer

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (codebase is stable; no external dependencies changing)

---

## Implementation Summary (for planner)

Three source file changes, zero dependency changes, focused integration tests:

| # | Change | File(s) | Lines Changed | Description |
|---|--------|---------|--------------|-------------|
| 1 | Wire profile in OpenClaw entry | `src/entry/openclaw.ts` | ~3 added | Import `getWorkspaceProfile`, call it with `platform`, pass result to `registerCLI` |
| 2 | Thread profile through CLI registration | `src/cli/commands.ts` | ~3 changed | Add optional `profile` parameter, forward to `runInitCommand` |
| 3 | Wire profile in standalone entry | `src/entry/standalone.ts` | ~4 added | Import `getWorkspaceProfile`, call it with `platform`, add `profile` to `ActivateResult` |
| 4 | Integration tests | `test/integration/production-wiring.test.ts` | ~40 added | PORT-03 tests: profile selection per platform, all three profiles reachable |

**Critical verification:**
- All 706 existing tests must still pass
- `getWorkspaceProfile('openclaw')` returns `openclawProfile` -- verified by existing unit test
- `getWorkspaceProfile('standalone')` returns `standaloneProfile` -- verified by existing unit test
- `runInitCommand(io, dir, audit, standaloneProfile)` writes zero workspace files
- `runInitCommand(io, dir, audit, agentsStandardProfile)` writes only AGENTS.md
- `runInitCommand(io, dir, audit, openclawProfile)` writes SOUL.md, AGENTS.md, USER.md
