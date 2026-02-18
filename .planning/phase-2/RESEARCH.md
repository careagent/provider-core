# Phase 2: Onboarding and CLI - Research

**Researched:** 2026-02-18
**Domain:** Interactive CLI interview, CANS.md generation from structured data, workspace file supplementation, terminal UI
**Confidence:** HIGH

## Summary

Phase 2 transforms the plugin shell from Phase 1 into a provider-facing experience. The provider runs `careagent init`, completes a structured CLI interview that discovers their clinical identity, and receives a personalized CANS.md that activates the clinical layer. A `careagent status` command reports the activation state and system health.

The critical constraint is zero runtime npm dependencies. Node.js 22 provides `node:readline/promises` as a built-in module with full async/await support via `rl.question()`. This is sufficient for the structured interview pattern: sequential questions with text input, numbered-choice selection, and yes/no confirmations. No external prompt library (inquirer, prompts, enquirer) is needed or allowed. The vendored `yaml` package already exports `stringifyYAML` (used by Phase 1 tests to create CANS.md fixtures), which handles the reverse direction: converting the collected interview data into valid YAML frontmatter.

The onboarding flow is a multi-step process with iterative refinement: collect answers, generate draft CANS.md, present for review, allow edits, regenerate. This is not a one-shot wizard. The `careagent init` command must work BEFORE CANS.md exists (the whole point is to create it), which is already handled by Phase 1's design where CLI registration happens before the activation gate check. Workspace file supplementation (SOUL.md, AGENTS.md, USER.md) uses HTML comment markers to delimit CareAgent-managed sections, enabling idempotent updates without destroying provider content.

**Primary recommendation:** Build the onboarding as a state-machine interview engine using `node:readline/promises`. Each interview stage maps to a CANS.md schema section. Use `stringifyYAML` from the vendored yaml package for CANS.md generation. Validate the generated CANS.md against the existing TypeBox schema before writing. Use `updateKnownGoodHash` from `cans-integrity.ts` to store the initial hash after generation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONBD-01 | `careagent init` CLI command initiates interactive conversation discovering clinical role, specialty, scope, philosophy, documentation voice, and autonomy preferences | `node:readline/promises` built-in for async question/answer; Commander.js subcommand via existing `registerCliCommand` adapter; interview state machine pattern |
| ONBD-02 | Onboarding generates personalized CANS.md from interview responses with provider approval before finalizing | `stringifyYAML` from vendored yaml for YAML generation; `Value.Check` from TypeBox for validation; `updateKnownGoodHash` for integrity seeding; frontmatter + markdown body assembly |
| ONBD-03 | Onboarding writes clinical content into SOUL.md, AGENTS.md, and USER.md -- supplementing not replacing | HTML comment marker pattern (`<!-- CareAgent: BEGIN -->` / `<!-- CareAgent: END -->`); read-modify-write with marker detection; idempotent append-or-replace |
| ONBD-04 | `careagent status` CLI command shows activation state, CANS.md summary, hardening layer status, loaded clinical skills, and audit stats | Read CANS.md via `ActivationGate.check()`; parse AUDIT.log for stats; read `.careagent/cans-integrity.json` for hash status; terminal formatting with padding/alignment |
| ONBD-05 | Onboarding supports iterative refinement -- provider can review and adjust generated CANS.md before activation | Review-edit-regenerate loop: display generated CANS.md, prompt for changes, allow per-section re-interview, re-validate and re-display until provider approves |
</phase_requirements>

## Standard Stack

### Core (inherited from Phase 1 -- locked)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | >=22.12.0 | Runtime | OpenClaw hard requirement |
| TypeScript | ~5.7.x | Language | Match OpenClaw |
| @sinclair/typebox | ~0.34.x | Schema validation | OpenClaw platform requirement; validates generated CANS.md |
| Vendored `yaml` | ^2.8.2 | YAML parse + stringify | Already vendored in `src/vendor/yaml/`; `stringifyYAML` for generation |
| Vitest | ~4.0.x | Testing | Match OpenClaw |

