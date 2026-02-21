# Testing Patterns

**Analysis Date:** 2026-02-21

## Test Framework

**Runner:**
- Vitest 4.x
- Config: `vitest.config.ts`
- Globals enabled (`globals: true`) — `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach` available without importing in-scope (but most files import explicitly anyway)

**Assertion Library:**
- Vitest built-in (`expect`) — no separate chai or jest-expect

**Coverage:**
- Provider: V8 (`@vitest/coverage-v8`)
- Source: `src/**/*.ts` (excludes `src/vendor/**`)

**Run Commands:**
```bash
npm test                    # Run all tests once (vitest run)
npm run test:watch          # Watch mode (vitest)
npm run test:coverage       # Coverage report (vitest run --coverage)
npm run typecheck           # Type-check only (tsc --noEmit)
```

## Test File Organization

**Location:**
- Fully separate from source: all tests live under `test/`
- Unit tests: `test/unit/{domain}/{file}.test.ts`
- Integration tests: `test/integration/{domain}.test.ts`
- Fixtures: `test/fixtures/`
- Smoke test: `test/smoke.test.ts`

**Naming:**
- `{subject}.test.ts` mirrors `src/{domain}/{subject}.ts`
- `test/unit/hardening/hardening.test.ts` → `src/hardening/engine.ts`
- `test/unit/hardening/layers/tool-policy.test.ts` → `src/hardening/layers/tool-policy.ts`

**Structure:**
```
test/
├── smoke.test.ts                          # Top-level import/register sanity check
├── unit/
│   ├── activation/
│   │   ├── cans-schema.test.ts
│   │   ├── cans-integrity.test.ts
│   │   ├── cans-parser.test.ts
│   │   └── gate.test.ts
│   ├── hardening/
│   │   ├── hardening.test.ts              # Engine orchestrator
│   │   ├── canary.test.ts
│   │   └── layers/
│   │       ├── tool-policy.test.ts
│   │       ├── exec-allowlist.test.ts
│   │       ├── cans-injection.test.ts
│   │       └── docker-sandbox.test.ts
│   ├── audit/
│   │   ├── pipeline.test.ts
│   │   ├── writer.test.ts
│   │   └── integrity-service.test.ts
│   ├── refinement/
│   │   ├── refinement-engine.test.ts
│   │   ├── observation-store.test.ts
│   │   ├── pattern-matcher.test.ts
│   │   ├── proposal-generator.test.ts
│   │   └── proposals-command.test.ts
│   ├── skills/
│   │   ├── loader.test.ts
│   │   ├── manifest-schema.test.ts
│   │   ├── integrity.test.ts
│   │   ├── version-pin.test.ts
│   │   └── chart-skill.test.ts
│   ├── onboarding/
│   │   ├── engine.test.ts
│   │   ├── stages.test.ts
│   │   ├── review.test.ts
│   │   ├── cans-generator.test.ts
│   │   ├── workspace-writer.test.ts
│   │   ├── workspace-profiles.test.ts
│   │   └── workspace-content.test.ts
│   ├── cli/
│   │   ├── io.test.ts
│   │   ├── prompts.test.ts
│   │   └── status-command.test.ts
│   ├── adapters/
│   │   ├── detect.test.ts
│   │   ├── standalone.test.ts
│   │   └── openclaw/
│   │       └── openclaw-adapter.test.ts
│   ├── credentials/
│   │   └── credentials.test.ts
│   ├── neuron/
│   │   └── neuron.test.ts
│   └── protocol/
│       └── protocol.test.ts
└── integration/
    ├── e2e-flow.test.ts
    ├── activation.test.ts
    ├── hardening.test.ts
    ├── audit.test.ts
    ├── onboarding.test.ts
    ├── refinement.test.ts
    ├── skills.test.ts
    ├── plugin.test.ts
    ├── security-review.test.ts
    └── status.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('createHardeningEngine', () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let audit: ReturnType<typeof createMockAudit>;
  let cans: CANSDocument;

  beforeEach(() => {
    adapter = createMockAdapter();
    audit = createMockAudit();
    cans = makeCans();
  });

  it('activate() registers a before_tool_call handler via adapter.onBeforeToolCall', () => {
    const engine = createHardeningEngine();
    engine.activate({ cans, adapter, audit });
    expect(adapter.onBeforeToolCall).toHaveBeenCalledTimes(1);
  });

  describe('nested group for a sub-feature', () => {
    it('...', () => { /* ... */ });
  });
});
```

