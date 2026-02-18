# Phase 2: Onboarding and CLI

**Phase:** 02-onboarding
**Plans:** 6 plans in 5 waves
**Requirements:** ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05

---

## Wave Structure

| Wave | Plans | Parallel | Autonomous |
|------|-------|----------|------------|
| 1 | Plan 01 (CLI + IO Abstraction + Prompts) | solo | yes |
| 2 | Plan 02 (Interview Engine + Question Stages) | solo | yes |
| 3 | Plan 03 (CANS Generator + Review Loop), Plan 04 (Workspace Supplementation) | parallel | yes, yes |
| 4 | Plan 05 (Status Command) | solo | yes |
| 5 | Plan 06 (Integration into register() + Integration Tests) | solo | yes |

## Requirement Coverage

| Plan | Requirements |
|------|-------------|
| 01 | ONBD-01 (partial: CLI subcommand registration, IO foundation) |
| 02 | ONBD-01 (partial: interview flow that discovers clinical identity) |
| 03 | ONBD-02, ONBD-05 |
| 04 | ONBD-03 |
| 05 | ONBD-04 |
| 06 | ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05 (integration verification of all) |

---

## Plan 01: CLI Module, IO Abstraction, and Prompt Utilities

```yaml
phase: 02-onboarding
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/cli/commands.ts
  - src/cli/io.ts
  - src/cli/prompts.ts
  - src/index.ts
  - src/adapter/types.ts
  - test/unit/cli/prompts.test.ts
  - test/unit/cli/io.test.ts
  - test/fixtures/interview-responses.ts
autonomous: true
requirements: [ONBD-01]

must_haves:
  truths:
    - "careagent init and careagent status are registered as CLI subcommands"
    - "InterviewIO interface abstracts all terminal I/O for testability"
    - "createTerminalIO() creates a production IO using node:readline/promises"
    - "createMockIO() creates a test IO that replays pre-canned answers"
    - "Prompt utilities (question, select, confirm) handle input validation and re-prompting"
    - "Existing 131 Phase 1 tests continue to pass"
  artifacts:
    - path: "src/cli/commands.ts"
      provides: "CLI subcommand registration for careagent init and careagent status"
      exports: ["registerCLI"]
    - path: "src/cli/io.ts"
      provides: "InterviewIO interface and terminal/mock implementations"
      exports: ["InterviewIO", "createTerminalIO", "createMockIO"]
    - path: "src/cli/prompts.ts"
      provides: "Reusable prompt utilities built on InterviewIO"
      exports: ["askText", "askSelect", "askConfirm", "askOptionalText"]
    - path: "test/fixtures/interview-responses.ts"
      provides: "Pre-canned interview answer sequences for testing"
      exports: ["completeInterviewResponses", "minimalInterviewResponses"]
  key_links:
    - from: "src/cli/commands.ts"
      to: "src/adapter/types.ts"
      via: "Uses CareAgentPluginAPI.registerCliCommand"
      pattern: "registerCliCommand"
    - from: "src/cli/prompts.ts"
      to: "src/cli/io.ts"
      via: "All prompts accept InterviewIO parameter"
      pattern: "InterviewIO"
    - from: "src/cli/io.ts"
      to: "node:readline/promises"
      via: "createTerminalIO wraps readline"
      pattern: "readline/promises"
```

### Objective

Create the CLI foundation for Phase 2: subcommand registration (`careagent init`, `careagent status`), the `InterviewIO` abstraction that makes the interview testable without spawning child processes, and reusable prompt utilities (text input, numbered selection, yes/no confirmation).

Purpose: Every other Phase 2 plan depends on the IO abstraction for testability and the CLI registration for command entry points.
Output: CLI subcommands registered, IO interface with terminal and mock implementations, prompt helpers with input validation.

### Context

```
@.planning/ROADMAP.md
@.planning/phase-2/RESEARCH.md (Pattern 2: IO Abstraction, Pattern 5: CLI Subcommand Registration)
@src/index.ts (current CLI stub at lines 26-32 to be replaced)
@src/adapter/types.ts (CareAgentPluginAPI, CliCommandConfig)
@src/adapter/openclaw-adapter.ts (registerCliCommand implementation)
```

### Tasks

#### Task 1: InterviewIO interface, terminal implementation, mock implementation, and prompt utilities

**Type:** auto
**Files:**
- `src/cli/io.ts`
- `src/cli/prompts.ts`
- `test/unit/cli/io.test.ts`
- `test/unit/cli/prompts.test.ts`
- `test/fixtures/interview-responses.ts`

**Action:**

1. Create `src/cli/io.ts` defining the `InterviewIO` interface and both implementations:

   ```typescript
   export interface InterviewIO {
     question(prompt: string): Promise<string>;
     select(prompt: string, options: string[]): Promise<number>;
     confirm(prompt: string): Promise<boolean>;
     display(text: string): void;
     close(): void;
   }
   ```

   `createTerminalIO()`: Creates a production IO backed by `node:readline/promises`. Import `readline` from `node:readline/promises` and `stdin`/`stdout` from `node:process`. The `createInterface` call uses `{ input: stdin, output: stdout }`.
   - `question(prompt)`: Calls `rl.question(prompt)`, trims the result.
   - `select(prompt, options)`: Formats options as numbered list (`  1. Option`), calls `rl.question()`, parses the integer, validates range (1 to options.length). On invalid input, re-prompts by calling itself recursively. Returns the **zero-based** index.
   - `confirm(prompt)`: Calls `rl.question(prompt + ' (y/n) ')`, returns `true` if answer starts with 'y' (case-insensitive).
   - `display(text)`: Calls `console.log(text)`.
   - `close()`: Calls `rl.close()`. CRITICAL: Must always be called in a finally block after interview completes to prevent the process from hanging (see Research Pitfall 2).

   `createMockIO(responses: string[])`: Creates a test mock that replays answers sequentially from the provided array. Returns a mock InterviewIO where:
   - `question()`: Returns `responses[idx++]` (or empty string if exhausted).
   - `select()`: Parses `responses[idx++]` as integer (the zero-based index directly). Return `Math.min(parseInt(answer, 10), options.length - 1)` for safety.
   - `confirm()`: Returns `true` if `responses[idx++]` starts with 'y'.
   - `display()`: Pushes text to an internal `output: string[]` array (captures displayed output for test assertions).
   - `close()`: No-op.
   - Also expose a `getOutput(): string[]` method on the returned object (not on the interface) for test assertions. Use a type intersection: `InterviewIO & { getOutput(): string[] }`.

2. Create `src/cli/prompts.ts` with reusable prompt helpers that build on `InterviewIO`:

   All functions take `io: InterviewIO` as the first parameter.

   - `askText(io, prompt, opts?: { required?: boolean; minLength?: number; maxLength?: number })`: Calls `io.question(prompt)`. If `required` is true and input is empty, re-prompts with "This field is required. ". If `minLength`/`maxLength` are set, validates and re-prompts on failure. Returns the trimmed string.

   - `askOptionalText(io, prompt)`: Calls `io.question(prompt + ' (press Enter to skip) ')`. Returns the trimmed string or `undefined` if empty.

   - `askSelect(io, prompt, options: string[])`: Delegates to `io.select(prompt, options)`. Returns the zero-based index. This is a thin wrapper that exists so interview stages use a consistent API.

   - `askConfirm(io, prompt)`: Delegates to `io.confirm(prompt)`.

   - `askLicenseType(io)`: Special prompt for license type selection. The options are the CANS schema union literals: `['MD', 'DO', 'NP', 'PA', 'CRNA', 'CNM', 'PhD', 'PsyD']`. Calls `io.select()` and returns the literal string (not the index). Use `as const` to match the TypeBox union type.

   - `askAutonomyTier(io, actionName: string)`: Prompts for autonomy tier with explanation. Options: `['autonomous - AI acts independently with post-hoc review', 'supervised - AI drafts, provider approves before execution', 'manual - Provider acts, AI assists on request']`. Returns `'autonomous' | 'supervised' | 'manual'`.

3. Create `test/fixtures/interview-responses.ts`:

   Export `completeInterviewResponses`: An array of strings that represent a complete interview with ALL questions answered. Map each response to the interview stage it corresponds to (comment each entry). This fixture will be used by Plans 02-06 for integration testing. Example shape:
   ```
   // Welcome: acknowledge warning
   'y',
   // Identity: name
   'Dr. Jane Smith',
   // Identity: NPI (optional)
   '1234567890',
   // Credentials: license type (0 = MD)
   '0',
   // Credentials: state
   'TX',
   // ...etc
   ```
   Use the same provider data as `valid-cans-data.ts` where applicable for consistency.

   Export `minimalInterviewResponses`: Same as complete but skips all optional fields (NPI empty, no subspecialty, no institution, etc.).