### Phase 2-Specific

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:readline/promises` | built-in (Node 22) | Interactive CLI input | Interview questions, confirmations, menu selection |
| `node:fs` | built-in | File read/write | CANS.md generation, workspace file supplementation, status reads |
| `node:path` | built-in | Path resolution | Workspace file paths |

### No New Dependencies

Phase 2 requires NO new npm packages. Everything is covered by:
- Node.js built-ins: `node:readline/promises`, `node:fs`, `node:path`, `node:crypto`
- Already vendored: `yaml` package (`stringifyYAML`)
- Already in devDependencies: `@sinclair/typebox` (CANS.md schema validation)
- Already built in Phase 1: adapter layer, activation gate, audit pipeline, CANS schema, integrity checking

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
src/
  onboarding/                    # ONBD-01, ONBD-02, ONBD-05
    engine.ts                    # Interview state machine orchestrator
    interview.ts                 # Question definitions and stage logic
    cans-generator.ts            # Transforms interview data -> CANS.md content
    workspace-writer.ts          # ONBD-03: Supplements SOUL.md, AGENTS.md, USER.md
    prompts.ts                   # Reusable CLI prompt utilities (question, select, confirm)
  cli/                           # ONBD-01, ONBD-04
    commands.ts                  # Registers careagent init + careagent status
    init-command.ts              # careagent init handler
    status-command.ts            # careagent status handler
test/
  unit/
    onboarding/
      engine.test.ts
      cans-generator.test.ts
      workspace-writer.test.ts
      prompts.test.ts
    cli/
      status-command.test.ts
  integration/
    onboarding.test.ts           # End-to-end init flow with mocked stdin
  fixtures/
    interview-responses.ts       # Pre-canned interview answers for testing
```

### Pattern 1: Interview State Machine

**What:** A sequential state machine where each state represents an interview stage. Each stage collects specific data, validates it, and transitions to the next stage. The machine supports going backward (re-do a stage) and produces a complete data object at the end.

**When to use:** The `careagent init` interview flow (ONBD-01).

**Why:** Clinical credential collection has a natural sequence (identity before scope, scope before autonomy). A state machine makes this explicit, testable, and resumable.

**Example:**
```typescript
// src/onboarding/engine.ts
import type { CANSDocument } from '../activation/cans-schema.js';

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
  REVIEW = 'review',
  COMPLETE = 'complete',
}

export interface InterviewState {
  stage: InterviewStage;
  data: Partial<CANSDocument>;
  errors: string[];
}

// Each stage is a function that collects data and returns the next state
export type StageHandler = (
  state: InterviewState,
  io: InterviewIO,
) => Promise<InterviewState>;

// IO abstraction for testability
export interface InterviewIO {
  question(prompt: string): Promise<string>;
  select(prompt: string, options: string[]): Promise<number>;
  confirm(prompt: string): Promise<boolean>;
  display(text: string): void;
}
```

**Confidence:** HIGH -- state machines for multi-step forms/interviews are a well-established pattern.

### Pattern 2: IO Abstraction for Testability

**What:** Abstract all terminal I/O behind an `InterviewIO` interface. Production uses `node:readline/promises`. Tests inject a mock that replays pre-canned answers.

**When to use:** Every interactive prompt in the onboarding flow.

**Why:** Without IO abstraction, testing the interview requires spawning child processes with piped stdin. With it, tests call the engine directly with mock responses. This is how Phase 1 tested the adapter -- mock the boundary, test the logic.

**Example:**
```typescript
// src/onboarding/prompts.ts
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function createTerminalIO(): InterviewIO {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  return {
    async question(prompt: string): Promise<string> {
      const answer = await rl.question(prompt);
      return answer.trim();
    },

    async select(prompt: string, options: string[]): Promise<number> {
      const display = options.map((opt, i) => `  ${i + 1}. ${opt}`).join('\n');
      const answer = await rl.question(`${prompt}\n${display}\n> `);
      const index = parseInt(answer, 10) - 1;
      if (index < 0 || index >= options.length) {
        // Re-prompt on invalid input
        return this.select(prompt, options);
      }
      return index;
    },

    async confirm(prompt: string): Promise<boolean> {
      const answer = await rl.question(`${prompt} (y/n) `);
      return answer.toLowerCase().startsWith('y');
    },

    display(text: string): void {
      console.log(text);
    },

    // Close must be called when interview completes
    close(): void {
      rl.close();
    },
  };
}

// Test mock
export function createMockIO(answers: string[]): InterviewIO {
  let index = 0;
  return {
    async question(): Promise<string> { return answers[index++] || ''; },
    async select(): Promise<number> { return parseInt(answers[index++] || '0', 10); },
    async confirm(): Promise<boolean> { return answers[index++]?.startsWith('y') ?? false; },
    display(): void { /* no-op in tests */ },
    close(): void { /* no-op */ },
  };
}
```

**Confidence:** HIGH -- this follows the exact adapter pattern Phase 1 established. The mock API pattern in `test/integration/plugin.test.ts` proves this works.

### Pattern 3: CANS.md Generation from Structured Data

**What:** Take the interview data (a partial `CANSDocument` object), fill in defaults for fields the interview does not ask about, stringify to YAML frontmatter, validate against the TypeBox schema, and assemble the complete Markdown file.

**When to use:** After interview completion, during the review-regenerate cycle (ONBD-02, ONBD-05).

