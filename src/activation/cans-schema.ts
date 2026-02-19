/**
 * CANS.md TypeBox schema — the complete schema for Clinical Activation
 * and Notification System frontmatter.
 *
 * Covers:
 * - CANS-02: Provider identity (name, NPI, license, specialty, institution)
 * - CANS-03: Scope of practice (permitted/prohibited actions, limitations)
 * - CANS-04: Autonomy tiers (chart, order, charge, perform)
 * - CANS-05: Hardening flags and consent configuration
 *
 * All sub-schemas are exported individually for use by validation,
 * onboarding, and hardening subsystems.
 */

import { Type, type Static } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// CANS-02: Provider License
// ---------------------------------------------------------------------------

export const ProviderLicenseSchema = Type.Object({
  type: Type.Union([
    Type.Literal('MD'),
    Type.Literal('DO'),
    Type.Literal('NP'),
    Type.Literal('PA'),
    Type.Literal('CRNA'),
    Type.Literal('CNM'),
    Type.Literal('PhD'),
    Type.Literal('PsyD'),
  ]),
  state: Type.String({
    minLength: 2,
    maxLength: 2,
    description: 'US state abbreviation',
  }),
  number: Type.String({
    minLength: 1,
    description: 'License number',
  }),
  verified: Type.Boolean({
    description: 'Always false in dev — future Axon verification',
  }),
});

export type ProviderLicense = Static<typeof ProviderLicenseSchema>;

// ---------------------------------------------------------------------------
// CANS-02: Provider Identity
// ---------------------------------------------------------------------------

export const ProviderSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  npi: Type.Optional(
    Type.String({
      pattern: '^[0-9]{10}$',
      description: 'National Provider Identifier',
    }),
  ),
  license: ProviderLicenseSchema,
  specialty: Type.String({ minLength: 1 }),
  subspecialty: Type.Optional(Type.String()),
  institution: Type.Optional(Type.String()),
  privileges: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    description: 'Institutional privileges',
  }),
  credential_status: Type.Optional(
    Type.Union([
      Type.Literal('active'),
      Type.Literal('pending'),
      Type.Literal('expired'),
    ]),
  ),
});

export type Provider = Static<typeof ProviderSchema>;

// ---------------------------------------------------------------------------
// CANS-03: Scope of Practice
// ---------------------------------------------------------------------------

export const ScopeSchema = Type.Object({
  permitted_actions: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
  }),
  prohibited_actions: Type.Optional(Type.Array(Type.String())),
  institutional_limitations: Type.Optional(Type.Array(Type.String())),
});

export type Scope = Static<typeof ScopeSchema>;

// ---------------------------------------------------------------------------
// CANS-04: Autonomy Tiers
// ---------------------------------------------------------------------------

export const AutonomyTier = Type.Union([
  Type.Literal('autonomous'),
  Type.Literal('supervised'),
  Type.Literal('manual'),
]);

export type AutonomyTierType = Static<typeof AutonomyTier>;

export const AutonomySchema = Type.Object({
  chart: AutonomyTier,
  order: AutonomyTier,
  charge: AutonomyTier,
  perform: AutonomyTier,
});

export type Autonomy = Static<typeof AutonomySchema>;

// ---------------------------------------------------------------------------
// CANS-05: Hardening Flags
// ---------------------------------------------------------------------------

export const HardeningSchema = Type.Object({
  tool_policy_lockdown: Type.Boolean(),
  exec_approval: Type.Boolean(),
  cans_protocol_injection: Type.Boolean(),
  docker_sandbox: Type.Boolean(),
  safety_guard: Type.Boolean(),
  audit_trail: Type.Boolean(),
});

export type Hardening = Static<typeof HardeningSchema>;

// ---------------------------------------------------------------------------
// CANS-05: Consent Configuration
// ---------------------------------------------------------------------------

export const ConsentSchema = Type.Object({
  hipaa_warning_acknowledged: Type.Boolean(),
  synthetic_data_only: Type.Boolean(),
  audit_consent: Type.Boolean(),
});

export type Consent = Static<typeof ConsentSchema>;

// ---------------------------------------------------------------------------
// Clinical Voice (optional — populated during onboarding)
// ---------------------------------------------------------------------------

export const ClinicalVoiceSchema = Type.Object({
  tone: Type.Optional(Type.String()),
  documentation_style: Type.Optional(Type.String()),
  eponyms: Type.Optional(Type.Boolean()),
  abbreviations: Type.Optional(Type.String()),
});

export type ClinicalVoice = Static<typeof ClinicalVoiceSchema>;

// ---------------------------------------------------------------------------
// Neuron Registration (optional — ecosystem readiness)
// ---------------------------------------------------------------------------

export const NeuronConfigSchema = Type.Object({
  endpoint: Type.String({ description: 'Neuron server URL' }),
  registration_id: Type.Optional(Type.String({ description: 'Registration ID assigned by Neuron' })),
  auto_register: Type.Optional(Type.Boolean({ description: 'Register on Gateway startup' })),
});

export type NeuronConfig = Static<typeof NeuronConfigSchema>;

// ---------------------------------------------------------------------------
// Clinical Skill Gating (optional — ecosystem readiness)
// ---------------------------------------------------------------------------

export const SkillGatingRuleSchema = Type.Object({
  skill_id: Type.String({ description: 'Skill package identifier' }),
  requires_license: Type.Optional(Type.Array(Type.String())),
  requires_specialty: Type.Optional(Type.Array(Type.String())),
  requires_privilege: Type.Optional(Type.Array(Type.String())),
});

export type SkillGatingRule = Static<typeof SkillGatingRuleSchema>;

export const SkillGatingSchema = Type.Object({
  rules: Type.Array(SkillGatingRuleSchema, { description: 'Per-skill credential requirements' }),
});

export type SkillGating = Static<typeof SkillGatingSchema>;

// ---------------------------------------------------------------------------
// Cross-Installation Consent (optional — ecosystem readiness)
// ---------------------------------------------------------------------------

export const CrossInstallationConsentSchema = Type.Object({
  allow_inbound: Type.Boolean({ description: 'Accept patient CareAgent connections' }),
  allow_outbound: Type.Boolean({ description: 'Initiate connections to patient CareAgents' }),
  require_neuron_verification: Type.Optional(Type.Boolean({ description: 'Require Neuron-verified identity' })),
});

export type CrossInstallationConsent = Static<typeof CrossInstallationConsentSchema>;

// ---------------------------------------------------------------------------
// Complete CANS Document Schema
// ---------------------------------------------------------------------------

export const CANSSchema = Type.Object({
  version: Type.String({ description: 'CANS.md schema version' }),
  provider: ProviderSchema,
  scope: ScopeSchema,
  autonomy: AutonomySchema,
  hardening: HardeningSchema,
  consent: ConsentSchema,
  clinical_voice: Type.Optional(ClinicalVoiceSchema),
  neuron: Type.Optional(NeuronConfigSchema),
  skills: Type.Optional(SkillGatingSchema),
  cross_installation: Type.Optional(CrossInstallationConsentSchema),
});

export type CANSDocument = Static<typeof CANSSchema>;