**Patterns:**
- `beforeEach` / `afterEach` used to set up and tear down temp directories and instances
- Shared state declared with `let` at describe scope, assigned in `beforeEach`
- `afterEach` always cleans up filesystem: `rmSync(tmpDir, { recursive: true, force: true })`
- Test descriptions use natural language completing the subject: `'activate() registers a before_tool_call handler...'`
- Section comments inside test files: `// ---- Hook registration tests ----`

## Mocking

**Framework:** Vitest built-in `vi.fn()`

**Patterns:**

Mock adapter factory with captured handler references:
```typescript
function createMockAdapter(): PlatformAdapter & {
  _toolCallHandler: ToolCallHandler | null;
  _bootstrapHandler: BootstrapHandler | null;
} {
  let toolCallHandler: ToolCallHandler | null = null;
  let bootstrapHandler: BootstrapHandler | null = null;

  return {
    platform: 'test',
    getWorkspacePath: () => '/tmp/test',
    onBeforeToolCall: vi.fn((handler: ToolCallHandler) => {
      toolCallHandler = handler;
    }),
    onAgentBootstrap: vi.fn((handler: BootstrapHandler) => {
      bootstrapHandler = handler;
    }),
    registerCliCommand: vi.fn(),
    // ... other methods vi.fn()
    get _toolCallHandler() { return toolCallHandler; },
    get _bootstrapHandler() { return bootstrapHandler; },
  };
}
```

Mock audit pipeline with call capture:
```typescript
function createMockAudit(): AuditPipeline & { _calls: AuditLogInput[] } {
  const calls: AuditLogInput[] = [];
  return {
    log: vi.fn((input: AuditLogInput) => { calls.push(input); }),
    logBlocked: vi.fn(),
    createTraceId: vi.fn(() => 'test-trace-id'),
    getSessionId: vi.fn(() => 'test-session-id'),
    verifyChain: vi.fn(() => ({ valid: true, entries: 0 })),
    _calls: calls,
  } as unknown as AuditPipeline & { _calls: AuditLogInput[] };
}
```

IO mock (from `src/cli/io.ts` — the mock is in production code, exported for tests):
```typescript
// Production code exports createMockIO for test use
export function createMockIO(responses: string[]): InterviewIO & { getOutput(): string[] }

// Usage in tests:
const io = createMockIO([...completeInterviewResponses]);
const result = await runInterview(io);
```

**What to Mock:**
- Platform adapter: always mock via `createMockAdapter()` helper — never use real OpenClaw API in unit tests
- Audit pipeline: mock when testing other subsystems that call audit; use real `AuditPipeline` in audit tests
- IO: use `createMockIO()` (exported from `src/cli/io.ts`) for CLI/onboarding tests
- `vi.fn()` for any interface method not under test

**What NOT to Mock:**
- Filesystem operations — unit tests use `mkdtempSync` to create real temp directories
- TypeBox validation — always use real `Value.Check()` / `Value.Errors()`
- YAML parsing — use real `stringifyYAML` / `parseFrontmatter`
- Hash computation — use real `computeHash` / `updateKnownGoodHash`

## Fixtures and Factories

**Test Data:**

Shared CANS fixture — shared across all tests:
```typescript
// test/fixtures/valid-cans-data.ts
export const validCANSData = {
  version: '2.0',
  provider: {
    name: 'Dr. Test Provider',
    npi: '1234567890',
    types: ['Physician'],
    // ... complete valid CANS document
  },
  // ...
};
```

