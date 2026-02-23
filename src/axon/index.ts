/**
 * Axon module — re-exports types, error class, and factory.
 */

export { createAxonClient } from './client.js';
export type {
  AxonClient,
  AxonClientConfig,
  AxonProviderType,
  AxonQuestionnaire,
  AxonQuestion,
  AxonQuestionOption,
  AxonQuestionCondition,
  AxonActionAssignment,
  AxonClientErrorCode,
} from './types.js';
export { AxonClientError } from './types.js';
