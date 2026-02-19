import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  computeSkillFileHash,
  computeSkillChecksums,
  verifySkillIntegrity,
} from '../../../src/skills/integrity.js';

const tempDirs: string[] = [];

function createTempSkillDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-test-'));
  tempDirs.push(dir);
  return dir;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe('computeSkillFileHash', () => {
  it('computes SHA-256 hash of a known string', () => {
    const dir = createTempSkillDir();
    const content = 'hello world';
    const filePath = join(dir, 'test.txt');
    writeFileSync(filePath, content, 'utf-8');

    const hash = computeSkillFileHash(filePath);
    expect(hash).toBe(sha256('hello world'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different content', () => {
    const dir = createTempSkillDir();
    writeFileSync(join(dir, 'a.txt'), 'content-a', 'utf-8');
    writeFileSync(join(dir, 'b.txt'), 'content-b', 'utf-8');

    const hashA = computeSkillFileHash(join(dir, 'a.txt'));
    const hashB = computeSkillFileHash(join(dir, 'b.txt'));
    expect(hashA).not.toBe(hashB);
  });
});

describe('computeSkillChecksums', () => {
  it('returns hashes for all files in a directory', () => {
    const dir = createTempSkillDir();
    writeFileSync(join(dir, 'index.ts'), 'export default {};', 'utf-8');
    writeFileSync(join(dir, 'template.json'), '{"sections":[]}', 'utf-8');

    const checksums = computeSkillChecksums(dir);
    expect(Object.keys(checksums)).toHaveLength(2);
    expect(checksums['index.ts']).toBe(sha256('export default {};'));
    expect(checksums['template.json']).toBe(sha256('{"sections":[]}'));
  });

  it('returns filenames in sorted order', () => {
    const dir = createTempSkillDir();
    writeFileSync(join(dir, 'zebra.txt'), 'z', 'utf-8');
    writeFileSync(join(dir, 'alpha.txt'), 'a', 'utf-8');
    writeFileSync(join(dir, 'middle.txt'), 'm', 'utf-8');

    const checksums = computeSkillChecksums(dir);
    const keys = Object.keys(checksums);
    expect(keys).toEqual(['alpha.txt', 'middle.txt', 'zebra.txt']);
  });

  it('skips subdirectories', () => {
    const dir = createTempSkillDir();
    writeFileSync(join(dir, 'index.ts'), 'code', 'utf-8');
    mkdirSync(join(dir, 'subdir'));
    writeFileSync(join(dir, 'subdir', 'nested.ts'), 'nested', 'utf-8');

    const checksums = computeSkillChecksums(dir);
    expect(Object.keys(checksums)).toEqual(['index.ts']);
    expect(checksums['subdir']).toBeUndefined();
  });

  it('returns empty record for empty directory', () => {
    const dir = createTempSkillDir();
    const checksums = computeSkillChecksums(dir);
    expect(checksums).toEqual({});
  });
});

describe('verifySkillIntegrity', () => {
  it('passes when all hashes match', () => {
    const dir = createTempSkillDir();
    const content1 = 'export function main() {}';
    const content2 = '{"template": true}';
    writeFileSync(join(dir, 'index.ts'), content1, 'utf-8');
    writeFileSync(join(dir, 'template.json'), content2, 'utf-8');

    const manifest = {
      files: {
        'index.ts': sha256(content1),
        'template.json': sha256(content2),
      },
    };

    const result = verifySkillIntegrity(dir, manifest);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('fails when a file is modified (hash mismatch)', () => {
    const dir = createTempSkillDir();
    writeFileSync(join(dir, 'index.ts'), 'original content', 'utf-8');

    const manifest = {
      files: {
        'index.ts': sha256('original content'),
      },
    };

    // Modify the file after computing manifest hash
    writeFileSync(join(dir, 'index.ts'), 'tampered content', 'utf-8');

    const result = verifySkillIntegrity(dir, manifest);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Hash mismatch');
    expect(result.reason).toContain('index.ts');
  });

  it('fails when a file is missing', () => {
    const dir = createTempSkillDir();

    const manifest = {
      files: {
        'missing-file.ts': sha256('does not matter'),
      },
    };

    const result = verifySkillIntegrity(dir, manifest);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing skill file');
    expect(result.reason).toContain('missing-file.ts');
  });

  it('skips skill-manifest.json entry', () => {
    const dir = createTempSkillDir();
    const content = 'export const x = 1;';
    writeFileSync(join(dir, 'index.ts'), content, 'utf-8');
    // Write a manifest file with different content than the hash suggests
    writeFileSync(join(dir, 'skill-manifest.json'), '{"changed": true}', 'utf-8');

    const manifest = {
      files: {
        'index.ts': sha256(content),
        'skill-manifest.json': 'this-hash-should-be-ignored',
      },
    };

    const result = verifySkillIntegrity(dir, manifest);
    expect(result.valid).toBe(true);
  });

  it('passes with empty files record', () => {
    const dir = createTempSkillDir();
    const manifest = { files: {} };
    const result = verifySkillIntegrity(dir, manifest);
    expect(result.valid).toBe(true);
  });

  it('includes truncated hashes in mismatch reason', () => {
    const dir = createTempSkillDir();
    writeFileSync(join(dir, 'code.ts'), 'actual', 'utf-8');

    const manifest = {
      files: {
        'code.ts': sha256('expected'),
      },
    };

    const result = verifySkillIntegrity(dir, manifest);
    expect(result.valid).toBe(false);
    // Reason should contain truncated hashes (12 chars + ...)
    expect(result.reason).toMatch(/expected [a-f0-9]{12}\.\.\., got [a-f0-9]{12}\.\.\./);
  });
});
