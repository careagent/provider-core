import { describe, it, expect } from 'vitest';

describe('@careagent/core', () => {
  it('exports a register function', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.default).toBe('function');
  });

  it('register function accepts an argument without throwing', async () => {
    const mod = await import('../src/index.js');
    expect(() => mod.default({})).not.toThrow();
  });
});
