/**
 * Messaging module — re-exports types, schemas, and factories for
 * the provider-to-patient clinical messaging pipeline.
 */

// Schemas and types
export {
  InjectaVoxDataSchema,
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
  ClinicalMessageSchema,
  SignedMessageEnvelopeSchema,
  MessageSendResultSchema,
} from './schemas.js';
export type {
  InjectaVoxData,
  ClinicalSummary,
  AppointmentReminder,
  CarePlanUpdate,
  ClinicalMessage,
  SignedMessageEnvelope,
  MessageSendResult,
} from './schemas.js';

// Message generation
export { generateMessage } from './generator.js';

// Ed25519 signing
export { signMessage, canonicalize } from './signer.js';

// Consent verification
export { verifyConsent } from './consent.js';
export type { ConsentCheckConfig, ConsentCheckResult } from './consent.js';

// WebSocket transport
export { sendMessage } from './transport.js';
export type { TransportConfig, TransportResult } from './transport.js';

// Pipeline orchestrator
export { createMessagingPipeline } from './pipeline.js';
export type { MessagingPipelineConfig, MessagingPipeline } from './pipeline.js';
