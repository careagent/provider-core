/**
 * Integration tests for the onboarding flow.
 *
 * Covers:
 * - ONBD-01: careagent init interview flow
 * - ONBD-02: CANS.md generation and activation
 * - ONBD-03: Workspace file supplementation
 * - ONBD-05: Iterative refinement (edit during review)
 *
 * Uses temporary workspaces and createMockIO to simulate full end-to-end runs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMockIO } from '../../src/cli/io.js';
import { runInitCommand } from '../../src/cli/init-command.js';
import { AuditPipeline } from '../../src/audit/pipeline.js';
import { ActivationGate } from '../../src/activation/gate.js';
import { parseFrontmatter } from '../../src/activation/cans-parser.js';
import { CANSSchema } from '../../src/activation/cans-schema.js';
import { Value } from '@sinclair/typebox/value';
import {
  completeInterviewResponses,
  minimalInterviewResponses,
} from '../fixtures/interview-responses.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the CANS.md file from a temp workspace.
 */
function readCANS(dir: string): string {
  return readFileSync(join(dir, 'CANS.md'), 'utf-8');
}

/**
 * Read a workspace file from a temp workspace.
 */
function readWorkspaceFile(dir: string, filename: string): string {
  return readFileSync(join(dir, filename), 'utf-8');
}

/**
 * Run the init command with given responses in a temp workspace.
 * Returns the mock IO for output inspection.
 */
async function runInit(dir: string, responses: string[]) {
  const io = createMockIO(responses);
  const audit = new AuditPipeline(dir);
  await runInitCommand(io, dir, audit);
  return io;
}

// ---------------------------------------------------------------------------
// ONBD-01: careagent init interview flow
// ---------------------------------------------------------------------------

describe('ONBD-01: careagent init interview flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-onboard-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes without error using completeInterviewResponses', async () => {
    await expect(runInit(tmpDir, [...completeInterviewResponses])).resolves.not.toThrow();
  });

  it('collects provider name, types, specialty from interview', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    expect(content).toContain('Dr. Test Provider');
    expect(content).toContain('Physician');
    expect(content).toContain('Neurosurgery');
  });

  it('collects scope and autonomy from interview', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    expect(content).toContain('chart_operative_note');
    expect(content).toContain('autonomous');
  });

  it('collects HIPAA warning acknowledgment from interview', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    // HIPAA consent is in the frontmatter
    expect(content).toContain('hipaa_warning_acknowledged: true');
  });

  it('completes without error using minimalInterviewResponses', async () => {
    await expect(runInit(tmpDir, [...minimalInterviewResponses])).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ONBD-02: CANS.md generation and activation
// ---------------------------------------------------------------------------

describe('ONBD-02: CANS.md generation and activation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-cans-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CANS.md exists in workspace after init', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    expect(existsSync(join(tmpDir, 'CANS.md'))).toBe(true);
  });

  it('CANS.md starts with --- (has YAML frontmatter)', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    expect(content.trimStart()).toMatch(/^---/);
  });

  it('CANS.md passes parseFrontmatter and CANSSchema validation', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    const { frontmatter, error } = parseFrontmatter(content);
    expect(error).toBeUndefined();
    expect(frontmatter).not.toBeNull();
    expect(Value.Check(CANSSchema, frontmatter)).toBe(true);
  });

  it('ActivationGate.check() returns { active: true } for generated CANS.md', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const gate = new ActivationGate(tmpDir, () => { /* no-op */ });
    const result = gate.check();
    expect(result.active).toBe(true);
    expect(result.document).not.toBeNull();
  });

  it('CANS.md contains provider name from interview', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    expect(content).toContain('Dr. Test Provider');
  });

  it('CANS.md markdown body includes "# Care Agent Nervous System"', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    expect(content).toContain('# Care Agent Nervous System');
  });

  it('CANS.md markdown body includes philosophy text', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readCANS(tmpDir);
    expect(content).toContain('Evidence-based neurosurgical practice');
  });
});

// ---------------------------------------------------------------------------
// ONBD-03: Workspace file supplementation
// ---------------------------------------------------------------------------

