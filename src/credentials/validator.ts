/**
 * Credential validator factory — stub implementation for Phase 4.
 *
 * All methods throw "not yet implemented" errors. Phase 4 will replace
 * this with the full credential validation logic.
 */

import type { CredentialValidator } from './types.js';

/** Create a credential validator instance (stub — Phase 4). */
export function createCredentialValidator(): CredentialValidator {
  return {
    check(_cans, _requiredCredentials) {
      throw new Error('Credential validator not yet implemented (Phase 4)');
    },
  };
}
