/**
 * Hardening module — re-exports types and factory.
 */

export type {
  HardeningEngine,
  HardeningLayerResult,
  HardeningConfig,
  HardeningLayerFn,
} from './types.js';
export { createHardeningEngine } from './engine.js';
