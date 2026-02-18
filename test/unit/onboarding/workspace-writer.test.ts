/**
 * Unit tests for workspace-writer.ts
 *
 * Covers supplementFile (pure function) and supplementWorkspaceFiles
 * (file I/O with atomic write).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { supplementFile, supplementWorkspaceFiles } from '../../../src/onboarding/workspace-writer.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';

const BEGIN = '<!-- CareAgent: BEGIN -->';
const END = '<!-- CareAgent: END -->';

// ---------------------------------------------------------------------------
// supplementFile — pure function tests
// ---------------------------------------------------------------------------

describe('supplementFile', () => {
  it('returns marked section only for empty content', () => {
    const result = supplementFile('', 'clinical text');
    expect(result).toBe(`${BEGIN}\nclinical text\n${END}\n`);
  });

  it('returns marked section only for whitespace-only content', () => {
    const result = supplementFile('   \n  ', 'clinical text');
    expect(result).toBe(`${BEGIN}\nclinical text\n${END}\n`);
  });

  it('appends marked section after existing content', () => {
    const existing = 'Existing content here.';
    const result = supplementFile(existing, 'clinical text');
    expect(result).toContain('Existing content here.');
    expect(result).toContain(BEGIN);
    expect(result).toContain('clinical text');
    expect(result).toContain(END);
    // Existing content comes before markers
    expect(result.indexOf('Existing content')).toBeLessThan(result.indexOf(BEGIN));
  });

  it('replaces existing marked section preserving before and after content', () => {
    const original = `Preamble\n\n${BEGIN}\nold section\n${END}\n\nEpilogue`;
    const result = supplementFile(original, 'new section');
    expect(result).toContain('Preamble');
    expect(result).toContain('new section');
    expect(result).toContain('Epilogue');
    expect(result).not.toContain('old section');
  });

  it('replaces marked section preserving trailing content after END marker', () => {
    const original = `${BEGIN}\nold\n${END}\nTrailing content here`;
    const result = supplementFile(original, 'new content');
    expect(result).toContain('new content');
    expect(result).toContain('Trailing content here');
    expect(result).not.toContain('old');
    expect(result.indexOf('Trailing')).toBeGreaterThan(result.indexOf(END));
  });

  it('is idempotent: calling twice with same section produces same output', () => {
    const first = supplementFile('', 'same section');
    const second = supplementFile(first, 'same section');
    expect(second).toBe(first);
  });

  it('is idempotent: different section replaces only the marked section', () => {
    const first = supplementFile('Header text\n', 'original section');
    const second = supplementFile(first, 'updated section');
    expect(second).toContain('Header text');
    expect(second).toContain('updated section');
    expect(second).not.toContain('original section');
    // Only one BEGIN marker
    expect(second.split(BEGIN).length - 1).toBe(1);
  });

  it('adds \\n\\n separator when existing content does not end with newline', () => {
    const existing = 'No newline at end';
    const result = supplementFile(existing, 'clinical text');
    expect(result).toContain('No newline at end\n\n' + BEGIN);
  });

  it('adds single \\n separator when existing content ends with newline', () => {
    const existing = 'Has newline at end\n';
    const result = supplementFile(existing, 'clinical text');
    expect(result).toContain('Has newline at end\n\n' + BEGIN);
  });

  it('does not match when only BEGIN marker is present', () => {
    const partial = `${BEGIN}\nsome content without end marker`;
    const result = supplementFile(partial, 'clinical text');
    // Should append, not replace (no valid marker pair found)
    expect(result).toContain(partial);
    expect(result).toContain('clinical text');
    // The new section should appear after the existing content
    expect(result.lastIndexOf(BEGIN)).toBeGreaterThan(partial.indexOf(BEGIN));
  });
});

// ---------------------------------------------------------------------------
// supplementWorkspaceFiles — file I/O tests
// ---------------------------------------------------------------------------

describe('supplementWorkspaceFiles', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'careagent-test-'));
  });

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true });
  });

  const philosophy = 'Patient safety above all else.';

  it('creates all three workspace files', () => {
    supplementWorkspaceFiles(workspacePath, validCANSData, philosophy);
    expect(existsSync(join(workspacePath, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(workspacePath, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(workspacePath, 'USER.md'))).toBe(true);
  });

  it('all files contain BEGIN and END markers', () => {
    supplementWorkspaceFiles(workspacePath, validCANSData, philosophy);
    for (const filename of ['SOUL.md', 'AGENTS.md', 'USER.md']) {
      const content = readFileSync(join(workspacePath, filename), 'utf-8');
      expect(content).toContain(BEGIN);
      expect(content).toContain(END);
    }
  });

  it('preserves pre-existing content in SOUL.md', () => {
    const existing = '# My Workspace\n\nThis is my custom header content.\n';
    writeFileSync(join(workspacePath, 'SOUL.md'), existing, 'utf-8');
    supplementWorkspaceFiles(workspacePath, validCANSData, philosophy);
    const content = readFileSync(join(workspacePath, 'SOUL.md'), 'utf-8');
    expect(content).toContain('# My Workspace');
    expect(content).toContain('This is my custom header content.');
    expect(content).toContain(BEGIN);
  });

  it('running supplement twice does not duplicate CareAgent section', () => {
    supplementWorkspaceFiles(workspacePath, validCANSData, philosophy);
    supplementWorkspaceFiles(workspacePath, validCANSData, philosophy);
    for (const filename of ['SOUL.md', 'AGENTS.md', 'USER.md']) {
      const content = readFileSync(join(workspacePath, filename), 'utf-8');
      const beginCount = (content.split(BEGIN).length - 1);
      const endCount = (content.split(END).length - 1);
      expect(beginCount).toBe(1);
      expect(endCount).toBe(1);
    }
  });

  it('leaves no .tmp files after write', () => {
    supplementWorkspaceFiles(workspacePath, validCANSData, philosophy);
    for (const filename of ['SOUL.md', 'AGENTS.md', 'USER.md']) {
      expect(existsSync(join(workspacePath, `${filename}.tmp`))).toBe(false);
    }
  });
});
