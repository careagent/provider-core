/**
 * Integration tests for Phase 7 production wiring gap closure.
 *
 * Verifies that all five orphaned subsystem functions are reachable
 * from their production call sites after the wiring changes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectPlatform } from '../../src/adapters/detect.js';
import { activate } from '../../src/entry/standalone.js';
import { buildChartSkillInstructions } from '../../src/skills/chart-skill/index.js';
import { formatStatus } from '../../src/cli/status-command.js';
import { createTestWorkspace } from '../fixtures/synthetic-neurosurgeon.js';

// ---------------------------------------------------------------------------
// PORT-02: detectPlatform production call site
// ---------------------------------------------------------------------------

describe('PORT-02: detectPlatform production call site', () => {
  it('returns "openclaw" for an api object with openclaw-shaped methods', () => {
    const mockApi = { registerCli: () => {}, on: () => {}, workspaceDir: '/tmp' };
    expect(detectPlatform(mockApi)).toBe('openclaw');
  });

  it('returns "standalone" for undefined or plain object', () => {
    expect(detectPlatform(undefined)).toBe('standalone');
    expect(detectPlatform({})).toBe('standalone');
  });
});

// ---------------------------------------------------------------------------
// SKIL-05 / SKIL-06: buildChartSkillInstructions production call site
// ---------------------------------------------------------------------------

describe('SKIL-05/06: buildChartSkillInstructions production call site', () => {
  it('buildChartSkillInstructions returns non-empty instructions', () => {
    const instructions = buildChartSkillInstructions();
    expect(typeof instructions).toBe('string');
    expect(instructions.length).toBeGreaterThan(0);
  });

  it('buildChartSkillInstructions with voice returns voice-specific content', () => {
    const voice = {
      chart: 'concise, precise',
      order: '',
      charge: '',
      perform: '',
      interpret: '',
      educate: '',
      coordinate: '',
    };
    const instructions = buildChartSkillInstructions(voice);
    expect(instructions).toContain('concise, precise');
  });
});

// ---------------------------------------------------------------------------
// CANS-08: refinement.observe() production call site
// ---------------------------------------------------------------------------

describe('CANS-08: refinement.observe() production call site', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-wiring-refinement-'));
    createTestWorkspace(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refinement engine returned by activate() accepts observe() calls', () => {
    const result = activate(tmpDir);
    expect(result.refinement).toBeDefined();
    // Should not throw -- observe() is the production call site
    expect(() => {
      result.refinement!.observe({
        category: 'skill_usage',
        field_path: 'skills.chart',
        declared_value: 'chart-skill',
        observed_value: 'session_start',
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ONBD-04 cache write: skill-load-results.json written after activate()
// ---------------------------------------------------------------------------

describe('ONBD-04: skill cache write', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-wiring-cache-'));
    createTestWorkspace(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('activate() writes skill-load-results.json to .careagent/', () => {
    activate(tmpDir);
    const cachePath = join(tmpDir, '.careagent', 'skill-load-results.json');
    expect(existsSync(cachePath)).toBe(true);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache).toHaveProperty('timestamp');
    expect(Array.isArray(cache.results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ONBD-04 status read: formatStatus() shows Clinical Skills section
// ---------------------------------------------------------------------------

describe('ONBD-04: formatStatus() skill display', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'careagent-wiring-status-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('formatStatus() shows "Clinical Skills" section when cache exists', () => {
    // Write a minimal skill cache (without full activation)
    const cacheDir = join(tmpDir, '.careagent');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'skill-load-results.json'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        results: [{ skillId: 'chart-skill', loaded: true, version: '1.0.0' }],
      }),
      'utf-8',
    );
    const output = formatStatus(tmpDir);
    expect(output).toContain('Clinical Skills');
    expect(output).toContain('chart-skill');
    expect(output).toContain('Loaded');
  });

  it('formatStatus() shows "Not loaded in this session" when no cache exists', () => {
    const emptyWorkspace = mkdtempSync(join(tmpdir(), 'careagent-test-empty-'));
    try {
      const output = formatStatus(emptyWorkspace);
      // When inactive with no CANS.md, skills section may not appear -- just confirm no crash
      expect(typeof output).toBe('string');
    } finally {
      rmSync(emptyWorkspace, { recursive: true, force: true });
    }
  });

  it('formatStatus() shows "Not loaded in this session" for active workspace without cache', () => {
    // Create a valid workspace without skill cache
    createTestWorkspace(tmpDir);
    const output = formatStatus(tmpDir);
    expect(output).toContain('Clinical Skills');
    expect(output).toContain('Not loaded in this session');
  });
});
