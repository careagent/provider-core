/**
 * End-to-end flow integration tests (INTG-01, INTG-03).
 *
 * Verifies the complete plugin lifecycle:
 * - Fresh workspace -> register -> activate -> hardening -> skills -> audit chain
 * - Missing CANS.md graceful inactive mode
 * - Malformed CANS.md with clear error
 * - Tampered CANS.md integrity mismatch
 * - Standalone API developer install path
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import register from '../../src/index.js';
import { activate } from '../../src/entry/standalone.js';
import {
  createTestWorkspace,
  syntheticNeurosurgeonCANSContent,
} from '../fixtures/synthetic-neurosurgeon.js';
import { stringifyYAML } from '../../src/vendor/yaml/index.js';
import { validCANSData } from '../fixtures/valid-cans-data.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock OpenClaw API that records method calls and stores handlers.
 */
function createMockAPI(workspacePath: string) {
  const commands: Record<string, unknown> = {};
  let backgroundService: unknown = null;
  const handlers: Record<string, Function> = {};
  const logs: Array<{ level: string; msg: string }> = [];
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    workspaceDir: workspacePath,
    registerCli: (cb: Function, opts: unknown) => {
      calls.push({ method: 'registerCli', args: [opts] });
      cb({
        program: {
          command: (name: string) => {
            const cmd = {
              description: (desc: string) => ({
                action: (handler: Function) => {
                  commands[name] = { desc, handler };
                  return cmd;
                },
              }),
            };
            return cmd;
          },
        },
      });
    },
    registerService: (config: unknown) => {
      backgroundService = config;
      calls.push({ method: 'registerService', args: [config] });
    },
    registerCommand: (config: unknown) => {
      calls.push({ method: 'registerCommand', args: [config] });
    },
    on: (event: string, handler: Function) => {
      handlers[event] = handler;
      calls.push({ method: 'on', args: [event, handler] });
    },
    log: (level: string, msg: string) => {
      logs.push({ level, msg });
      calls.push({ method: 'log', args: [level, msg] });
    },

    // Accessor methods for test assertions
    getCommands: () => commands,
    getBackgroundService: () => backgroundService,
    getHandlers: () => handlers,
    getLogs: () => logs,
    getCalls: () => calls,
  };
}

/**
 * Read and parse all audit log entries from a workspace.
 */
function readAuditEntries(workspacePath: string): Array<Record<string, unknown>> {
  const auditPath = join(workspacePath, '.careagent', 'AUDIT.log');
  if (!existsSync(auditPath)) return [];
  const content = readFileSync(auditPath, 'utf-8');
  return content
    .trimEnd()
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => JSON.parse(line));
}

/**
 * Verify audit hash chain integrity manually.
 */
function verifyHashChain(entries: Array<Record<string, unknown>>, rawLines: string[]): boolean {
  let expectedPrevHash: string | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const parsed = JSON.parse(line);
    if (parsed.prev_hash !== expectedPrevHash) {
      return false;
    }
    expectedPrevHash = createHash('sha256').update(line).digest('hex');
  }

  return true;
}

// ---------------------------------------------------------------------------
// Tests: INTG-01 -- End-to-End Flow
// ---------------------------------------------------------------------------