4. Create `test/unit/cli/io.test.ts`:
   - `createMockIO` returns an object implementing InterviewIO
   - `question()` returns responses sequentially
   - `select()` returns parsed integer indices
   - `confirm()` returns true for 'y', 'yes', 'Y' and false for 'n', 'no', ''
   - `display()` captures output accessible via `getOutput()`
   - Exhausted responses return empty string (does not throw)

5. Create `test/unit/cli/prompts.test.ts`:
   - `askText` with `required: true` reprompts on empty input (mock returns '' then 'valid')
   - `askText` with `minLength: 2` reprompts on 'a' (too short)
   - `askOptionalText` returns undefined on empty input
   - `askOptionalText` returns trimmed string on non-empty input
   - `askLicenseType` returns the literal string for the selected index (e.g., index 0 -> 'MD')
   - `askAutonomyTier` returns the tier string (e.g., index 1 -> 'supervised')
   - `askSelect` returns the zero-based index from io.select

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/cli/
```

**Done:** InterviewIO interface exists with terminal and mock implementations. Prompt utilities handle validation and re-prompting. Mock IO captures output for assertions. Test fixture provides complete and minimal interview response sequences. All existing Phase 1 tests still pass.

---

#### Task 2: CLI subcommand registration and index.ts wiring

**Type:** auto
**Files:**
- `src/cli/commands.ts`
- `src/index.ts`

**Action:**

1. Create `src/cli/commands.ts`:

   Export a `registerCLI` function that registers `careagent init` and `careagent status` as CLI subcommands:

   ```typescript
   import type { CareAgentPluginAPI } from '../adapter/types.js';
   import type { AuditPipeline } from '../audit/pipeline.js';

   export function registerCLI(
     adapter: CareAgentPluginAPI,
     workspacePath: string,
     audit: AuditPipeline,
   ): void {
     // Register 'careagent init' subcommand
     adapter.registerCliCommand({
       name: 'careagent init',
       description: 'Initialize CareAgent with a clinical onboarding interview',
       handler: async () => {
         // Stub — will be wired to interview engine in Plan 06
         console.log('[CareAgent] careagent init — not yet wired. Coming in Plan 06.');
       },
     });

     // Register 'careagent status' subcommand
     adapter.registerCliCommand({
       name: 'careagent status',
       description: 'Show CareAgent activation state and system health',
       handler: async () => {
         // Stub — will be wired to status command in Plan 06
         console.log('[CareAgent] careagent status — not yet wired. Coming in Plan 06.');
       },
     });
   }
   ```

   IMPORTANT: Commander.js supports space-separated names for subcommand registration: `program.command('careagent init')`. The existing adapter's `registerCliCommand` calls `program.command(config.name)`, which means `program.command('careagent init')` will register a subcommand. If this does not work on VPS (see Research Open Question 1), the alternative is to register a `'careagent'` parent command and chain `.command('init')` on the returned Command object. For now, use the space-separated approach as it requires no adapter changes. The adapter already handles this — `program.command('careagent init')` creates a nested command automatically in Commander.js.

2. Update `src/index.ts`:
   - Replace the existing CLI stub (lines 26-32) with a call to `registerCLI(adapter, workspacePath, audit)`.
   - Import `registerCLI` from `'./cli/commands.js'`.
   - The `registerCLI` call must remain in Step 3 (before the activation gate check), because `careagent init` must be available before CANS.md exists.
   - Do NOT change any other part of `src/index.ts`. The adapter, audit pipeline, activation gate, canary, and integrity service remain exactly as Phase 1 built them.

   The modified Step 3 in register() should look like:
   ```typescript
   // Step 3: Register CLI commands (always available — needed before CANS.md exists)
   registerCLI(adapter, workspacePath, audit);
   ```

3. Verify that the existing smoke test and all Phase 1 tests still pass. The mock API in integration tests creates a mock `registerCli` that accepts callbacks — the new `registerCLI` function will call `adapter.registerCliCommand` twice (once for 'init', once for 'status'), which calls `raw.registerCli` through the adapter. Ensure the mock handles multiple `registerCli` calls.

**Verify:**
```bash
pnpm build && pnpm test
```

**Done:** `careagent init` and `careagent status` are registered as CLI subcommands. The old flat `careagent` command stub is replaced. All 131 Phase 1 tests continue to pass. CLI commands are registered before the activation gate check.

---

## Plan 02: Interview Engine and Question Stage Definitions

```yaml
phase: 02-onboarding
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/onboarding/engine.ts
  - src/onboarding/stages.ts
  - src/onboarding/defaults.ts
  - test/unit/onboarding/engine.test.ts
  - test/unit/onboarding/stages.test.ts
autonomous: true
requirements: [ONBD-01]

must_haves:
  truths:
    - "Interview engine runs through all stages sequentially: welcome, identity, credentials, specialty, scope, philosophy, voice, autonomy, consent"
    - "Welcome stage displays NOT HIPAA COMPLIANT warning"
    - "Each stage collects data and produces a partial CANSDocument"
    - "All interview data maps directly to CANS schema fields"
    - "License type selection uses exact TypeBox union literals (MD, DO, NP, PA, CRNA, CNM, PhD, PsyD)"
    - "Autonomy tiers default-display as supervised for order/charge/perform and autonomous for chart"
    - "All hardening flags default to true (maximum safety)"
    - "Consent stage requires HIPAA warning acknowledgment, synthetic data only, and audit consent"
  artifacts:
    - path: "src/onboarding/engine.ts"
      provides: "Interview state machine orchestrator"
      exports: ["runInterview", "InterviewStage", "InterviewState"]
    - path: "src/onboarding/stages.ts"
      provides: "Individual stage handler functions"
      exports: ["welcomeStage", "identityStage", "credentialsStage", "specialtyStage", "scopeStage", "philosophyStage", "voiceStage", "autonomyStage", "consentStage"]
    - path: "src/onboarding/defaults.ts"
      provides: "Default values for CANS document fields"
      exports: ["defaultHardening", "defaultConsent", "defaultAutonomy"]
  key_links:
    - from: "src/onboarding/engine.ts"
      to: "src/onboarding/stages.ts"
      via: "Calls each stage handler in sequence"
      pattern: "Stage.*stage"
    - from: "src/onboarding/engine.ts"
      to: "src/cli/io.ts"
      via: "Accepts InterviewIO for all terminal interaction"
      pattern: "InterviewIO"
    - from: "src/onboarding/stages.ts"
      to: "src/cli/prompts.ts"
      via: "Uses prompt utilities for all user input"
      pattern: "askText|askSelect|askConfirm|askOptionalText|askLicenseType|askAutonomyTier"
    - from: "src/onboarding/stages.ts"
      to: "src/activation/cans-schema.ts"
      via: "Stage outputs map to CANSDocument type fields"
      pattern: "CANSDocument"
