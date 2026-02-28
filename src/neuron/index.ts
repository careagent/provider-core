/**
 * Neuron module — re-exports types and factory.
 */

export type {
  NeuronClient,
  NeuronRegistration,
  NeuronRegisterConfig,
  NeuronRegisterResult,
  NeuronHeartbeatResult,
  NeuronCredential,
  NeuronClientErrorCode,
} from './types.js';
export { NeuronClientError } from './types.js';
export { createNeuronClient } from './client.js';
export type { NeuronClientConfig } from './client.js';
