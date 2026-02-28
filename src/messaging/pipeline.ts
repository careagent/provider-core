/**
 * Messaging pipeline — orchestrates the full message send flow:
 *
 *   InjectaVox data → generate → refine → consent check → sign → send → audit
 *
 * Covers:
 * - MSG-09: Full pipeline orchestration
 * - MSG-10: Bilateral correlation IDs for cross-system audit matching
 * - MSG-11: Hash-chained audit logging for every send operation
 * - MSG-12: Refinement pass before sending
 *
 * Provider-initiated push model: the provider creates the message,
 * verifies consent, signs it, and sends it to the patient agent.
 */

import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { generateMessage } from './generator.js';
import { signMessage } from './signer.js';
import { verifyConsent, type ConsentCheckConfig } from './consent.js';
import { sendMessage as transportSend, type TransportConfig } from './transport.js';
import {
  ClinicalMessageSchema,
  type InjectaVoxData,
  type ClinicalMessage,
  type SignedMessageEnvelope,
  type MessageSendResult,
} from './schemas.js';
import type { AuditPipeline } from '../audit/pipeline.js';

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

export interface MessagingPipelineConfig {
  /** The audit pipeline for logging all messaging events. */
  audit: AuditPipeline;
  /** Provider's base64url-encoded Ed25519 private key. */
  providerPrivateKey: string;
  /** Provider's base64url-encoded Ed25519 public key. */
  providerPublicKey: string;
  /** Neuron server base URL for consent checks. */
  neuronEndpoint: string;
  /** Patient's neuron WebSocket endpoint for message delivery. */
  patientEndpoint: string;
  /** Optional refinement function for clinical summary quality. */
  refine?: (message: ClinicalMessage) => ClinicalMessage;
}

// ---------------------------------------------------------------------------
// Pipeline Factory
// ---------------------------------------------------------------------------

export interface MessagingPipeline {
  /**
   * Send a clinical message generated from InjectaVox data.
   *
   * Full pipeline:
   * 1. Generate structured message from InjectaVox data
   * 2. Run optional refinement pass
   * 3. Verify consent with neuron's consent broker
   * 4. Sign message with Ed25519 private key
   * 5. Send via WebSocket transport
   * 6. Log to audit trail with correlation ID
   */
  send(data: InjectaVoxData): Promise<MessageSendResult>;

  /**
   * Send a pre-built clinical message (skips generation).
   * Still runs refinement, consent, signing, transport, and audit.
   */
  sendMessage(
    message: ClinicalMessage,
    patientAgentId: string,
  ): Promise<MessageSendResult>;
}