```

### Objective

Build the interview engine that orchestrates the onboarding conversation and define all question stage handlers. The engine runs sequentially through stages, collecting data that maps to CANS schema fields.

Purpose: This is the core of `careagent init` -- the structured conversation that discovers a provider's clinical identity. Without this, there is nothing to generate CANS.md from.
Output: A `runInterview(io)` function that returns a complete `CANSDocument` object ready for CANS.md generation.

### Context

```
@.planning/ROADMAP.md
@.planning/phase-2/RESEARCH.md (Pattern 1: Interview State Machine, Interview Stages section)
@src/activation/cans-schema.ts (CANSDocument type, all sub-schemas)
@src/cli/io.ts (from Plan 01 — InterviewIO interface)
@src/cli/prompts.ts (from Plan 01 — prompt utilities)
@test/fixtures/interview-responses.ts (from Plan 01 — mock answer sequences)
```

### Tasks

#### Task 1: Interview engine orchestrator and default values

**Type:** auto
**Files:**
- `src/onboarding/engine.ts`
- `src/onboarding/defaults.ts`
- `test/unit/onboarding/engine.test.ts`

**Action:**

1. Create `src/onboarding/defaults.ts`:

   Export default values used when building the initial CANSDocument:

   - `defaultHardening`: All six boolean flags set to `true` (maximum safety). This matches the design constraint that hardening defaults to maximum safety and providers can toggle during review.
     ```typescript
     export const defaultHardening = {
       tool_policy_lockdown: true,
       exec_approval: true,
       cans_protocol_injection: true,
       docker_sandbox: true,
       safety_guard: true,
       audit_trail: true,
     };
     ```

   - `defaultConsent`: All three consent flags set to `false` (must be explicitly confirmed by provider during interview).
     ```typescript
     export const defaultConsent = {
       hipaa_warning_acknowledged: false,
       synthetic_data_only: false,
       audit_consent: false,
     };
     ```

   - `defaultAutonomy`: Chart defaults to `'autonomous'`, all others to `'supervised'` (safe defaults for clinical operations).
     ```typescript
     export const defaultAutonomy = {
       chart: 'autonomous' as const,
       order: 'supervised' as const,
       charge: 'supervised' as const,
       perform: 'manual' as const,
     };
     ```

2. Create `src/onboarding/engine.ts`:

   Define the `InterviewStage` enum:
   ```typescript
   export enum InterviewStage {
     WELCOME = 'welcome',
     IDENTITY = 'identity',
     CREDENTIALS = 'credentials',
     SPECIALTY = 'specialty',
     SCOPE = 'scope',
     PHILOSOPHY = 'philosophy',
     VOICE = 'voice',
     AUTONOMY = 'autonomy',
     CONSENT = 'consent',
     COMPLETE = 'complete',
   }
   ```

   Define `InterviewState`:
   ```typescript
   export interface InterviewState {
     stage: InterviewStage;
     data: Partial<CANSDocument>;
     philosophy: string;  // Free text stored separately, goes into markdown body
   }
   ```

   Define the `InterviewResult`:
   ```typescript
   export interface InterviewResult {
     data: CANSDocument;
     philosophy: string;  // For markdown body section
   }
   ```

   Export `runInterview(io: InterviewIO): Promise<InterviewResult>`:
   - Creates initial state with `stage: WELCOME`, `data: { version: '1.0' }`, `philosophy: ''`.
   - Runs stages sequentially by importing and calling each stage handler from `stages.ts`.
   - The stage sequence is: welcome -> identity -> credentials -> specialty -> scope -> philosophy -> voice -> autonomy -> consent -> COMPLETE.
   - Each stage handler receives `(state, io)` and returns an updated `InterviewState` with the next stage set.
   - After the consent stage, merge `defaultHardening` into the data (already populated during the autonomy/consent stage).
   - Return the completed `InterviewResult` with the full `CANSDocument` and the philosophy text.
   - Do NOT include the review loop here — that is Plan 03's responsibility. This function runs the interview and returns the raw collected data.

   Also export `runSingleStage(stage: InterviewStage, state: InterviewState, io: InterviewIO): Promise<InterviewState>`:
   - Runs a single stage (used by the review loop in Plan 03 for re-interviewing specific sections).
   - Maps `InterviewStage` to the corresponding stage handler function and calls it.

3. Create `test/unit/onboarding/engine.test.ts`:

   Import `createMockIO` from Plan 01 and `completeInterviewResponses` from fixtures.

   Test cases:
   - `runInterview` with complete responses produces an InterviewResult
   - The returned `data` has all required top-level CANS fields: version, provider, scope, autonomy, hardening, consent
   - The returned `data.provider.name` matches the name given in responses
   - The returned `data.provider.license.type` is one of the valid union literals
   - The returned `data.autonomy` has all four action tiers
   - The returned `data.hardening` has all six boolean flags, all defaulting to `true`
   - The returned `data.consent` has all three boolean flags
   - The returned `philosophy` is a non-empty string
   - `runSingleStage` with IDENTITY stage updates only provider identity fields

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/onboarding/engine.test.ts
```

**Done:** Interview engine orchestrates the full stage sequence and returns a complete CANSDocument. Default hardening flags are all `true`. Consent flags require explicit provider confirmation. Engine supports re-running individual stages for the review loop.

---

#### Task 2: Individual stage handler functions

**Type:** auto
**Files:**
- `src/onboarding/stages.ts`
- `test/unit/onboarding/stages.test.ts`

**Action:**

1. Create `src/onboarding/stages.ts`:

   Import `InterviewIO` from `../cli/io.js`, prompt utilities from `../cli/prompts.js`, types from the engine, and defaults from `./defaults.js`.

   Each stage handler has the signature: `(state: InterviewState, io: InterviewIO) => Promise<InterviewState>`. Each returns a new state with the `stage` field advanced to the next stage and the `data` field updated with collected answers.

   **`welcomeStage`:**
   - Display a welcome banner: "CareAgent Clinical Onboarding"
   - Display a prominent warning: "IMPORTANT: This system is NOT HIPAA compliant. It operates on synthetic data only. Do not enter real patient information."
   - Display a brief explanation of what onboarding will collect: clinical identity, credentials, scope, autonomy preferences.
   - Call `askConfirm(io, 'Do you understand this is NOT HIPAA compliant and uses synthetic data only?')`.
   - If provider does not confirm, display "Onboarding cannot proceed without acknowledging this warning." and re-prompt.
   - Set `state.stage = InterviewStage.IDENTITY`.

   **`identityStage`:**
   - `askText(io, 'Your full name (e.g., Dr. Jane Smith): ', { required: true, minLength: 2 })` -> `provider.name`
   - `askOptionalText(io, 'National Provider Identifier (NPI, 10 digits): ')` -> `provider.npi` (validate format if provided: must be 10 digits)
   - Set `state.stage = InterviewStage.CREDENTIALS`.

   **`credentialsStage`:**
   - `askLicenseType(io)` -> `provider.license.type`
   - `askText(io, 'License state (2-letter abbreviation, e.g., TX): ', { required: true, minLength: 2, maxLength: 2 })` -> `provider.license.state` (convert to uppercase)
   - `askText(io, 'License number: ', { required: true })` -> `provider.license.number`
   - Set `provider.license.verified = false` always (dev platform — future Axon verification).
   - Set `state.stage = InterviewStage.SPECIALTY`.

   **`specialtyStage`:**
   - `askText(io, 'Primary specialty (e.g., Neurosurgery, Internal Medicine): ', { required: true })` -> `provider.specialty`
   - `askOptionalText(io, 'Subspecialty: ')` -> `provider.subspecialty`
   - `askOptionalText(io, 'Institution/Hospital: ')` -> `provider.institution`
   - `askText(io, 'List your clinical privileges (comma-separated, e.g., neurosurgical procedures, spine surgery): ', { required: true })` -> split by comma, trim each, filter empty -> `provider.privileges` (must have at least 1)
   - `askOptionalText(io, 'Credential status: ')` -> if provided, validate against 'active'|'pending'|'expired'. Use `askSelect` with options `['active', 'pending', 'expired']` if provider gives invalid input. Default to 'active' if skipped (use `askSelect` with default).
   - Actually, simplify: `askSelect(io, 'Credential status:', ['active', 'pending', 'expired'])` -> map index to literal. This is cleaner than free text.
   - Set `state.stage = InterviewStage.SCOPE`.

   **`scopeStage`:**
   - Display: "Define what CareAgent is permitted and prohibited from doing in your clinical practice."
   - `askText(io, 'Permitted actions (comma-separated, e.g., chart_operative_note, chart_progress_note): ', { required: true })` -> split, trim, filter -> `scope.permitted_actions` (must have at least 1)
   - `askOptionalText(io, 'Prohibited actions (comma-separated): ')` -> split, trim, filter or `undefined` -> `scope.prohibited_actions`
   - `askOptionalText(io, 'Institutional limitations (comma-separated): ')` -> split, trim, filter or `undefined` -> `scope.institutional_limitations`
   - Set `state.stage = InterviewStage.PHILOSOPHY`.

   **`philosophyStage`:**
   - Display: "Describe your clinical philosophy and approach. This will be included in your CANS.md profile."
   - `askText(io, 'Your clinical philosophy (can be multiple sentences): ', { required: true, minLength: 10 })` -> stored in `state.philosophy` (not in CANS frontmatter — goes in markdown body).
   - Set `state.stage = InterviewStage.VOICE`.

   **`voiceStage`:**
   - Display: "Configure how CareAgent writes clinical documentation in your voice."
   - `askOptionalText(io, 'Documentation tone (e.g., formal, conversational, concise): ')` -> `clinical_voice.tone`
   - `askSelect(io, 'Documentation style:', ['Concise bullet-point notes', 'Narrative paragraphs', 'Structured templates', 'Mixed'])` -> map to `'concise' | 'narrative' | 'structured' | 'mixed'` -> `clinical_voice.documentation_style`
   - `askConfirm(io, 'Use medical eponyms (e.g., Babinski sign vs. extensor plantar response)?')` -> `clinical_voice.eponyms`
   - `askSelect(io, 'Abbreviation style:', ['Standard medical abbreviations', 'Minimal abbreviations', 'Spelled out'])` -> map to `'standard' | 'minimal' | 'spelled-out'` -> `clinical_voice.abbreviations`
   - Set `state.stage = InterviewStage.AUTONOMY`.

   **`autonomyStage`:**
   - Display: "Configure autonomy tiers for each of CareAgent's four atomic actions."
   - Display explanation: "autonomous = AI acts independently; supervised = AI drafts, you approve; manual = you act, AI assists"
   - For each of chart, order, charge, perform: call `askAutonomyTier(io, actionName)`.
   - Show the selected tiers as a summary before proceeding.
   - Set `state.stage = InterviewStage.CONSENT`.

   **`consentStage`:**
   - Display: "Before we generate your CANS.md, please confirm the following:"
   - `askConfirm(io, 'I acknowledge this system is NOT HIPAA compliant')` -> `consent.hipaa_warning_acknowledged` (must be true, re-prompt if false)
   - `askConfirm(io, 'I will use synthetic data only — no real patient information')` -> `consent.synthetic_data_only` (must be true, re-prompt if false)
   - `askConfirm(io, 'I consent to all clinical actions being logged to an audit trail')` -> `consent.audit_consent` (must be true, re-prompt if false)
   - Set hardening to `defaultHardening` (all true).
   - Set `state.stage = InterviewStage.COMPLETE`.

   For optional string fields (subspecialty, institution, NPI, etc.): Only set the property on the data object if the provider gave a non-empty answer. Do not set `undefined` — omit the property entirely so YAML stringify does not produce `field: null`.