**Why:** The generation pipeline must produce output that passes the same `ActivationGate.check()` that Phase 1 built. By validating with `Value.Check(CANSSchema, data)` before writing, we guarantee the generated CANS.md will activate.

**Example:**
```typescript
// src/onboarding/cans-generator.ts
import { stringifyYAML } from '../vendor/yaml/index.js';
import { Value } from '@sinclair/typebox/value';
import { CANSSchema, type CANSDocument } from '../activation/cans-schema.js';
import { updateKnownGoodHash } from '../activation/cans-integrity.js';

export interface GenerationResult {
  success: boolean;
  content?: string;       // Full CANS.md file content
  document?: CANSDocument;
  errors?: Array<{ path: string; message: string }>;
}

export function generateCANSContent(data: CANSDocument): GenerationResult {
  // Step 1: Validate against schema
  if (!Value.Check(CANSSchema, data)) {
    const errors = [...Value.Errors(CANSSchema, data)]
      .map(e => ({ path: e.path, message: e.message }));
    return { success: false, errors };
  }

  // Step 2: Stringify to YAML frontmatter
  const yaml = stringifyYAML(data);

  // Step 3: Generate markdown body
  const body = generateMarkdownBody(data);

  // Step 4: Assemble
  const content = `---\n${yaml}---\n\n${body}`;

  return { success: true, content, document: data };
}

function generateMarkdownBody(data: CANSDocument): string {
  return [
    `# Care Agent Nervous System`,
    '',
    `## Provider Summary`,
    '',
    `${data.provider.name} (${data.provider.license.type})`,
    `Specialty: ${data.provider.specialty}`,
    ...(data.provider.subspecialty ? [`Subspecialty: ${data.provider.subspecialty}`] : []),
    ...(data.provider.institution ? [`Institution: ${data.provider.institution}`] : []),
    '',
    `## Autonomy Configuration`,
    '',
    `- Chart: ${data.autonomy.chart}`,
    `- Order: ${data.autonomy.order}`,
    `- Charge: ${data.autonomy.charge}`,
    `- Perform: ${data.autonomy.perform}`,
    '',
    `## Clinical Philosophy`,
    '',
    `[Provider clinical philosophy captured during onboarding]`,
    '',
  ].join('\n');
}
```

**Confidence:** HIGH -- `stringifyYAML` is already used in Phase 1 test fixtures (`test/integration/plugin.test.ts` line 18, 24). `Value.Check(CANSSchema, ...)` is already used in `gate.ts` line 53.

### Pattern 4: Workspace File Supplementation with Markers

**What:** Read an existing workspace file (SOUL.md, AGENTS.md, USER.md), find CareAgent marker sections, replace or append clinical content within the markers. If markers do not exist, append a new marked section at the end.

**When to use:** ONBD-03 -- writing clinical content into workspace files.

**Why:** The requirement is "supplement, not replace." Markers make the CareAgent-managed section identifiable, updatable, and removable without affecting provider-authored content. This is idempotent -- running onboarding twice produces the same result.

**Example:**
```typescript
// src/onboarding/workspace-writer.ts
const BEGIN_MARKER = '<!-- CareAgent: BEGIN -->';
const END_MARKER = '<!-- CareAgent: END -->';

export function supplementFile(
  existingContent: string,
  clinicalSection: string,
): string {
  const beginIdx = existingContent.indexOf(BEGIN_MARKER);
  const endIdx = existingContent.indexOf(END_MARKER);

  const markedContent = `${BEGIN_MARKER}\n${clinicalSection}\n${END_MARKER}`;

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // Replace existing CareAgent section
    return (
      existingContent.slice(0, beginIdx) +
      markedContent +
      existingContent.slice(endIdx + END_MARKER.length)
    );
  }

  // Append new section
  const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
  return existingContent + separator + markedContent + '\n';
}
```

**Confidence:** HIGH -- HTML comment markers in Markdown is a standard pattern. The Markdown spec treats HTML comments as valid content that renderers skip.

### Pattern 5: CLI Subcommand Registration

**What:** The existing `registerCliCommand` adapter method registers a single `careagent` parent command. Phase 2 needs subcommands: `careagent init` and `careagent status`. The adapter's `registerCli` callback receives a Commander.js `program` instance. We register `careagent` as a parent command with subcommands.

**When to use:** CLI command registration in `src/cli/commands.ts`.

**Why:** OpenClaw's `api.registerCli` passes a Commander.js `{ program }` context. The current Phase 1 implementation registers a flat `careagent` command. Phase 2 needs to change this to a command with subcommands.

**Important:** The adapter layer's `registerCliCommand` method in Phase 1 currently chains `.command().description().action()` on the program directly. For subcommands, the adapter needs to be extended OR the CLI module can call `api.registerCli` through the adapter with a richer callback that adds subcommands. The simplest approach is to modify the adapter's `registerCliCommand` to accept a setup callback that receives the parent command.

**Example:**
```typescript
// src/cli/commands.ts
// Option A: Extend adapter to support subcommands
export function registerCLI(
  adapter: CareAgentPluginAPI,
  workspacePath: string,
  audit: AuditPipeline,
): void {
  // The adapter's registerCliCommand creates a parent 'careagent' command.
  // We need to register subcommands within it.
  // Simplest approach: register multiple CLI commands
  adapter.registerCliCommand({
    name: 'careagent init',  // Commander.js supports space-separated subcommands
    description: 'Initialize CareAgent with a clinical onboarding interview',
    handler: async () => {
      // Launch interview engine
    },
  });

  adapter.registerCliCommand({
    name: 'careagent status',
    description: 'Show CareAgent activation state and system health',
    handler: async () => {
      // Display status
    },
  });
}

