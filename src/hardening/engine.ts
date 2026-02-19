/**
 * Hardening engine factory — stub implementation for Phase 3.
 *
 * All methods throw "not yet implemented" errors. Phase 3 will replace
 * this with the full 6-layer hardening engine.
 */

import type { HardeningEngine } from './types.js';

/** Create a hardening engine instance (stub — Phase 3). */
export function createHardeningEngine(): HardeningEngine {
  return {
    activate(_config) {
      throw new Error('Hardening engine not yet implemented (Phase 3)');
    },
    check(_toolName, _params) {
      throw new Error('Hardening engine not yet implemented (Phase 3)');
    },
    injectProtocol(_cans) {
      throw new Error('Hardening engine not yet implemented (Phase 3)');
    },
  };
}