2. Create `test/unit/onboarding/stages.test.ts`:

   Use `createMockIO` for all tests.

   Test cases:
   - `welcomeStage` advances to IDENTITY after confirmation
   - `welcomeStage` re-prompts if provider does not confirm HIPAA warning (mock: 'n', then 'y')
   - `welcomeStage` display output includes "NOT HIPAA compliant"
   - `identityStage` sets provider.name and advances to CREDENTIALS
   - `identityStage` sets provider.npi when provided, omits when empty
   - `credentialsStage` sets license.type to a valid literal (e.g., 'MD')
   - `credentialsStage` sets license.state as uppercase 2-char string
   - `credentialsStage` sets license.verified to false always
   - `specialtyStage` sets specialty and splits privileges by comma
   - `specialtyStage` omits subspecialty when skipped
   - `scopeStage` splits permitted_actions by comma, requires at least 1
   - `scopeStage` omits prohibited_actions when skipped
   - `philosophyStage` stores philosophy text in state.philosophy (not in data)
   - `voiceStage` sets all four clinical_voice fields
   - `autonomyStage` sets chart, order, charge, perform tiers
   - `consentStage` sets all three consent booleans to true
   - `consentStage` re-prompts if any consent is refused (mock: 'n', then 'y')
   - `consentStage` sets hardening with all flags true

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/onboarding/
```

**Done:** All nine interview stages are implemented with proper input validation. Stage outputs map directly to CANS schema fields. License types use exact TypeBox union literals. Hardening defaults to maximum safety. Consent requires explicit confirmation for all three flags. Philosophy text is captured separately for the markdown body.

---

## Plan 03: CANS.md Generator and Review Loop

```yaml
phase: 02-onboarding
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/onboarding/cans-generator.ts
  - src/onboarding/review.ts
  - test/unit/onboarding/cans-generator.test.ts
  - test/unit/onboarding/review.test.ts
autonomous: true
requirements: [ONBD-02, ONBD-05]

must_haves:
  truths:
    - "Generated CANS.md validates against TypeBox CANSSchema before writing"
    - "Generated CANS.md has YAML frontmatter between --- delimiters and a markdown body"
    - "Review loop displays CANS.md preview and offers approve, edit section, or start over"
    - "Provider can re-interview specific sections without restarting the entire interview"
    - "Hardening flags are shown in review with toggleable options"
    - "On approval, CANS.md is written to workspace and integrity hash is seeded"
    - "Generated CANS.md round-trips through parse -> validate successfully"
  artifacts:
    - path: "src/onboarding/cans-generator.ts"
      provides: "Transforms interview data into CANS.md file content"
      exports: ["generateCANSContent", "GenerationResult"]
    - path: "src/onboarding/review.ts"
      provides: "Review-edit-regenerate loop for iterative refinement"
      exports: ["reviewLoop"]
  key_links:
    - from: "src/onboarding/cans-generator.ts"
      to: "src/vendor/yaml/index.ts"
      via: "stringifyYAML for YAML frontmatter"
      pattern: "stringifyYAML"
    - from: "src/onboarding/cans-generator.ts"
      to: "src/activation/cans-schema.ts"
      via: "Value.Check(CANSSchema) for pre-write validation"
      pattern: "Value\\.Check.*CANSSchema"
    - from: "src/onboarding/review.ts"
      to: "src/onboarding/cans-generator.ts"
      via: "generateCANSContent called on each review cycle"
      pattern: "generateCANSContent"
    - from: "src/onboarding/review.ts"
      to: "src/onboarding/engine.ts"
      via: "runSingleStage for section re-interviews"
      pattern: "runSingleStage"
    - from: "src/onboarding/review.ts"
      to: "src/activation/cans-integrity.ts"
      via: "updateKnownGoodHash after final write"
      pattern: "updateKnownGoodHash"
```

### Objective

Build the CANS.md generation pipeline that transforms interview data into a valid CANS.md file, and the review loop that lets the provider inspect, modify, and approve the generated file before it is written.

Purpose: This is the bridge between the interview (Plan 02) and the activation gate (Phase 1). The generated file must pass the same `ActivationGate.check()` that Phase 1 built. The review loop ensures the provider controls the output.
Output: `generateCANSContent()` produces a valid CANS.md string. `reviewLoop()` orchestrates preview-edit-approve until the provider is satisfied.

### Context

```
@.planning/ROADMAP.md
@.planning/phase-2/RESEARCH.md (Pattern 3: CANS.md Generation, Pattern 6: Review-Edit-Regenerate Loop, Pitfall 1: Generated CANS.md Fails Activation Gate)
@src/activation/cans-schema.ts (CANSSchema, CANSDocument)
@src/activation/cans-integrity.ts (updateKnownGoodHash)
@src/vendor/yaml/index.ts (stringifyYAML)
@src/onboarding/engine.ts (from Plan 02 — InterviewResult, runSingleStage)
@src/cli/io.ts (from Plan 01 — InterviewIO)
@test/fixtures/valid-cans-data.ts (reference for valid CANS data shape)
```

### Tasks

#### Task 1: CANS.md content generator

**Type:** auto
**Files:**
- `src/onboarding/cans-generator.ts`
- `test/unit/onboarding/cans-generator.test.ts`

**Action:**

1. Create `src/onboarding/cans-generator.ts`:

   Import `stringifyYAML` from `../vendor/yaml/index.js`, `Value` from `@sinclair/typebox/value`, `CANSSchema` and `CANSDocument` from `../activation/cans-schema.js`.

   Define `GenerationResult`:
   ```typescript
   export interface GenerationResult {
     success: boolean;
     content?: string;        // Full CANS.md file content (frontmatter + body)
     document?: CANSDocument; // The validated document object
     errors?: Array<{ path: string; message: string }>;
   }
   ```

   Export `generateCANSContent(data: CANSDocument, philosophy: string): GenerationResult`:

   Step 1: Validate the data object against `CANSSchema` using `Value.Check(CANSSchema, data)` BEFORE any YAML stringification. This catches schema violations at the source (see Research Pitfall 1). If validation fails, collect errors from `Value.Errors(CANSSchema, data)` and return `{ success: false, errors }`.

   Step 2: Stringify the data to YAML using `stringifyYAML(data)`. The vendored yaml package uses YAML 1.2 by default, which avoids implicit boolean/number coercion (Research Pitfall 4).

   Step 3: Generate the markdown body. The body includes:
   ```markdown
   # Care Agent Nervous System

   ## Provider Summary

   {provider.name} ({provider.license.type})
   Specialty: {provider.specialty}
   {if subspecialty: Subspecialty: {subspecialty}}
   {if institution: Institution: {institution}}

   ## Clinical Philosophy

   {philosophy text from interview}

   ## Autonomy Configuration

   | Action | Tier |
   |--------|------|
   | Chart | {autonomy.chart} |
   | Order | {autonomy.order} |
   | Charge | {autonomy.charge} |
   | Perform | {autonomy.perform} |

   ## Hardening Configuration

   All hardening layers are enabled by default for maximum safety.
   {list each flag and its value}
   ```

   Step 4: Assemble the complete file: `---\n{yaml}---\n\n{body}`.

   Step 5: Return `{ success: true, content, document: data }`.

   Also export `generatePreview(data: CANSDocument, philosophy: string): string`:
   - Generates a human-readable summary for display during review (not the full YAML).
   - Shows: provider name, license, specialty, autonomy tiers, hardening flags (with on/off labels), consent status.
   - This is what the provider sees in the review loop — more readable than raw YAML.

2. Create `test/unit/onboarding/cans-generator.test.ts`:

   Import `validCANSData` from fixtures for a known-good data object.

   Test cases:
   - `generateCANSContent` with valid data returns `{ success: true, content: '---\n...' }`
   - Generated content starts with `---\n` and contains `---\n\n` (frontmatter delimiters)
   - Generated content includes the markdown body with "# Care Agent Nervous System"
   - Generated content includes philosophy text in the body
   - The generated CANS.md round-trips: parse the content with `parseFrontmatter`, validate with `Value.Check(CANSSchema)` — must pass. This is the critical round-trip test from Research Pitfall 1.
   - `generateCANSContent` with missing required field returns `{ success: false, errors: [...] }`
   - `generateCANSContent` with invalid license type returns errors with path `/provider/license/type`
   - `generatePreview` returns a readable string containing provider name, specialty, and autonomy tiers
   - All hardening flags appear in generated content
   - Optional fields (subspecialty, institution) are omitted from YAML when not present
   - Philosophy text appears in body, not in YAML frontmatter

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/onboarding/cans-generator.test.ts
```