// Option B: Use a richer registration pattern
// Register a single 'careagent' command, then add subcommands within the callback
// This requires modifying the adapter to pass the Command object through
```

**Note on Commander.js subcommand syntax:** Commander.js supports `program.command('parent').command('sub')` for nesting. However, the adapter currently wraps `program.command(name).description(desc).action(handler)` as a flat call. The adapter may need a minor extension to support subcommands -- either by allowing the handler to receive the Command object, or by registering separate `'careagent init'` and `'careagent status'` commands (Commander supports space-separated names for subcommands: `program.command('careagent init')`).

**Recommended approach:** Extend the adapter with a new `registerCliSubcommand` method, or modify `registerCliCommand` to support subcommand registration by accepting a `setup` callback. The simplest path is to register the parent command with a help-display action, then register each subcommand separately. Verify the exact Commander.js pattern on VPS.

**Confidence:** MEDIUM -- the Commander.js subcommand pattern is well-documented, but the exact way OpenClaw's `registerCli` handles subcommands needs VPS validation. The safest approach is to call `api.registerCli` once with a callback that registers both the parent and subcommands directly on the `program`.

### Pattern 6: Review-Edit-Regenerate Loop (ONBD-05)

**What:** After generating the draft CANS.md, display it to the provider and enter a review loop: approve, edit a specific section, or start over. The loop continues until the provider explicitly approves.

**When to use:** The iterative refinement requirement (ONBD-05).

**Example:**
```typescript
// Pseudocode for the review loop
async function reviewLoop(
  io: InterviewIO,
  data: CANSDocument,
  workspacePath: string,
): Promise<CANSDocument> {
  while (true) {
    const result = generateCANSContent(data);
    if (!result.success) {
      io.display('Generated CANS.md has validation errors:');
      result.errors?.forEach(e => io.display(`  ${e.path}: ${e.message}`));
      // Force re-interview of the failing section
      continue;
    }

    io.display('\n--- Generated CANS.md Preview ---\n');
    io.display(result.content!);
    io.display('\n--- End Preview ---\n');

    const choice = await io.select('What would you like to do?', [
      'Approve and save',
      'Edit provider information',
      'Edit scope and permissions',
      'Edit autonomy settings',
      'Edit clinical voice',
      'Start over',
    ]);

    switch (choice) {
      case 0: return data;  // Approved
      case 1: data = await reInterviewSection('identity', data, io); break;
      case 2: data = await reInterviewSection('scope', data, io); break;
      case 3: data = await reInterviewSection('autonomy', data, io); break;
      case 4: data = await reInterviewSection('voice', data, io); break;
      case 5: data = await runFullInterview(io); break;
    }
  }
}
```

**Confidence:** HIGH -- standard CLI wizard pattern with review step.

### Anti-Patterns to Avoid

- **One-shot interview with no review:** The provider MUST see and approve the generated CANS.md before it is written. Never write CANS.md without explicit provider confirmation.

- **External prompt library (inquirer, prompts):** These are npm dependencies. Use `node:readline/promises` only. The interview needs text input, numbered selection, and yes/no confirmations -- all achievable with `rl.question()`.

- **Overwriting workspace files:** Never truncate and rewrite SOUL.md, AGENTS.md, or USER.md. Always read-modify-write with marker detection. If the file does not exist, create it with only the CareAgent section.

- **Generating CANS.md without schema validation:** Always validate against `CANSSchema` before writing. If validation fails, the activation gate will reject the file and the provider wastes time debugging.

- **Hardcoding clinical defaults:** The interview must ASK about autonomy tiers, scope, and hardening flags. Do not silently apply defaults. Every clinical decision belongs to the provider.

- **Blocking the event loop during interview:** Use `await rl.question()` (async), not synchronous readline. The interview can take minutes -- synchronous I/O would freeze the process.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML serialization | Custom YAML stringifier | `stringifyYAML` from `src/vendor/yaml/` | Already vendored, handles edge cases (multiline strings, special chars, quoting). Already used in Phase 1 test fixtures. |
| Schema validation of generated CANS.md | Custom validation logic | TypeBox `Value.Check` + `Value.Errors` | Already implemented in `gate.ts`. Reuse the same validation the activation gate uses. |
| Integrity hash seeding for new CANS.md | Custom hash storage | `updateKnownGoodHash()` from `cans-integrity.ts` | Already implemented. Seeds the `.careagent/cans-integrity.json` file so subsequent loads pass integrity check. |
| Frontmatter assembly | Custom string concatenation | Template function with `stringifyYAML` output | YAML stringify handles all escaping; wrap in `---\n` delimiters for frontmatter. Already demonstrated in `test/integration/plugin.test.ts` line 23-25. |
| Terminal input | Third-party prompt library | `node:readline/promises` built-in | Zero-dependency constraint. readline/promises provides async question/answer. Node 22 has full support. |
| CANS.md parsing for status command | New parser | `parseFrontmatter` from `cans-parser.ts` + `Value.Check` | Already implemented in Phase 1. Reuse for reading CANS.md in status command. |
| Audit stats for status command | New log reader | Parse AUDIT.log JSONL with `JSON.parse` per line | AUDIT.log is JSONL (one JSON object per line). Reading and aggregating is trivial with built-in fs. |

**Key insight:** Phase 2 has remarkably few new technical requirements. Almost every building block exists from Phase 1. The new work is orchestration (interview flow, review loop) and generation (interview data -> CANS.md), not new infrastructure.

## Common Pitfalls

### Pitfall 1: Generated CANS.md Fails Activation Gate

**What goes wrong:** The onboarding generates a CANS.md that looks correct in the terminal preview but fails `Value.Check(CANSSchema, frontmatter)` when the activation gate tries to load it. Common causes: YAML stringify quotes a value differently than the schema expects, a required field is missing because the interview skipped a question, or a union literal value does not exactly match (e.g., `"md"` instead of `"MD"`).

**Why it happens:** The generation path and the validation path use different representations. The generator builds a JS object, stringifies to YAML, writes to disk. The validator reads from disk, parses YAML, and checks the TypeBox schema. YAML round-trip can change types (strings become numbers, booleans, etc.).

**How to avoid:** Validate the CANSDocument object with `Value.Check(CANSSchema, data)` BEFORE stringifying to YAML. This catches schema violations at the source. Additionally, after writing the CANS.md file, read it back, parse it, and validate again as a round-trip test. Use `as const` type assertions for literal union values in interview options.

**Warning signs:** Provider completes onboarding, but `careagent status` shows "Clinical mode: INACTIVE." TypeBox validation errors in the audit log.

### Pitfall 2: readline Interface Not Closed After Interview

**What goes wrong:** The `node:readline/promises` interface keeps stdin open after the interview completes. The CLI command never returns, or the Node.js process hangs.

**Why it happens:** `readline.createInterface()` attaches listeners to `process.stdin`. If `rl.close()` is not called, the event loop stays alive waiting for input.

**How to avoid:** Always call `rl.close()` in a `finally` block after the interview completes, errors, or is cancelled. The `InterviewIO` abstraction should expose a `close()` method that the engine calls unconditionally.

**Warning signs:** `careagent init` interview finishes but the terminal prompt does not return. Process must be killed with Ctrl+C.

### Pitfall 3: Workspace File Corruption from Concurrent Writes

**What goes wrong:** The onboarding writes to SOUL.md while another OpenClaw process (or the agent itself) is also writing to it. The file ends up corrupted or with interleaved content.

**Why it happens:** OpenClaw's agent may update workspace files during operation. The onboarding write is a read-modify-write operation, which is not atomic.

**How to avoid:** The onboarding should happen BEFORE CANS.md exists (clinical mode inactive, agent is not modifying workspace files in clinical mode). Additionally, use a write-to-temp-then-rename pattern for atomicity. Read the file, modify it, write to a `.tmp` sibling, then `rename()` to overwrite.

**Warning signs:** Workspace files have garbled content after onboarding. CareAgent markers are duplicated or split.

### Pitfall 4: Interview Answers Produce YAML Special Values

**What goes wrong:** A provider enters a state abbreviation like "NO" (Norway) or "ON" (Ontario), and the YAML stringifier interprets it as a boolean `false` or `true`. Or a license number like "1.0" becomes a float.

**Why it happens:** YAML 1.1 has implicit type coercion. The vendored `yaml` package defaults to YAML 1.2 which is safer, but string fields must still be explicitly stringified.

**How to avoid:** The vendored `yaml` package (v2.8.2) defaults to YAML 1.2 which does not have the implicit boolean/number coercion. However, as defense in depth, ensure all interview answers for string fields are stored as strings in the data object. The TypeBox schema validates field types, so round-trip validation catches any coercion. Additionally, `stringifyYAML` with YAML 1.2 will quote values like "NO" and "ON" appropriately.

**Warning signs:** CANS.md contains `state: false` instead of `state: "NO"`. TypeBox validation catches type mismatches.

### Pitfall 5: Status Command Fails When Audit Log Is Empty or Large

**What goes wrong:** `careagent status` tries to read the entire AUDIT.log to compute stats. If the log is empty, it crashes on empty parse. If the log is large (thousands of entries from extended use), it blocks the event loop while parsing.

**Why it happens:** Naive implementation reads the entire file into memory and splits by newlines.

**How to avoid:** Handle the empty/missing case explicitly (no audit entries is a valid state). For large files, read only the last N lines using a reverse file reader or `fs.readFileSync` with a byte offset to read only the tail. For MVP, reading the full file is acceptable (clinical sessions produce ~50 entries max per session; even months of use is manageable).

**Warning signs:** `careagent status` hangs or crashes. Empty audit stats when entries exist.

### Pitfall 6: CANS.md Integrity Hash Not Updated After Onboarding

**What goes wrong:** Onboarding writes CANS.md but does not call `updateKnownGoodHash()`. The next plugin load reads CANS.md, computes its hash, compares against the stored hash (which is from a previous version or does not exist), and fails the integrity check. Clinical mode does not activate despite a valid CANS.md.

**Why it happens:** The integrity system from Phase 1 uses a first-load trust model. If a hash already exists from a previous failed attempt, writing a new CANS.md without updating the hash creates a mismatch.

**How to avoid:** After writing CANS.md to disk, ALWAYS call `updateKnownGoodHash(workspacePath, fileContent)` to record the new file's hash as known-good. This is a one-line call to an existing function.

**Warning signs:** "SHA-256 hash mismatch" error in audit log after running `careagent init`.

## Code Examples

### Creating a readline Interface (Built-in, Zero Dependencies)

```typescript
// Source: Node.js v22 docs - node:readline/promises
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const rl = readline.createInterface({ input: stdin, output: stdout });