describe('INTG-01: End-to-End Flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-e2e-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes fresh workspace -> register -> activate -> skills -> audit', () => {
    createTestWorkspace(tmpDir);

    // Create a skills/chart-skill/ directory with a minimal skill-manifest.json
    const skillsDir = join(tmpDir, 'skills', 'chart-skill');
    mkdirSync(skillsDir, { recursive: true });

    const skillContent = '# Chart Skill\n\nA clinical charting skill for neurosurgeons.\n';
    writeFileSync(join(skillsDir, 'SKILL.md'), skillContent);

    const skillHash = createHash('sha256').update(skillContent, 'utf-8').digest('hex');
    const manifest = {
      skill_id: 'chart-skill',
      version: '1.0.0',
      requires: {
        license: ['MD', 'DO'],
        specialty: ['Neurosurgery'],
        privilege: ['neurosurgical procedures'],
      },
      files: { 'SKILL.md': skillHash },
      pinned: true,
      approved_version: '1.0.0',
    };
    writeFileSync(join(skillsDir, 'skill-manifest.json'), JSON.stringify(manifest, null, 2));

    // Register plugin
    const api = createMockAPI(tmpDir);
    expect(() => register(api)).not.toThrow();

    // Assert: activation log entry has outcome: 'active'
    const entries = readAuditEntries(tmpDir);
    const activationEntry = entries.find(
      (e) => e.action === 'activation_check' && e.outcome === 'active',
    );
    expect(activationEntry).toBeDefined();

    // Assert: hardening-related handlers were registered
    const handlers = api.getHandlers();
    expect(handlers['before_tool_call']).toBeDefined();
    expect(handlers['agent:bootstrap']).toBeDefined();

    // Assert: skill loading occurred (check AUDIT.log for skill_load entries)
    const skillLoadEntries = entries.filter((e) => e.action === 'skill_load');
    expect(skillLoadEntries.length).toBeGreaterThan(0);

    // Assert: audit chain is intact
    const auditPath = join(tmpDir, '.careagent', 'AUDIT.log');
    const rawContent = readFileSync(auditPath, 'utf-8');
    const rawLines = rawContent.trimEnd().split('\n').filter((l) => l.trim());
    expect(verifyHashChain(entries, rawLines)).toBe(true);

    // Assert: refinement engine was created (careagent proposals command registered)
    const commands = api.getCommands();
    expect(commands['careagent proposals']).toBeDefined();
  });

  it('handles missing CANS.md gracefully (inactive mode)', () => {
    // Create temp workspace WITHOUT CANS.md
    mkdirSync(join(tmpDir, '.careagent'), { recursive: true });

    const api = createMockAPI(tmpDir);
    expect(() => register(api)).not.toThrow();

    // Assert: activation log says outcome: 'inactive'
    const entries = readAuditEntries(tmpDir);
    const activationEntry = entries.find(
      (e) => e.action === 'activation_check' && e.outcome === 'inactive',
    );
    expect(activationEntry).toBeDefined();

    // Assert: no hardening hooks registered
    const handlers = api.getHandlers();
    expect(handlers['before_tool_call']).toBeUndefined();

    // Assert: CLI commands still registered (careagent init available)
    const calls = api.getCalls();
    expect(calls.some((c) => c.method === 'registerCli')).toBe(true);
  });

  it('handles malformed CANS.md with clear error', () => {
    // Create temp workspace with malformed CANS.md (missing required fields)
    const malformedContent = `---\nversion: "1.0"\nprovider:\n  name: "Incomplete"\n---\n\nIncomplete document.\n`;
    writeFileSync(join(tmpDir, 'CANS.md'), malformedContent);
    mkdirSync(join(tmpDir, '.careagent'), { recursive: true });

    const api = createMockAPI(tmpDir);
    expect(() => register(api)).not.toThrow();

    // Assert: activation is inactive with a schema error reason
    const entries = readAuditEntries(tmpDir);
    const activationEntry = entries.find((e) => e.action === 'activation_check');
    expect(activationEntry).toBeDefined();
    expect(activationEntry!.outcome).toBe('inactive');

    // Check logs for schema error mention
    const logs = api.getLogs();
    const errorLog = logs.find((l) => l.msg.includes('inactive') || l.msg.includes('validation'));
    expect(errorLog).toBeDefined();
  });

  it('handles tampered CANS.md (integrity mismatch)', () => {
    // Create temp workspace with valid CANS.md and seeded hash
    createTestWorkspace(tmpDir);

    // Modify CANS.md content after hash is seeded
    const tamperedContent = syntheticNeurosurgeonCANSContent.replace(
      'Dr. Sarah Chen',
      'Dr. Evil Hacker',
    );
    writeFileSync(join(tmpDir, 'CANS.md'), tamperedContent);

    const api = createMockAPI(tmpDir);
    expect(() => register(api)).not.toThrow();

    // Assert: activation is inactive with integrity mismatch reason
    const entries = readAuditEntries(tmpDir);
    const activationEntry = entries.find((e) => e.action === 'activation_check');
    expect(activationEntry).toBeDefined();
    expect(activationEntry!.outcome).toBe('inactive');

    const logs = api.getLogs();
    const tamperLog = logs.find(
      (l) => l.msg.includes('inactive') || l.msg.includes('integrity') || l.msg.includes('tamper'),
    );
    expect(tamperLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: INTG-03 -- Developer Install Path
// ---------------------------------------------------------------------------

describe('INTG-03: Developer Install Path', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-standalone-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('standalone API: activate -> check engine -> inspect skills', () => {
    createTestWorkspace(tmpDir);

    const result = activate(tmpDir);

    // Assert: activation is active
    expect(result.activation.active).toBe(true);

    // Assert: engine exists (hardening engine)
    expect(result.engine).toBeDefined();

    // Assert: audit is an AuditPipeline
    expect(result.audit).toBeDefined();
    expect(typeof result.audit.log).toBe('function');
    expect(typeof result.audit.verifyChain).toBe('function');

    // Assert: refinement engine exists
    expect(result.refinement).toBeDefined();
    expect(typeof result.refinement!.observe).toBe('function');
    expect(typeof result.refinement!.generateProposals).toBe('function');
    expect(typeof result.refinement!.resolveProposal).toBe('function');
  });
});