**Done:** Generator validates data before YAML stringify, produces frontmatter + markdown body, and the output round-trips through parse + validate successfully. Preview function provides human-readable summary.

---

#### Task 2: Review-edit-regenerate loop

**Type:** auto
**Files:**
- `src/onboarding/review.ts`
- `test/unit/onboarding/review.test.ts`

**Action:**

1. Create `src/onboarding/review.ts`:

   Import types from engine, generator, IO, and integrity modules.

   Export `reviewLoop(io: InterviewIO, result: InterviewResult, workspacePath: string, audit: AuditPipeline): Promise<void>`:

   The function implements the review-edit-regenerate cycle:

   ```
   loop:
     1. Generate CANS.md content from current data
     2. If generation fails (validation errors), display errors, force re-interview of failing section, continue loop
     3. Display preview using generatePreview()
     4. Present review menu:
        0: "Approve and save"
        1: "Edit provider information (name, NPI)"
        2: "Edit credentials (license type, state, number)"
        3: "Edit specialty and institution"
        4: "Edit scope (permitted/prohibited actions)"
        5: "Edit clinical philosophy"
        6: "Edit clinical voice"
        7: "Edit autonomy tiers"
        8: "Toggle hardening flags"
        9: "Start over (full re-interview)"
     5. On approve (0):
        a. Generate final CANS.md content
        b. Write to {workspacePath}/CANS.md using writeFileSync
        c. Call updateKnownGoodHash(workspacePath, content) to seed integrity
        d. Log audit event: action='cans_generated', outcome='allowed', details={provider name, specialty}
        e. Display success message: "CANS.md generated and saved to workspace."
        f. Return
     6. On edit section (1-7):
        a. Map menu choice to InterviewStage enum
        b. Call runSingleStage(stage, currentState, io)
        c. Update result data with new stage output
        d. Continue loop
     7. On toggle hardening (8):
        a. Display current hardening flags with numbered toggle options
        b. Let provider select a flag to toggle (or done to return)
        c. Loop until provider selects done
        d. Continue outer loop
     8. On start over (9):
        a. Run full runInterview(io) again
        b. Replace result data entirely
        c. Continue loop
   ```

   Use `writeFileSync` from `node:fs` and `join` from `node:path` for file writes.

   IMPORTANT: After writing CANS.md, ALWAYS call `updateKnownGoodHash(workspacePath, content)`. This seeds the integrity store so the activation gate will accept the file on next load (Research Pitfall 6).

   IMPORTANT: The review loop must ensure the generated CANS.md passes `Value.Check(CANSSchema, data)` before writing. Never write a file that will fail activation.

2. Create `test/unit/onboarding/review.test.ts`:

   Use `createMockIO` and temp directories for all tests.

   Test cases:
   - Approve immediately: mock selects "0" (approve), CANS.md is written to workspace, integrity hash exists
   - Edit provider and approve: mock selects "1" (edit provider), provides new name, then "0" (approve). Written CANS.md contains the new name.
   - Edit autonomy and approve: mock selects "7" (edit autonomy), changes tiers, then "0". Written CANS.md reflects new tiers.
   - Toggle hardening: mock selects "8" (toggle), toggles a flag, selects done, then "0". Written CANS.md has toggled flag.
   - Written CANS.md passes `parseFrontmatter` + `Value.Check(CANSSchema)` (round-trip validation)
   - `updateKnownGoodHash` was called (verify by checking `.careagent/cans-integrity.json` exists in temp dir)
   - Audit event was logged (check AUDIT.log exists and contains 'cans_generated')
   - Start over: mock selects "9" (start over), provides new complete interview, then "0" (approve)

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/onboarding/review.test.ts
```

**Done:** Review loop displays preview, handles section editing via re-interview, supports hardening flag toggles, validates before writing, seeds integrity hash, and logs audit event. Provider can iteratively refine CANS.md until satisfied.

---

## Plan 04: Workspace File Supplementation

```yaml
phase: 02-onboarding
plan: 04
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/onboarding/workspace-writer.ts
  - src/onboarding/workspace-content.ts
  - test/unit/onboarding/workspace-writer.test.ts
  - test/unit/onboarding/workspace-content.test.ts
autonomous: true
requirements: [ONBD-03]

must_haves:
  truths:
    - "SOUL.md is supplemented with clinical persona traits, scope awareness, and voice characteristics"
    - "AGENTS.md is supplemented with clinical safety operating rules and documentation standards"
    - "USER.md is supplemented with provider identity, credentials summary, and preferences"
    - "CareAgent sections use <!-- CareAgent: BEGIN --> / <!-- CareAgent: END --> markers"
    - "Existing content in workspace files is preserved — never replaced"
    - "Running supplementation twice produces the same result (idempotent)"
    - "Files that do not exist are created with only the CareAgent section"
  artifacts:
    - path: "src/onboarding/workspace-writer.ts"
      provides: "Read-modify-write with marker detection for workspace files"
      exports: ["supplementFile", "supplementWorkspaceFiles"]
    - path: "src/onboarding/workspace-content.ts"
      provides: "Clinical content generators for each workspace file"
      exports: ["generateSoulContent", "generateAgentsContent", "generateUserContent"]
  key_links:
    - from: "src/onboarding/workspace-writer.ts"
      to: "node:fs"
      via: "readFileSync/writeFileSync for workspace file I/O"
      pattern: "readFileSync|writeFileSync"
    - from: "src/onboarding/workspace-content.ts"
      to: "src/activation/cans-schema.ts"
      via: "Uses CANSDocument type for content generation"
      pattern: "CANSDocument"