try {
  const name = await rl.question('Your full name (e.g., Dr. Jane Smith): ');
  const specialty = await rl.question('Primary specialty: ');
  console.log(`Welcome, ${name} -- ${specialty}`);
} finally {
  rl.close();
}
```

### YAML Stringify for CANS.md Generation

```typescript
// Source: Already used in test/integration/plugin.test.ts
import { stringifyYAML } from '../vendor/yaml/index.js';

const cansData = {
  version: '1.0',
  provider: {
    name: 'Dr. Jane Smith',
    license: { type: 'MD', state: 'TX', number: 'A12345', verified: false },
    specialty: 'Neurosurgery',
    privileges: ['neurosurgical procedures', 'spine surgery'],
  },
  // ... remaining sections
};

const yaml = stringifyYAML(cansData);
const cansContent = `---\n${yaml}---\n\n# Care Agent Nervous System\n`;
// Write to workspace/CANS.md
```

### TypeBox Validation of Generated Data

```typescript
// Source: Already used in src/activation/gate.ts
import { Value } from '@sinclair/typebox/value';
import { CANSSchema } from '../activation/cans-schema.js';

// Validate BEFORE writing
if (!Value.Check(CANSSchema, interviewData)) {
  const errors = [...Value.Errors(CANSSchema, interviewData)];
  errors.forEach(e => console.error(`  ${e.path}: ${e.message}`));
  throw new Error('Generated CANS.md data failed schema validation');
}
```

### Workspace File Supplementation

```typescript
// Read existing, supplement, write back
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BEGIN = '<!-- CareAgent: BEGIN -->';
const END = '<!-- CareAgent: END -->';

