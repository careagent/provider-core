/**
 * Neuron client factory — stub implementation for Phase 5.
 *
 * All methods throw "not yet implemented" errors. Phase 5 will replace
 * this with the full Neuron network client.
 */

import type { NeuronClient } from './types.js';

/** Create a Neuron client instance (stub — Phase 5). */
export function createNeuronClient(): NeuronClient {
  return {
    async register(_config) {
      throw new Error('Neuron client not yet implemented (Phase 5)');
    },
    async heartbeat() {
      throw new Error('Neuron client not yet implemented (Phase 5)');
    },
    async disconnect() {
      throw new Error('Neuron client not yet implemented (Phase 5)');
    },
  };
}