```

### Objective

Build the workspace file supplementation system that writes clinical content into SOUL.md, AGENTS.md, and USER.md using HTML comment markers, preserving any existing provider-authored content.

Purpose: These workspace files inform OpenClaw's agent about the provider's clinical identity, operating rules, and preferences. Without supplementation, the agent has no clinical context even after CANS.md is activated.
Output: Three workspace files supplemented with CareAgent-managed clinical content that is idempotent and non-destructive.

### Context

```
@.planning/ROADMAP.md
@.planning/phase-2/RESEARCH.md (Pattern 4: Workspace File Supplementation with Markers, Pitfall 3: Workspace File Corruption)
@src/activation/cans-schema.ts (CANSDocument type)
```

### Tasks

#### Task 1: Workspace writer (read-modify-write with markers)

**Type:** auto
**Files:**
- `src/onboarding/workspace-writer.ts`
- `test/unit/onboarding/workspace-writer.test.ts`

**Action:**

1. Create `src/onboarding/workspace-writer.ts`:

   Define constants:
   ```typescript
   const BEGIN_MARKER = '<!-- CareAgent: BEGIN -->';
   const END_MARKER = '<!-- CareAgent: END -->';
   ```

   Export `supplementFile(existingContent: string, clinicalSection: string): string`:
   - Pure function. Takes existing file content and the clinical section to insert.
   - If both `BEGIN_MARKER` and `END_MARKER` are found (and END is after BEGIN): Replace everything between them (inclusive of markers) with the new marked section.
   - If markers are not found and content is empty/whitespace: Return just the marked section with trailing newline.
   - If markers are not found and content exists: Append the marked section after the existing content. Add `\n\n` separator if the existing content does not end with `\n`, or just `\n` if it does.
   - The marked section is: `{BEGIN_MARKER}\n{clinicalSection}\n{END_MARKER}`
   - Returns the updated content string.

   Export `supplementWorkspaceFiles(workspacePath: string, data: CANSDocument, philosophy: string): void`:
   - Import content generators from `workspace-content.ts`.
   - For each of SOUL.md, AGENTS.md, USER.md:
     a. Build the file path: `join(workspacePath, filename)`.
     b. Read existing content: `existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''`.
     c. Generate clinical content using the corresponding content generator.
     d. Call `supplementFile(existingContent, clinicalContent)`.
     e. Write the result using the atomic write pattern: write to `{filePath}.tmp`, then `renameSync` to `filePath`. This prevents partial writes (Research Pitfall 3).
   - Use `node:fs` readFileSync, writeFileSync, renameSync, existsSync.
   - Use `node:path` join.

2. Create `test/unit/onboarding/workspace-writer.test.ts`:

   Test cases for `supplementFile`:
   - Empty content: Returns marked section only
   - Content without markers: Appends marked section after existing content
   - Content with existing markers: Replaces marked section, preserves content before and after
   - Content with markers and content after END marker: Preserves trailing content
   - Idempotent: Calling twice with the same clinical section produces the same output
   - Idempotent: Calling twice with a different clinical section replaces only the marked section
   - Content ending without newline: Adds `\n\n` separator before marked section
   - Content ending with newline: Adds `\n` separator before marked section
   - Markers must be in correct order (BEGIN before END); partial markers (only BEGIN) do not match

   Test cases for `supplementWorkspaceFiles`:
   - Creates all three files (SOUL.md, AGENTS.md, USER.md) in a temp workspace
   - Files contain the BEGIN and END markers
   - Pre-existing content in SOUL.md is preserved (write content first, then supplement, verify original + marked section)
   - Running supplement twice does not duplicate the CareAgent section
   - Files are written atomically (`.tmp` then rename — verify by checking no `.tmp` files remain)

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/onboarding/workspace-writer.test.ts
```

**Done:** Workspace writer preserves existing content, uses HTML comment markers, is idempotent, and writes atomically.

---

#### Task 2: Clinical content generators for each workspace file

**Type:** auto
**Files:**
- `src/onboarding/workspace-content.ts`
- `test/unit/onboarding/workspace-content.test.ts`

**Action:**

1. Create `src/onboarding/workspace-content.ts`:

   Import `CANSDocument` from `../activation/cans-schema.js`.

   Export `generateSoulContent(data: CANSDocument, philosophy: string): string`:
   SOUL.md defines the agent's persona and behavioral boundaries.
   ```markdown
   ## Clinical Persona

   You are a clinical AI assistant for {provider.name}, a {provider.license.type} specializing in {provider.specialty}.
   {if subspecialty: Your subspecialty focus is {subspecialty}.}
   {if institution: You operate within {institution}.}

   ## Clinical Philosophy

   {philosophy text}

   ## Scope Awareness

   You are permitted to assist with: {permitted_actions joined with ', '}
   {if prohibited_actions: You must NEVER assist with: {prohibited_actions joined with ', '}}
   {if institutional_limitations: Institutional limitations: {institutional_limitations joined with ', '}}

   ## Voice

   {if clinical_voice.tone: Tone: {tone}}
   {if clinical_voice.documentation_style: Documentation style: {documentation_style}}
   {if clinical_voice.eponyms: Use medical eponyms: {yes/no}}
   {if clinical_voice.abbreviations: Abbreviation style: {abbreviations}}
   ```

   Export `generateAgentsContent(data: CANSDocument): string`:
   AGENTS.md defines operating rules and priorities.
   ```markdown
   ## Clinical Safety Rules

   1. NEVER provide clinical advice outside {provider.specialty} scope
   2. NEVER generate content for prohibited actions: {prohibited_actions or 'none defined'}
   3. ALWAYS flag when a request may exceed institutional limitations
   4. ALWAYS include appropriate disclaimers on generated clinical content
   5. This system operates on SYNTHETIC DATA ONLY — never process real patient information

   ## Documentation Standards

   - All clinical notes must follow the provider's documentation style
   - Generated content is DRAFT until provider review
   - Autonomy tiers: Chart={chart}, Order={order}, Charge={charge}, Perform={perform}
   - Actions at 'manual' tier require explicit provider initiation
   - Actions at 'supervised' tier require provider approval before execution

   ## Audit Compliance

   - Every action is logged to the audit trail
   - Every blocked action is logged with rationale
   - The audit trail is append-only and hash-chained
   ```

   Export `generateUserContent(data: CANSDocument): string`:
   USER.md defines who the user is.
   ```markdown
   ## Provider Identity

   - Name: {provider.name}
   - License: {provider.license.type} ({provider.license.state}) #{provider.license.number}
   {if npi: - NPI: {npi}}
   - Specialty: {provider.specialty}
   {if subspecialty: - Subspecialty: {subspecialty}}
   {if institution: - Institution: {institution}}
   - Credential Status: {credential_status or 'active'}

   ## Preferences

   - Chart autonomy: {autonomy.chart}
   - Order autonomy: {autonomy.order}
   - Charge autonomy: {autonomy.charge}
   - Perform autonomy: {autonomy.perform}
   ```

   All generators are pure functions (no I/O). They take data and return a string. Conditional sections are omitted entirely (not rendered as empty) when the corresponding optional field is not present.

2. Create `test/unit/onboarding/workspace-content.test.ts`:

   Import `validCANSData` from fixtures.

   Test cases:
   - `generateSoulContent` includes provider name and specialty
   - `generateSoulContent` includes philosophy text
   - `generateSoulContent` includes permitted actions
   - `generateSoulContent` omits prohibited actions section when empty
   - `generateSoulContent` includes clinical voice settings when present
   - `generateSoulContent` omits voice section when clinical_voice is undefined
   - `generateAgentsContent` includes clinical safety rules
   - `generateAgentsContent` references the correct autonomy tiers
   - `generateAgentsContent` includes synthetic data warning
   - `generateUserContent` includes provider name, license, specialty
   - `generateUserContent` includes NPI when present
   - `generateUserContent` omits NPI line when not present
   - `generateUserContent` includes autonomy preferences
   - All three generators return non-empty strings
   - All three generators produce valid markdown (no undefined or null in output)

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/onboarding/workspace-content.test.ts
```

**Done:** Content generators produce clinical sections for SOUL.md (persona + philosophy + scope), AGENTS.md (safety rules + documentation standards), and USER.md (identity + preferences). Optional fields are cleanly omitted when not present.

---

## Plan 05: Status Command Implementation

```yaml
phase: 02-onboarding
plan: 05
type: execute
wave: 4
depends_on: [01]
files_modified:
  - src/cli/status-command.ts
  - test/unit/cli/status-command.test.ts
autonomous: true
requirements: [ONBD-04]

must_haves:
  truths:
    - "careagent status shows activation state (ACTIVE or INACTIVE with reason)"
    - "When active, status shows provider name, specialty, license, institution"
    - "Status shows autonomy tier configuration for all four actions"
    - "Status shows hardening layer status (enabled/disabled per flag)"
    - "Status shows audit stats (total entries, chain validity, last entry timestamp)"
    - "Status works when CANS.md does not exist (shows INACTIVE)"
    - "Status works when AUDIT.log does not exist (shows zero entries)"
  artifacts:
    - path: "src/cli/status-command.ts"
      provides: "Status command implementation"
      exports: ["runStatusCommand", "formatStatus", "readAuditStats"]
  key_links:
    - from: "src/cli/status-command.ts"
      to: "src/activation/gate.ts"
      via: "ActivationGate.check() for activation state"
      pattern: "ActivationGate"
    - from: "src/cli/status-command.ts"
      to: "src/activation/cans-integrity.ts"
      via: "Reads integrity store for hash status"
      pattern: "cans-integrity"
    - from: "src/cli/status-command.ts"
      to: "src/audit/pipeline.ts"
      via: "AuditPipeline.verifyChain() for chain validity"
      pattern: "verifyChain"