function supplementWorkspaceFile(
  workspacePath: string,
  filename: string,
  clinicalContent: string,
): void {
  const filePath = join(workspacePath, filename);
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

  const section = `${BEGIN}\n${clinicalContent}\n${END}`;
  const beginIdx = existing.indexOf(BEGIN);
  const endIdx = existing.indexOf(END);

  let updated: string;
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // Replace existing section
    updated = existing.slice(0, beginIdx) + section + existing.slice(endIdx + END.length);
  } else if (existing.trim() === '') {
    // Empty or new file
    updated = section + '\n';
  } else {
    // Append to end
    updated = existing + (existing.endsWith('\n') ? '\n' : '\n\n') + section + '\n';
  }

  writeFileSync(filePath, updated);
}
```

### Status Command Output

```typescript
// src/cli/status-command.ts
function formatStatus(
  activation: ActivationResult,
  auditStats: AuditStats,
  integrityStatus: IntegrityStatus,
): string {
  const lines: string[] = [];

  lines.push('CareAgent Status');
  lines.push('================');
  lines.push('');

  // Activation
  if (activation.active && activation.document) {
    const doc = activation.document;
    lines.push(`Clinical Mode:    ACTIVE`);
    lines.push(`Provider:         ${doc.provider.name}`);
    lines.push(`Specialty:        ${doc.provider.specialty}`);
    lines.push(`License:          ${doc.provider.license.type} (${doc.provider.license.state})`);
    lines.push(`Institution:      ${doc.provider.institution || 'Not specified'}`);
    lines.push('');
    lines.push('Autonomy Tiers:');
    lines.push(`  Chart:          ${doc.autonomy.chart}`);
    lines.push(`  Order:          ${doc.autonomy.order}`);
    lines.push(`  Charge:         ${doc.autonomy.charge}`);
    lines.push(`  Perform:        ${doc.autonomy.perform}`);
  } else {
    lines.push(`Clinical Mode:    INACTIVE`);
    lines.push(`Reason:           ${activation.reason || 'No CANS.md found'}`);
  }

  lines.push('');
  lines.push('Hardening Layers:');
  // Phase 3 will populate these -- show placeholder for now
  lines.push('  (Hardening layers will be configured in Phase 3)');

  lines.push('');
  lines.push('Audit Stats:');
  lines.push(`  Total entries:  ${auditStats.totalEntries}`);
  lines.push(`  Chain valid:    ${auditStats.chainValid ? 'Yes' : 'NO - BROKEN'}`);
  lines.push(`  Last entry:     ${auditStats.lastTimestamp || 'N/A'}`);

  lines.push('');
  lines.push('Integrity:');
  lines.push(`  CANS.md hash:   ${integrityStatus.valid ? 'Verified' : 'MISMATCH'}`);

  return lines.join('\n');
}
```

### Test Mock for Interview IO

```typescript
// test/fixtures/interview-responses.ts
export function createMockIO(responses: string[]): InterviewIO {
  let idx = 0;
  const output: string[] = [];

  return {
    async question(_prompt: string): Promise<string> {
      return responses[idx++] || '';
    },
    async select(_prompt: string, options: string[]): Promise<number> {
      const answer = parseInt(responses[idx++] || '0', 10);
      return Math.min(answer, options.length - 1);
    },
    async confirm(_prompt: string): Promise<boolean> {
      return (responses[idx++] || 'n').toLowerCase().startsWith('y');
    },
    display(text: string): void {
      output.push(text);
    },
    close(): void { /* no-op */ },
    getOutput(): string[] { return output; },
  };
}

