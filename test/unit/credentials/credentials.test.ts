import { describe, it, expect } from 'vitest';
import { createCredentialValidator } from '../../../src/credentials/validator.js';

describe('createCredentialValidator', () => {
  it('returns an object with check method', () => {
    const validator = createCredentialValidator();
    expect(typeof validator.check).toBe('function');
  });

  it('check() throws with message containing "not yet implemented"', () => {
    const validator = createCredentialValidator();
    expect(() => validator.check({} as never, {})).toThrow('not yet implemented');
  });

  it('check() error message references Phase 4', () => {
    const validator = createCredentialValidator();
    expect(() => validator.check({} as never, {})).toThrow('Phase 4');
  });
});
