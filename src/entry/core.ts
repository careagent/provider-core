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

// Hardening (implementation — Phase 3)
export type { HardeningEngine, HardeningLayerResult, HardeningConfig, HardeningLayerFn } from '../hardening/index.js';
export { createHardeningEngine } from '../hardening/index.js';
export { checkToolPolicy } from '../hardening/index.js';
export { checkExecAllowlist } from '../hardening/index.js';
export { checkCansInjection, extractProtocolRules, injectProtocol } from '../hardening/index.js';
export { checkDockerSandbox, detectDocker } from '../hardening/index.js';
export { setupCanary } from '../hardening/index.js';
export type { CanaryHandle } from '../hardening/canary.js';

// Credentials (implementation — Phase 4)
export type { CredentialValidator, CredentialCheckResult } from '../credentials/index.js';
export { createCredentialValidator } from '../credentials/index.js';

// Skills (implementation — Phase 4)
export type { SkillManifest, SkillLoadResult, ChartTemplate, TemplateSection, VoiceDirectives } from '../skills/index.js';
export { SkillManifestSchema, validateManifest } from '../skills/index.js';
export { computeSkillFileHash, computeSkillChecksums, verifySkillIntegrity } from '../skills/index.js';
export { checkVersionPin, approveVersion } from '../skills/index.js';
export { loadClinicalSkills } from '../skills/index.js';
export { getTemplate, getAllTemplates, CHART_SKILL_ID, buildChartSkillInstructions } from '../skills/index.js';
export { extractVoiceDirectives, buildVoiceInstructions } from '../skills/index.js';

// Refinement (implementation — Phase 5)
export type { RefinementEngine, Observation, Proposal, DivergencePattern, ObservationCategory, ProposalResolution } from '../refinement/index.js';
export { createRefinementEngine, DEFAULT_DIVERGENCE_THRESHOLD, RESURFACE_THRESHOLD, SACROSANCT_FIELDS, isScopeField } from '../refinement/index.js';
export { ObservationStore } from '../refinement/index.js';
export { ProposalQueue } from '../refinement/index.js';
export { detectDivergences } from '../refinement/index.js';
export { generateDiffView } from '../refinement/index.js';

// Neuron (implementation — Session 07a)
export type {
  NeuronClient,
  NeuronRegistration,
  NeuronRegisterConfig,
  NeuronRegisterResult,
  NeuronHeartbeatResult,
  NeuronCredential,
  NeuronClientErrorCode,
  NeuronClientConfig,
} from '../neuron/index.js';
export { NeuronClientError, createNeuronClient } from '../neuron/index.js';

// NPI validation
export { validateNPI } from '../credentials/npi-validator.js';
export type { NPIValidationResult } from '../credentials/npi-validator.js';

// Ed25519 identity
export { generateProviderKeyPair } from '../credentials/identity.js';
export type { ProviderKeyPair } from '../credentials/identity.js';

// Provider profile
export { loadProviderProfile, saveProviderProfile, ProviderProfileSchema } from '../credentials/profile.js';
export type { ProviderProfile } from '../credentials/profile.js';

// Registration orchestrator (Session 07a)
export { registerProvider } from '../registration/index.js';
export type { RegistrationConfig, RegistrationResult, RegistrationErrorCode } from '../registration/index.js';

// Protocol (interface-only — implementation in Phase 5)
export type { ProtocolServer, ProtocolSession } from '../protocol/index.js';
export { createProtocolServer } from '../protocol/index.js';

// Messaging (Session 07b)
export {
  InjectaVoxDataSchema,
  ClinicalSummarySchema,
  AppointmentReminderSchema,
  CarePlanUpdateSchema,
  ClinicalMessageSchema,
  SignedMessageEnvelopeSchema,
  MessageSendResultSchema,
  generateMessage,
  signMessage,
  canonicalize,
  verifyConsent,
  createMessagingPipeline,
} from '../messaging/index.js';
export type {
  InjectaVoxData,
  ClinicalSummary,
  AppointmentReminder,
  CarePlanUpdate,
  ClinicalMessage,
  SignedMessageEnvelope,
  MessageSendResult,
  ConsentCheckConfig,
  ConsentCheckResult,
  TransportConfig,
  TransportResult,
  MessagingPipelineConfig,
  MessagingPipeline,
} from '../messaging/index.js';

// CANS schema extensions
export type {
  Organization,
  Voice,
  Skills,
  CrossInstallationConsent,
} from '../activation/cans-schema.js';

// Axon client (implementation — Phase 9)
export { createAxonClient, AxonClientError } from '../axon/index.js';
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
} from '../axon/index.js';
