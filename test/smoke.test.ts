import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('@careagent/provider-core', () => {
  it('exports a register function', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.default).toBe('function');
  });

  it('register function accepts a mock API without throwing', async () => {
    const mod = await import('../src/index.js');
    const tmpDir = mkdtempSync(join(tmpdir(), 'careagent-smoke-'));
    expect(() => mod.default({ workspaceDir: tmpDir })).not.toThrow();
  });
});
