import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeHash,
  getIntegrityStorePath,
  verifyIntegrity,
  updateKnownGoodHash,
} from '../../../src/activation/cans-integrity.js';

describe('computeHash', () => {
  it('returns consistent SHA-256 hex string for same input', () => {
    const hash1 = computeHash('hello world');
    const hash2 = computeHash('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns different hashes for different inputs', () => {
    const hash1 = computeHash('hello world');
    const hash2 = computeHash('hello world!');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyIntegrity', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'cans-integrity-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('first load stores hash and returns { valid: true, isFirstLoad: true }', () => {
    const workspace = createTempDir();
    const content = 'test content';
    const result = verifyIntegrity(workspace, content);

    expect(result.valid).toBe(true);
    expect(result.isFirstLoad).toBe(true);
  });

  it('second load with same content returns { valid: true }', () => {
    const workspace = createTempDir();
    const content = 'test content';

    // First load
    verifyIntegrity(workspace, content);

    // Second load
    const result = verifyIntegrity(workspace, content);
    expect(result.valid).toBe(true);
    expect(result.isFirstLoad).toBeUndefined();
  });

  it('second load with different content returns { valid: false }', () => {
    const workspace = createTempDir();

    // First load with original content
    verifyIntegrity(workspace, 'original content');

    // Second load with tampered content
    const result = verifyIntegrity(workspace, 'tampered content');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('SHA-256 hash mismatch');
    expect(result.reason).toContain('tampered');
  });

  it('corrupted integrity store file returns { valid: false } with "corrupted" reason', () => {
    const workspace = createTempDir();
    const storePath = getIntegrityStorePath(workspace);

    // Create a corrupted store file
    const storeDir = join(workspace, '.careagent');
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(storePath, 'NOT VALID JSON {{{');

    const result = verifyIntegrity(workspace, 'some content');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Integrity store corrupted');
  });
});

describe('updateKnownGoodHash', () => {
  const tempDirs: string[] = [];

  function createTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'cans-integrity-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('updates stored hash so subsequent verification passes with new content', () => {
    const workspace = createTempDir();

    // First load with original content
    verifyIntegrity(workspace, 'original content');

    // Update known good hash to new content
    updateKnownGoodHash(workspace, 'new content');

    // Verify with new content should pass
    const result = verifyIntegrity(workspace, 'new content');
    expect(result.valid).toBe(true);
  });
});
