/**
 * Core entry point — pure re-exports of the CareAgent public API.
 *
 * Use this when you need access to CareAgent types, schemas, and classes
 * without triggering any platform-specific registration or activation.
 */

// Adapter types
export type {
  PlatformAdapter,
  CareAgentPluginAPI,
  ToolCallEvent,
  ToolCallResult,
  ToolCallHandler,
  BootstrapContext,
  BootstrapHandler,
  CliCommandConfig,
  ServiceConfig,
  SlashCommandConfig,
} from '../adapters/types.js';

// Platform detection
export { detectPlatform } from '../adapters/detect.js';
export type { DetectedPlatform } from '../adapters/detect.js';

// Activation
export { ActivationGate } from '../activation/gate.js';
export type { ActivationResult, AuditCallback } from '../activation/gate.js';
export { CANSSchema } from '../activation/cans-schema.js';
export type { CANSDocument } from '../activation/cans-schema.js';

// Audit
export { AuditPipeline } from '../audit/pipeline.js';

// Workspace profiles
export { getWorkspaceProfile } from '../onboarding/workspace-profiles.js';
export type { WorkspaceProfile, WorkspaceFileSpec } from '../onboarding/workspace-profiles.js';

// Hardening (interface-only — implementation in Phase 3)
export type { HardeningEngine, HardeningLayerResult, HardeningConfig, HardeningLayerFn } from '../hardening/index.js';
export { createHardeningEngine } from '../hardening/index.js';

// Credentials (interface-only — implementation in Phase 4)
export type { CredentialValidator, CredentialCheckResult } from '../credentials/index.js';
export { createCredentialValidator } from '../credentials/index.js';

// Neuron (interface-only — implementation in Phase 5)
export type { NeuronClient, NeuronRegistration } from '../neuron/index.js';
export { createNeuronClient } from '../neuron/index.js';

// Protocol (interface-only — implementation in Phase 5)
export type { ProtocolServer, ProtocolSession } from '../protocol/index.js';
export { createProtocolServer } from '../protocol/index.js';

// CANS schema extensions
export type {
  NeuronConfig,
  SkillGatingRule,
  SkillGating,
  CrossInstallationConsent,
} from '../activation/cans-schema.js';