export function createMessagingPipeline(config: MessagingPipelineConfig): MessagingPipeline {
  return {
    async send(data: InjectaVoxData): Promise<MessageSendResult> {
      const correlationId = randomUUID();
      const messageId = randomUUID();
      const traceId = config.audit.createTraceId();

      // Step 1: Generate message
      let message: ClinicalMessage;
      try {
        message = generateMessage(data);
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        config.audit.log({
          action: 'message_generation_failed',
          actor: 'system',
          outcome: 'error',
          trace_id: traceId,
          details: {
            correlation_id: correlationId,
            message_id: messageId,
            patient_agent_id: data.patient_agent_id,
            data_type: data.data_type,
            error,
          },
        });
        return {
          success: false,
          message_id: messageId,
          correlation_id: correlationId,
          error: `Message generation failed: ${error}`,
          error_code: 'GENERATION_ERROR',
        };
      }

      return this.sendMessage(message, data.patient_agent_id);
    },

    async sendMessage(
      message: ClinicalMessage,
      patientAgentId: string,
    ): Promise<MessageSendResult> {
      const correlationId = randomUUID();
      const messageId = randomUUID();
      const traceId = config.audit.createTraceId();

      // Step 2: Refinement pass
      let refined = message;
      if (config.refine) {
        try {
          refined = config.refine(message);
          // Validate refined message still matches schema
          if (!Value.Check(ClinicalMessageSchema, refined)) {
            config.audit.log({
              action: 'message_refinement_failed',
              actor: 'system',
              outcome: 'error',
              trace_id: traceId,
              details: {
                correlation_id: correlationId,
                message_id: messageId,
                reason: 'Refined message failed schema validation',
              },
            });
            return {
              success: false,
              message_id: messageId,
              correlation_id: correlationId,
              error: 'Refined message failed schema validation',
              error_code: 'REFINEMENT_ERROR',
            };
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          config.audit.log({
            action: 'message_refinement_failed',
            actor: 'system',
            outcome: 'error',
            trace_id: traceId,
            details: {
              correlation_id: correlationId,
              message_id: messageId,
              error,
            },
          });
          return {
            success: false,
            message_id: messageId,
            correlation_id: correlationId,
            error: `Refinement failed: ${error}`,
            error_code: 'REFINEMENT_ERROR',
          };
        }
      }

      config.audit.log({
        action: 'message_generated',
        actor: 'agent',
        outcome: 'allowed',
        trace_id: traceId,
        details: {
          correlation_id: correlationId,
          message_id: messageId,
          patient_agent_id: patientAgentId,
          message_type: refined.type,
          refined: config.refine !== undefined,
        },
      });

      // Step 3: Consent verification
      const consentConfig: ConsentCheckConfig = {
        neuronEndpoint: config.neuronEndpoint,
        providerPublicKey: config.providerPublicKey,
      };

      let consentResult;
      try {
        consentResult = await verifyConsent(consentConfig, patientAgentId);
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        config.audit.log({
          action: 'message_consent_check',
          actor: 'system',
          outcome: 'error',
          trace_id: traceId,
          details: {
            correlation_id: correlationId,
            message_id: messageId,
            patient_agent_id: patientAgentId,
            error,
          },
        });
        return {
          success: false,
          message_id: messageId,
          correlation_id: correlationId,
          error: `Consent check failed: ${error}`,
          error_code: 'CONSENT_CHECK_FAILED',
        };
      }

      if (!consentResult.allowed) {
        config.audit.log({
          action: 'message_consent_denied',
          actor: 'system',
          outcome: 'denied',
          trace_id: traceId,
          details: {
            correlation_id: correlationId,
            message_id: messageId,
            patient_agent_id: patientAgentId,
            error_code: consentResult.error_code,
            relationship_id: consentResult.relationship_id,
          },
        });
        return {
          success: false,
          message_id: messageId,
          correlation_id: correlationId,
          error: consentResult.error || 'Consent denied',
          error_code: consentResult.error_code === 'CONSENT_DENIED' ||
                      consentResult.error_code === 'CONSENT_EXPIRED'
            ? 'CONSENT_DENIED'
            : 'CONSENT_CHECK_FAILED',
        };
      }

      config.audit.log({
        action: 'message_consent_verified',
        actor: 'system',
        outcome: 'allowed',
        trace_id: traceId,
        details: {
          correlation_id: correlationId,
          message_id: messageId,
          patient_agent_id: patientAgentId,
          relationship_id: consentResult.relationship_id,
        },
      });

      // Step 4: Sign message
      let envelope: SignedMessageEnvelope;
      try {
        const signature = signMessage(refined, config.providerPrivateKey);

        envelope = {
          version: '1',
          message_id: messageId,
          correlation_id: correlationId,
          timestamp: new Date().toISOString(),
          sender_public_key: config.providerPublicKey,
          patient_agent_id: patientAgentId,
          payload: refined,
          signature,
        };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        config.audit.log({
          action: 'message_signing_failed',
          actor: 'system',
          outcome: 'error',
          trace_id: traceId,
          details: {
            correlation_id: correlationId,
            message_id: messageId,
            error,
          },
        });
        return {
          success: false,
          message_id: messageId,
          correlation_id: correlationId,
          error: `Signing failed: ${error}`,
          error_code: 'SIGNING_ERROR',
        };
      }

      // Step 5: Send via WebSocket transport (with retry)
      const transportConfig: TransportConfig = {
        patientEndpoint: config.patientEndpoint,
      };

      const transportResult = await transportSend(transportConfig, envelope);

      if (!transportResult.success) {
        config.audit.log({
          action: 'message_send_failed',
          actor: 'system',
          outcome: 'error',
          trace_id: traceId,
          details: {
            correlation_id: correlationId,
            message_id: messageId,
            patient_agent_id: patientAgentId,
            attempts: transportResult.attempts,
            error: transportResult.error,
            error_code: transportResult.error_code,
          },
        });
        return {
          success: false,
          message_id: messageId,
          correlation_id: correlationId,
          error: transportResult.error,
          error_code: transportResult.error_code === 'PATIENT_UNREACHABLE'
            ? 'PATIENT_UNREACHABLE'
            : transportResult.error_code === 'MAX_RETRIES_EXCEEDED'
            ? 'MAX_RETRIES_EXCEEDED'
            : 'WEBSOCKET_ERROR',
          attempts: transportResult.attempts,
        };
      }

      // Step 6: Audit log success
      config.audit.log({
        action: 'message_sent',
        actor: 'agent',
        outcome: 'allowed',
        trace_id: traceId,
        details: {
          correlation_id: correlationId,
          message_id: messageId,
          patient_agent_id: patientAgentId,
          message_type: refined.type,
          attempts: transportResult.attempts,
          relationship_id: consentResult.relationship_id,
        },
      });

      return {
        success: true,
        message_id: messageId,
        correlation_id: correlationId,
        attempts: transportResult.attempts,
      };
    },
  };
}