Integration fixture with workspace setup:
```typescript
// test/fixtures/synthetic-neurosurgeon.ts
export const syntheticNeurosurgeonCANS = { ...validCANSData, provider: { ... } };
export function createTestWorkspace(workspacePath: string): void { /* writes CANS.md + hash */ }
```

Interview responses fixture:
```typescript
// test/fixtures/interview-responses.ts
export const completeInterviewResponses: string[] = [ /* ordered responses for runInterview() */ ];
```

Other fixtures:
- `test/fixtures/valid-cans.md` — raw CANS.md file
- `test/fixtures/malformed-cans.md` — for parse error tests
- `test/fixtures/tampered-cans.md` — for integrity tests

**Local helper factories in test files:**

Per-file factory helpers are common for domain-specific test data:
```typescript
// In hardening.test.ts:
function makeCans(overrides?: Partial<CANSDocument>): CANSDocument {
  return { ...validCANSData, ...overrides } as CANSDocument;
}

// In tool-policy.test.ts:
function makeEvent(toolName: string, params?: Record<string, unknown>): ToolCallEvent {
  return { toolName, ...(params !== undefined && { params }) };
}
```

**Location:**
- Shared fixtures: `test/fixtures/`
- Per-test helpers: defined at the top of the test file, before test suites, marked with `// Mock helpers` or `// Helpers` section comment

## Coverage

**Requirements:** 80% threshold enforced on lines, branches, functions, and statements

**Configuration** (`vitest.config.ts`):
```typescript
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
```

**View Coverage:**
```bash
npm run test:coverage
# Report output: coverage/ directory (HTML + lcov)
```

## Test Types

**Unit Tests (`test/unit/`):**
- Scope: single module or function in isolation
- Dependencies: mocked via `vi.fn()` factories or real filesystem via `mkdtempSync`
- No network, no real platform API
- Fast: no async I/O beyond filesystem

**Integration Tests (`test/integration/`):**
- Scope: cross-subsystem wiring (activation + hardening + audit + skills together)
- Uses `createTestWorkspace()` fixture to create fully-formed workspaces
- Tests full plugin lifecycle: `register()` → activate → tool call → audit chain
- Still no network — all filesystem-based

**Smoke Test (`test/smoke.test.ts`):**
- Scope: verifies the library exports a `register` function and it doesn't throw on a mock API
- Single file, two tests — minimal sanity check only

**E2E Tests (`test/integration/e2e-flow.test.ts`):**
- Tests complete flows: fresh workspace → register → hardening → skills → audit chain verification
- Verifies audit hash chain integrity manually using `createHash('sha256')`
- Tests failure paths: missing CANS.md, malformed CANS.md, tampered CANS.md

## Common Patterns

**Async Testing:**
```typescript
// Async rejection assertion
await expect(client.register({ ... })).rejects.toThrow('not yet implemented');

// Async resolution check
const result = await runInterview(io);
expect(result.data).toBeDefined();
```

**Error Testing:**
```typescript
// Synchronous throw
expect(() => engine.check({ toolName: 'anything' })).toThrow('Engine not activated');

// Safety violation
expect(() => {
  freshEngine.resolveProposal('fake-scope-proposal', 'accept');
}).toThrow('SAFETY VIOLATION: Cannot modify scope fields');
```

**Filesystem-based tests:**
```typescript
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'careagent-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Read and parse JSONL audit logs directly in assertions
function readEntries(): AuditEntry[] {
  const content = readFileSync(getLogPath(), 'utf-8').trimEnd();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}
```

**Iterating over enum values in tests:**
```typescript
it('accepts all valid tier values for each action', () => {
  for (const tier of ['autonomous', 'supervised', 'manual'] as const) {
    const data = structuredClone(validCANSData);
    data.autonomy.chart = tier;
    expect(Value.Check(CANSSchema, data)).toBe(true);
  }
});
```

**structuredClone for fixture mutation:**
```typescript
// Always clone fixture before mutating to avoid cross-test pollution
const data = structuredClone(validCANSData);
delete (data.provider as Record<string, unknown>).name;
expect(Value.Check(CANSSchema, data)).toBe(false);
```

---

*Testing analysis: 2026-02-21*