```

### Objective

Implement the `careagent status` command that reports activation state, CANS.md summary, hardening layer status, and audit stats.

Purpose: The status command gives the provider a single view of their CareAgent configuration and system health. It is the diagnostic tool for "is my clinical agent working?"
Output: A `runStatusCommand` function that produces formatted terminal output.

### Context

```
@.planning/ROADMAP.md
@.planning/phase-2/RESEARCH.md (Status Command Output example, Pitfall 5: Status Command Fails on Empty Audit Log)
@src/activation/gate.ts (ActivationGate, ActivationResult)
@src/activation/cans-integrity.ts (getIntegrityStorePath, verifyIntegrity)
@src/audit/pipeline.ts (AuditPipeline)
```

### Tasks

#### Task 1: Status command implementation and tests

**Type:** auto
**Files:**
- `src/cli/status-command.ts`
- `test/unit/cli/status-command.test.ts`

**Action:**

1. Create `src/cli/status-command.ts`:

   Import `ActivationGate` from `../activation/gate.js`, `AuditPipeline` from `../audit/pipeline.js`, `existsSync`, `readFileSync` from `node:fs`, `join` from `node:path`.

   Define `AuditStats`:
   ```typescript
   interface AuditStats {
     totalEntries: number;
     chainValid: boolean;
     chainError?: string;
     lastTimestamp: string | null;
   }
   ```

   Export `readAuditStats(workspacePath: string): AuditStats`:
   - Build the audit log path: `join(workspacePath, '.careagent', 'AUDIT.log')`.
   - If file does not exist or is empty, return `{ totalEntries: 0, chainValid: true, lastTimestamp: null }`.
   - Read the file, split by newlines, filter empty lines.
   - Count total entries.
   - Parse the last non-empty line to extract its `timestamp` field.
   - Create a temporary `AuditPipeline` to call `verifyChain()` for chain validity. OR: Instantiate `AuditWriter` directly with the log path and call `verifyChain()`. Use a simpler approach — create the pipeline with the workspace path, call `verifyChain()`.
   - Actually, to avoid creating a new audit pipeline (which would write a genesis entry), read the file manually and create an `AuditWriter` just for chain verification. Import `AuditWriter` from `../audit/writer.js`.
   - Wrap in try/catch. On error, return `{ totalEntries: 0, chainValid: false, chainError: message, lastTimestamp: null }`.

   Export `formatStatus(workspacePath: string): string`:
   - Create an `ActivationGate` and call `check()`. Use a no-op audit callback for the gate since status is read-only.
   - Call `readAuditStats(workspacePath)`.
   - Check integrity store: `existsSync(getIntegrityStorePath(workspacePath))`.

   Format output:
   ```
   CareAgent Status
   ================

   Clinical Mode:    {ACTIVE or INACTIVE}
   {if inactive: Reason:           {reason}}

   {if active:
   Provider:         {name}
   License:          {license.type} ({license.state}) #{license.number}
   Specialty:        {specialty}
   {if subspecialty: Subspecialty:     {subspecialty}}
   {if institution: Institution:      {institution}}

   Autonomy Tiers:
     Chart:          {chart}
     Order:          {order}
     Charge:         {charge}
     Perform:        {perform}

   Hardening Layers:
     Tool Policy:    {on/off}
     Exec Approval:  {on/off}
     CANS Injection: {on/off}
     Docker Sandbox: {on/off}
     Safety Guard:   {on/off}
     Audit Trail:    {on/off}
   }

   Audit Stats:
     Total Entries:  {N}
     Chain Valid:    {Yes or NO - BROKEN}
     Last Entry:     {timestamp or N/A}

   Integrity:
     CANS.md Hash:   {Verified or Not verified or No hash stored}
   ```

   Export `runStatusCommand(workspacePath: string): void`:
   - Calls `formatStatus(workspacePath)` and prints with `console.log`.

2. Create `test/unit/cli/status-command.test.ts`:

   Use temp directories for each test.

   Test cases:
   - Empty workspace (no CANS.md, no audit): shows "INACTIVE", "N/A" for audit, "No hash stored" for integrity
   - Workspace with valid CANS.md: shows "ACTIVE", provider name, specialty, license, autonomy tiers, hardening flags
   - Workspace with malformed CANS.md: shows "INACTIVE" with validation reason
   - `readAuditStats` with no AUDIT.log: returns `{ totalEntries: 0, chainValid: true, lastTimestamp: null }`
   - `readAuditStats` with 5 entries: returns correct count and last timestamp
   - `readAuditStats` with corrupted entry: returns `{ chainValid: false }`
   - `formatStatus` output contains "CareAgent Status" header
   - `formatStatus` for active workspace contains all six hardening flag labels
   - `formatStatus` for active workspace contains all four autonomy tier labels
   - Integrity section shows "Verified" when integrity store exists and matches
   - Integrity section shows "Not verified" when integrity store hash mismatches

**Verify:**
```bash
pnpm build && pnpm test -- --reporter=verbose test/unit/cli/status-command.test.ts
```

**Done:** Status command reports activation state, provider summary, autonomy tiers, hardening flags, audit stats, and integrity status. Handles all edge cases: no CANS.md, no audit log, corrupted chain.

---

## Plan 06: Integration Wiring and Comprehensive Tests

```yaml
phase: 02-onboarding
plan: 06
type: execute
wave: 5
depends_on: [03, 04, 05]
files_modified:
  - src/cli/commands.ts
  - src/cli/init-command.ts
  - test/integration/onboarding.test.ts
  - test/integration/status.test.ts
autonomous: true
requirements: [ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05]

must_haves:
  truths:
    - "careagent init runs full interview, generates CANS.md, supplements workspace files, in a single command"
    - "careagent status reports correct state after careagent init completes"
    - "Generated CANS.md activates clinical mode via ActivationGate.check()"
    - "SOUL.md, AGENTS.md, USER.md are supplemented with clinical content after init"
    - "Provider can review and edit CANS.md before finalization (iterative refinement)"
    - "Integrity hash is seeded after CANS.md generation"
    - "Audit log records the onboarding generation event"
    - "All existing Phase 1 tests (131) continue to pass"
    - "Full test suite passes with coverage above 80%"
  artifacts:
    - path: "src/cli/init-command.ts"
      provides: "Init command orchestrator wiring interview, generation, review, and workspace supplementation"
      exports: ["runInitCommand"]
    - path: "test/integration/onboarding.test.ts"
      provides: "End-to-end onboarding integration tests"
    - path: "test/integration/status.test.ts"
      provides: "End-to-end status command integration tests"
  key_links:
    - from: "src/cli/init-command.ts"
      to: "src/onboarding/engine.ts"
      via: "runInterview(io)"
      pattern: "runInterview"
    - from: "src/cli/init-command.ts"
      to: "src/onboarding/review.ts"
      via: "reviewLoop(io, result, workspacePath, audit)"
      pattern: "reviewLoop"
    - from: "src/cli/init-command.ts"
      to: "src/onboarding/workspace-writer.ts"
      via: "supplementWorkspaceFiles after CANS.md approval"
      pattern: "supplementWorkspaceFiles"
    - from: "src/cli/commands.ts"
      to: "src/cli/init-command.ts"
      via: "Wires handler to careagent init subcommand"
      pattern: "runInitCommand"
    - from: "src/cli/commands.ts"
      to: "src/cli/status-command.ts"
      via: "Wires handler to careagent status subcommand"
      pattern: "runStatusCommand"
    - from: "test/integration/onboarding.test.ts"
      to: "src/activation/gate.ts"
      via: "Verifies generated CANS.md activates clinical mode"
      pattern: "ActivationGate"