// Usage in tests:
// const io = createMockIO(['Dr. Jane Smith', '0', 'TX', 'A12345', ...]);
// const result = await runInterview(io);
// expect(result.data.provider.name).toBe('Dr. Jane Smith');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `readline.createInterface` + callbacks | `node:readline/promises` + async/await | Node.js 17+ (stable in 22) | Cleaner async flow; no callback nesting |
| Third-party prompt libs (inquirer, prompts) | Built-in readline for constrained projects | N/A (constraint-driven) | Zero dependencies; limited UI but sufficient for structured interview |
| Free-form agent conversation for onboarding | Structured CLI interview with state machine | Design decision | Deterministic output; testable; produces schema-valid CANS.md every time |

**Deprecated/outdated:**
- `readline.createInterface` callback-based API: Still works but `node:readline/promises` is preferred for new code
- `process.stdin.on('data', ...)`: Low-level; use readline instead

## Open Questions

1. **Commander.js subcommand registration through adapter**
   - What we know: OpenClaw's `api.registerCli` receives `({ program })` and expects `program.command('name')...`. The adapter wraps this.
   - What's unclear: Does Commander.js support `program.command('careagent init')` (space-separated) for subcommands? Or must it be `program.command('careagent').command('init')`? The adapter currently chains `.command().description().action()` as a flat pattern.
   - Recommendation: Try `program.command('careagent')` to get the parent Command, then chain `.command('init')` and `.command('status')` on it. May require extending the adapter's `registerCliCommand` to accept a setup callback. Verify exact pattern on VPS.

