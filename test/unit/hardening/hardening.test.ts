import { describe, it, expect } from 'vitest';
import { createHardeningEngine } from '../../../src/hardening/engine.js';

describe('createHardeningEngine', () => {
  it('returns an object with activate, check, and injectProtocol methods', () => {
    const engine = createHardeningEngine();
    expect(typeof engine.activate).toBe('function');
    expect(typeof engine.check).toBe('function');
    expect(typeof engine.injectProtocol).toBe('function');
  });

  it('activate() throws with message containing "not yet implemented"', () => {
    const engine = createHardeningEngine();
    expect(() => engine.activate({} as never)).toThrow('not yet implemented');
  });

  it('check() throws with message containing "not yet implemented"', () => {
    const engine = createHardeningEngine();
    expect(() => engine.check({ toolName: 'test-tool' })).toThrow('not yet implemented');
  });

  it('injectProtocol() throws with message containing "not yet implemented"', () => {
    const engine = createHardeningEngine();
    expect(() => engine.injectProtocol({} as never)).toThrow('not yet implemented');
  });

  it('activate() error message references Phase 3', () => {
    const engine = createHardeningEngine();
    expect(() => engine.activate({} as never)).toThrow('Phase 3');
  });

  it('check() error message references Phase 3', () => {
    const engine = createHardeningEngine();
    expect(() => engine.check({ toolName: 'test-tool' })).toThrow('Phase 3');
  });

  it('injectProtocol() error message references Phase 3', () => {
    const engine = createHardeningEngine();
    expect(() => engine.injectProtocol({} as never)).toThrow('Phase 3');
  });
});
