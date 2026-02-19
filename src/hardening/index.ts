/**
 * Hardening module -- re-exports types, factory, layers, and canary.
 */

export type {
  HardeningEngine,
  HardeningLayerResult,
  HardeningConfig,
  HardeningLayerFn,
} from './types.js';
export { createHardeningEngine } from './engine.js';
export { checkToolPolicy } from './layers/tool-policy.js';
export { checkExecAllowlist } from './layers/exec-allowlist.js';
export { checkCansInjection, extractProtocolRules, injectProtocol } from './layers/cans-injection.js';
export { checkDockerSandbox, detectDocker } from './layers/docker-sandbox.js';
export { setupCanary } from './canary.js';