2. **Onboarding CLI context: is stdin available?**
   - What we know: `careagent init` runs as a CLI command. CLI commands run in the terminal.
   - What's unclear: Does OpenClaw's CLI command execution environment provide stdin/stdout access? Or are CLI handlers limited to synchronous output?
   - Recommendation: Phase 1's CLI handler just calls `console.log`. For Phase 2, the handler needs `process.stdin` access. This should work (Commander.js action handlers run in the same process), but verify on VPS that the readline interface works inside a plugin CLI handler.

3. **CANS.md clinical_voice: what questions to ask?**
   - What we know: The schema has `clinical_voice: { tone, documentation_style, eponyms, abbreviations }`. All fields are Optional.
   - What's unclear: What specific questions capture these effectively for a clinical provider? "What tone do you use?" is vague.
   - Recommendation: Use concrete examples: "Do you prefer concise bullet-point notes or narrative paragraphs?" "Do you use medical eponyms (e.g., Babinski sign vs. extensor plantar response)?" "Abbreviation style: standard, minimal, or spelled out?" These map directly to the schema fields.

4. **Hardening flags: sensible defaults vs. ask everything?**
   - What we know: `hardening` has 6 boolean flags (tool_policy_lockdown, exec_approval, cans_protocol_injection, docker_sandbox, safety_guard, audit_trail). All are defined as required booleans in the schema.
   - What's unclear: Should the interview ask about each flag, or default to "all on" and let the provider disable specific ones?
   - Recommendation: Default all hardening flags to `true` (maximum safety). Show the defaults in the review step. Let the provider toggle specific flags during review. Phase 3 will implement the actual hardening; Phase 2 just needs to generate the configuration.

5. **Workspace file content: what goes in each file?**
   - What we know: SOUL.md = persona/tone/boundaries. AGENTS.md = operating instructions/priorities. USER.md = who the user is.
   - What's unclear: Exactly what clinical content belongs in each file.
   - Recommendation: SOUL.md gets clinical persona traits (scope awareness, clinical voice). AGENTS.md gets operating rules (clinical safety rules, documentation standards). USER.md gets provider identity (name, credentials, preferences). This maps naturally to the three files' purposes.

## Sources

### Primary (HIGH confidence)
- Node.js v22 `node:readline/promises` API -- [Official docs](https://nodejs.org/api/readline.html) -- async question/answer interface
- `yaml` npm package stringify API -- [Official docs](https://eemeli.org/yaml/) -- `stringify(value, options)` with indent, lineWidth, collectionStyle control
- OpenClaw plugin `api.registerCli` pattern -- [Plugin docs](https://docs.openclaw.ai/tools/plugin) -- `({ program }) => { program.command('name').action(...) }`
- OpenClaw workspace files -- [Agent workspace docs](https://docs.openclaw.ai/concepts/agent-workspace) -- SOUL.md, AGENTS.md, USER.md purpose and injection
- Existing Phase 1 codebase -- `src/activation/cans-schema.ts`, `src/activation/cans-integrity.ts`, `src/vendor/yaml/index.ts`, `test/integration/plugin.test.ts` -- proven patterns for YAML stringify, schema validation, integrity hashing

### Secondary (MEDIUM confidence)
- Commander.js subcommand patterns -- [GitHub README](https://github.com/tj/commander.js/blob/master/Readme.md) -- `.command('name').addCommand()` subcommand nesting
- OpenClaw CLI architecture -- [DeepWiki](https://deepwiki.com/openclaw/openclaw/12-cli-reference) -- Command hierarchy, plugin command registration
- OpenClaw workspace file content -- [openclaw-setup.me blog](https://openclaw-setup.me/blog/openclaw-memory-files/) -- SOUL.md = behavioral core, AGENTS.md = operating instructions, USER.md = preferences

### Tertiary (LOW confidence -- needs VPS validation)
- Commander.js space-separated subcommand syntax (e.g., `program.command('careagent init')`) -- not explicitly documented; needs testing
- readline behavior inside OpenClaw CLI handler context -- assumed to work but untested in plugin context
- OpenClaw's handling of multiple `registerCli` calls from a single plugin -- may need single call with all subcommands

## Metadata

**Confidence breakdown:**
- Interview mechanics (readline/promises): HIGH -- Node.js built-in, well-documented, verified on Node 22
- CANS.md generation (stringifyYAML + TypeBox): HIGH -- already used in Phase 1 test fixtures
- Workspace supplementation: HIGH -- simple read-modify-write with markers
- CLI subcommand registration: MEDIUM -- Commander.js pattern is clear, but adapter integration needs VPS validation
- Interview question design: MEDIUM -- schema structure is defined, but optimal question phrasing is subjective
- Status command: HIGH -- reads from existing data sources (gate, audit, integrity)

**Research date:** 2026-02-18
**Valid until:** 2026-03-04 (14 days -- stable domain; no fast-moving external dependencies)
