/**
 * Protocol module — re-exports types and factories.
 *
 * Cross-installation protocol (Phase 5 stub):
 */
export type { ProtocolServer, ProtocolSession } from './types.js';
export { createProtocolServer } from './server.js';

/**
 * Interaction protocol engine (replaces BOOTSTRAP.md):
 */
export {
  createLLMClient,
  type LLMClient,
  type LLMClientConfig,
  type LLMMessage,
  type LLMContentBlock,
  type LLMTool,
  type LLMChatParams,
  type LLMResponse,
} from './llm-client.js';

export {
  createSession,
  advanceSession,
  completeSession,
  failSession,
  generateUUIDv7,
  type InteractionSession,
  type SessionStatus,
} from './session.js';

export {
  validateAnswer,
  type ValidationResult,
} from './validator.js';

export {
  resolveNextQuestion,
  evaluateCondition,
} from './question-resolver.js';

export {
  buildSystemPrompt,
  buildAnswerTool,
  type PromptContext,
} from './prompt-builder.js';

export {
  createProtocolEngine,
  type ProtocolEngine,
  type ProtocolEngineConfig,
} from './engine.js';

export {
  createCANSArtifactGenerator,
  type ArtifactGenerator,
} from './artifact-generator.js';

export {
  createTelegramMessageIO,
  createMockMessageIO,
  type MessageIO,
  type TelegramMessageIOConfig,
} from './message-io.js';