```

### Objective

Wire the init command to orchestrate the full onboarding flow (interview -> generation -> review -> workspace supplementation), wire the status command, and create comprehensive integration tests that verify all five ONBD requirements end-to-end.

Purpose: This plan connects all the pieces built in Plans 01-05 into a working whole and proves all Phase 2 requirements are met.
Output: Working `careagent init` and `careagent status` commands, comprehensive integration test suite.

### Context

```
@.planning/ROADMAP.md (Phase 2 Success Criteria)
@.planning/REQUIREMENTS.md (ONBD-01 through ONBD-05)
@src/cli/commands.ts (from Plan 01 — stub handlers to replace)
@src/onboarding/engine.ts (from Plan 02 — runInterview)
@src/onboarding/review.ts (from Plan 03 — reviewLoop)
@src/onboarding/workspace-writer.ts (from Plan 04 — supplementWorkspaceFiles)
@src/cli/status-command.ts (from Plan 05 — runStatusCommand)
@src/activation/gate.ts (ActivationGate for verification)
@test/fixtures/interview-responses.ts (from Plan 01 — mock response sequences)
```

### Tasks

#### Task 1: Init command orchestrator and CLI wiring

**Type:** auto
**Files:**
- `src/cli/init-command.ts`
- `src/cli/commands.ts`

**Action:**

1. Create `src/cli/init-command.ts`:

   Export `runInitCommand(io: InterviewIO, workspacePath: string, audit: AuditPipeline): Promise<void>`:

   This is the orchestrator for the full onboarding flow:

   ```typescript
   async function runInitCommand(
     io: InterviewIO,
     workspacePath: string,
     audit: AuditPipeline,
   ): Promise<void> {
     try {
       // Step 1: Run the interview
       const result = await runInterview(io);

       // Step 2: Enter review loop (handles generation, preview, editing, and final write)
       // reviewLoop writes CANS.md and seeds integrity hash on approval
       await reviewLoop(io, result, workspacePath, audit);

       // Step 3: Supplement workspace files
       supplementWorkspaceFiles(workspacePath, result.data, result.philosophy);

       // Step 4: Success summary
       io.display('\n--- Onboarding Complete ---');
       io.display(`CANS.md generated for ${result.data.provider.name}`);
       io.display('Workspace files supplemented: SOUL.md, AGENTS.md, USER.md');
       io.display('Run "careagent status" to verify activation.\n');
     } finally {
       io.close();
     }
   }
   ```

   IMPORTANT: The `io.close()` call is in a `finally` block to prevent the process from hanging if the interview errors or is cancelled (Research Pitfall 2).

   IMPORTANT: `supplementWorkspaceFiles` runs AFTER the review loop approves and writes CANS.md. The workspace files reference data from the approved CANS.md, not the raw interview data. However, since the review loop may modify the data object in place, we pass `result.data` which reflects the final approved state.

   Note: The `runInitCommand` function accepts `InterviewIO` as a parameter (not creating it internally). This is intentional — it allows tests to inject `createMockIO` while production code passes `createTerminalIO()`.

2. Update `src/cli/commands.ts`:

   Replace the stub handlers with real implementations:

   ```typescript
   import { createTerminalIO } from './io.js';
   import { runInitCommand } from './init-command.js';
   import { runStatusCommand } from './status-command.js';

   export function registerCLI(
     adapter: CareAgentPluginAPI,
     workspacePath: string,
     audit: AuditPipeline,
   ): void {
     adapter.registerCliCommand({
       name: 'careagent init',
       description: 'Initialize CareAgent with a clinical onboarding interview',
       handler: async () => {
         const io = createTerminalIO();
         await runInitCommand(io, workspacePath, audit);
       },
     });

     adapter.registerCliCommand({
       name: 'careagent status',
       description: 'Show CareAgent activation state and system health',
       handler: () => {
         runStatusCommand(workspacePath);
       },
     });
   }
   ```

   The `init` handler creates a `createTerminalIO()` for production. The `status` handler calls `runStatusCommand` synchronously (no interactive I/O needed).

**Verify:**
```bash
pnpm build && pnpm test
```

**Done:** Init command orchestrates interview -> review -> workspace supplementation. CLI commands are wired to real implementations. Terminal IO is properly closed in finally block.

---

#### Task 2: Comprehensive integration tests for all Phase 2 requirements

**Type:** auto
**Files:**
- `test/integration/onboarding.test.ts`
- `test/integration/status.test.ts`

**Action:**

1. Create `test/integration/onboarding.test.ts`:

   Full end-to-end tests using temporary workspaces and `createMockIO`.

   **Test group: "ONBD-01: careagent init interview flow"**
   - Complete interview with `completeInterviewResponses`: `runInitCommand` completes without error
   - Interview collects provider name, license type, specialty, scope, autonomy, consent (verify via the written CANS.md)
   - Interview includes HIPAA warning acknowledgment (check CANS.md consent section)

   **Test group: "ONBD-02: CANS.md generation and activation"**
   - After init, CANS.md exists in workspace directory
   - CANS.md content starts with `---` (has frontmatter)
   - CANS.md passes `parseFrontmatter` + `Value.Check(CANSSchema)` (validates against TypeBox schema)
   - `ActivationGate.check()` returns `{ active: true }` for the generated CANS.md
   - CANS.md contains the provider name from the interview
   - CANS.md contains the correct license type, specialty, autonomy tiers
   - CANS.md markdown body includes "Care Agent Nervous System"
   - CANS.md markdown body includes the philosophy text

   **Test group: "ONBD-03: Workspace file supplementation"**
   - After init, SOUL.md exists in workspace and contains CareAgent markers
   - After init, AGENTS.md exists in workspace and contains CareAgent markers
   - After init, USER.md exists in workspace and contains CareAgent markers
   - SOUL.md contains provider specialty and philosophy
   - AGENTS.md contains clinical safety rules
   - USER.md contains provider name and license info
   - Pre-existing SOUL.md content is preserved (create a SOUL.md with "My existing content" before running init, verify it is still there after)
   - Running init twice does not duplicate CareAgent sections (idempotent)

   **Test group: "ONBD-05: Iterative refinement"**
   - Mock IO that edits provider name during review: responses select "1" (edit provider), provide new name, then "0" (approve). Verify CANS.md contains the new name, not the original.
   - Mock IO that toggles a hardening flag: responses select "8" (toggle), toggle docker_sandbox, select done, then "0". Verify CANS.md has docker_sandbox: false.

   **Test group: "Post-init verification"**
   - Integrity hash file `.careagent/cans-integrity.json` exists after init
   - Audit log `.careagent/AUDIT.log` contains a 'cans_generated' entry
   - Audit chain is valid after init (verifyChain returns valid: true)

2. Create `test/integration/status.test.ts`:

   **Test group: "ONBD-04: careagent status command"**
   - Status on empty workspace: output contains "INACTIVE" and "N/A"
   - Status after running init with mock IO: output contains "ACTIVE"
   - Status after init: output contains provider name from interview
   - Status after init: output contains specialty from interview
   - Status after init: output contains autonomy tier labels
   - Status after init: output contains hardening flag labels
   - Status after init: output contains audit stats with at least 1 entry
   - Status after init: output contains "Verified" for integrity
   - Status with malformed CANS.md: output contains "INACTIVE" and validation reason

3. Run the full test suite with coverage:
   ```bash
   pnpm test:coverage
   ```
   Verify all tests pass and coverage meets 80% threshold. If coverage is below 80% on any metric, identify uncovered branches and add targeted tests.

4. Verify all Phase 1 tests still pass (no regressions).

**Verify:**
```bash
pnpm test:coverage && echo "PASS: all tests with coverage" || echo "FAIL"
```

**Done:** All five ONBD requirements are verified end-to-end. Generated CANS.md activates clinical mode. Workspace files are supplemented correctly. Status command reports correct state. Iterative refinement works. All Phase 1 tests still pass. Coverage meets 80% threshold.

---

## Phase Verification

Map each success criterion to specific tests:

| Success Criterion | Verified By |
|---|---|
| 1. Provider runs `careagent init` and completes structured interview | `test/integration/onboarding.test.ts` — ONBD-01 group: full interview with mock IO |
| 2. Onboarding generates a CANS.md that validates and activates clinical mode | `test/integration/onboarding.test.ts` — ONBD-02 group: schema validation + ActivationGate.check() |
| 3. Provider can review, adjust, and re-generate CANS.md before finalizing | `test/integration/onboarding.test.ts` — ONBD-05 group: edit during review, verify changes reflected |
| 4. Provider runs `careagent status` and sees activation state, summary, hardening, skills, audit stats | `test/integration/status.test.ts` — ONBD-04 group: status after init shows all sections |
| 5. Existing SOUL.md, AGENTS.md, USER.md content is preserved and supplemented | `test/integration/onboarding.test.ts` — ONBD-03 group: pre-existing content preserved, markers used, idempotent |

### Build verification:
```bash
pnpm clean && pnpm build && pnpm test:coverage
```
All must pass before Phase 2 is considered complete.

---

## File Ownership Map

| File | Plan | Wave |
|------|------|------|
| `src/cli/io.ts` | 01 | 1 |
| `src/cli/prompts.ts` | 01 | 1 |
| `src/cli/commands.ts` | 01 (stubs), 06 (full) | 1, 5 |
| `src/index.ts` | 01 (updated) | 1 |
| `src/adapter/types.ts` | 01 (if needed) | 1 |
| `src/onboarding/engine.ts` | 02 | 2 |
| `src/onboarding/stages.ts` | 02 | 2 |
| `src/onboarding/defaults.ts` | 02 | 2 |
| `src/onboarding/cans-generator.ts` | 03 | 3 |
| `src/onboarding/review.ts` | 03 | 3 |
| `src/onboarding/workspace-writer.ts` | 04 | 3 |
| `src/onboarding/workspace-content.ts` | 04 | 3 |
| `src/cli/status-command.ts` | 05 | 4 |
| `src/cli/init-command.ts` | 06 | 5 |
| `test/fixtures/interview-responses.ts` | 01 | 1 |
| `test/unit/cli/*` | 01, 05 | 1, 4 |
| `test/unit/onboarding/*` | 02, 03, 04 | 2, 3 |
| `test/integration/onboarding.test.ts` | 06 | 5 |
| `test/integration/status.test.ts` | 06 | 5 |

---
*Plan created: 2026-02-18*