describe('ONBD-03: Workspace file supplementation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-workspace-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('SOUL.md exists after init', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    expect(existsSync(join(tmpDir, 'SOUL.md'))).toBe(true);
  });

  it('AGENTS.md exists after init', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(true);
  });

  it('USER.md exists after init', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    expect(existsSync(join(tmpDir, 'USER.md'))).toBe(true);
  });

  it('SOUL.md contains CareAgent markers', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'SOUL.md');
    expect(content).toContain('<!-- CareAgent: BEGIN -->');
    expect(content).toContain('<!-- CareAgent: END -->');
  });

  it('AGENTS.md contains CareAgent markers', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'AGENTS.md');
    expect(content).toContain('<!-- CareAgent: BEGIN -->');
    expect(content).toContain('<!-- CareAgent: END -->');
  });

  it('USER.md contains CareAgent markers', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'USER.md');
    expect(content).toContain('<!-- CareAgent: BEGIN -->');
    expect(content).toContain('<!-- CareAgent: END -->');
  });

  it('SOUL.md contains provider specialty and philosophy', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'SOUL.md');
    expect(content).toContain('Neurosurgery');
    expect(content).toContain('Evidence-based neurosurgical practice');
  });

  it('AGENTS.md contains clinical safety rules', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'AGENTS.md');
    expect(content).toContain('Clinical Safety Rules');
    expect(content).toContain('NEVER');
  });

  it('USER.md contains provider name and credentials', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'USER.md');
    expect(content).toContain('Dr. Test Provider');
    expect(content).toContain('MD');
  });

  it('pre-existing SOUL.md content is preserved after init', async () => {
    const existingContent = 'My existing content\n';
    writeFileSync(join(tmpDir, 'SOUL.md'), existingContent, 'utf-8');
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'SOUL.md');
    expect(content).toContain('My existing content');
    expect(content).toContain('<!-- CareAgent: BEGIN -->');
  });

  it('running init twice does not duplicate CareAgent sections (idempotent)', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    await runInit(tmpDir, [...completeInterviewResponses]);
    const content = readWorkspaceFile(tmpDir, 'SOUL.md');
    // Only one BEGIN marker should exist
    const beginCount = (content.match(/<!-- CareAgent: BEGIN -->/g) || []).length;
    expect(beginCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ONBD-05: Iterative refinement
// ---------------------------------------------------------------------------

describe('ONBD-05: Iterative refinement', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-refine-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('edit provider name during review: CANS.md contains new name', async () => {
    // Full interview responses, then:
    // "1" = edit provider (IDENTITY stage) in review menu
    // "Dr. Updated Name" = new name
    // "" = skip NPI
    // "0" = approve in second review menu pass
    const interviewPart = completeInterviewResponses.slice(0, -1); // all except final '0' approve
    const responses = [
      ...interviewPart,
      '1',              // review menu: edit provider information (index 1)
      'Dr. Updated Name', // new name
      '',               // skip NPI (optional)
      '0',              // approve in next review loop
    ];

    await runInit(tmpDir, responses);
    const content = readCANS(tmpDir);
    expect(content).toContain('Dr. Updated Name');
  });
});

// ---------------------------------------------------------------------------
// Post-init verification
// ---------------------------------------------------------------------------

describe('Post-init verification', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-postinit-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('.careagent/cans-integrity.json exists after init', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    expect(existsSync(join(tmpDir, '.careagent', 'cans-integrity.json'))).toBe(true);
  });

  it('.careagent/AUDIT.log contains a cans_generated entry after init', async () => {
    await runInit(tmpDir, [...completeInterviewResponses]);
    const logPath = join(tmpDir, '.careagent', 'AUDIT.log');
    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const entries = lines.map(l => JSON.parse(l) as Record<string, unknown>);
    const cansGenEntry = entries.find(e => e['action'] === 'cans_generated');
    expect(cansGenEntry).toBeDefined();
    expect(cansGenEntry?.['outcome']).toBe('allowed');
  });

  it('audit chain is valid after init', async () => {
    const audit = new AuditPipeline(tmpDir);
    const io = createMockIO([...completeInterviewResponses]);
    await runInitCommand(io, tmpDir, audit);
    const chainResult = audit.verifyChain();
    expect(chainResult.valid).toBe(true);
  });
});
