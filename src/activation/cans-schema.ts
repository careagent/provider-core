/**
 * CANS.md TypeBox schema — the complete schema for Clinical Activation
 * and Notification System frontmatter.
 *
 * v2.0 — Generalized for 49 clinical healthcare worker categories.
 *
 * Covers:
 * - CANS-02: Provider identity (name, NPI, types, degrees, licenses,
 *            certifications, organizations)
 * - CANS-03: Scope of practice (whitelist-only permitted actions)
 * - CANS-04: Autonomy tiers (7 atomic actions)
 * - CANS-05: Consent configuration with attestation timestamp
 * - Voice: 7 atomic-action-mapped voice directives
 * - Skills: Flat authorized skill list
 *
 * Hardening is deterministic (always on, hardcoded in plugin) — not in CANS.
 * Neuron config lives per-organization inside provider.organizations.
 *
 * All sub-schemas are exported individually for use by validation,
 * onboarding, and hardening subsystems.
 */

import { Type, type Static } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// CANS-02: Organization (per-org privileges and neuron config)
// ---------------------------------------------------------------------------

export const OrganizationSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  department: Type.Optional(Type.String()),
  privileges: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  neuron_endpoint: Type.Optional(Type.String({ description: 'Neuron server URL' })),
  neuron_registration_id: Type.Optional(Type.String()),
  primary: Type.Optional(Type.Boolean()),
});

export type Organization = Static<typeof OrganizationSchema>;

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
  types: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  degrees: Type.Array(Type.String({ minLength: 1 })),
  licenses: Type.Array(Type.String({ minLength: 1 })),
  certifications: Type.Array(Type.String({ minLength: 1 })),
  specialty: Type.Optional(Type.String()),
  subspecialty: Type.Optional(Type.String()),
  specialties: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  subspecialties: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  organizations: Type.Array(OrganizationSchema, { minItems: 1 }),
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
// CANS-03: Scope of Practice (whitelist-only)
// ---------------------------------------------------------------------------

export const ScopeSchema = Type.Object({
  permitted_actions: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
  }),
});

export type Scope = Static<typeof ScopeSchema>;

// ---------------------------------------------------------------------------
// CANS-04: Autonomy Tiers (7 atomic actions)
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
  interpret: AutonomyTier,
  educate: AutonomyTier,
  coordinate: AutonomyTier,
});

export type Autonomy = Static<typeof AutonomySchema>;

// ---------------------------------------------------------------------------
// Voice (7 atomic-action-mapped voice directives)
// ---------------------------------------------------------------------------

export const VoiceSchema = Type.Object({
  chart: Type.Optional(Type.String()),
  order: Type.Optional(Type.String()),
  charge: Type.Optional(Type.String()),
  perform: Type.Optional(Type.String()),
  interpret: Type.Optional(Type.String()),
  educate: Type.Optional(Type.String()),
  coordinate: Type.Optional(Type.String()),
});

export type Voice = Static<typeof VoiceSchema>;

// ---------------------------------------------------------------------------
// CANS-05: Consent Configuration
// ---------------------------------------------------------------------------

export const ConsentSchema = Type.Object({
  hipaa_warning_acknowledged: Type.Boolean(),
  synthetic_data_only: Type.Boolean(),
  audit_consent: Type.Boolean(),
  acknowledged_at: Type.String({ description: 'ISO 8601 timestamp of consent' }),
});

export type Consent = Static<typeof ConsentSchema>;

// ---------------------------------------------------------------------------
// Skills (flat authorized skill list)
// ---------------------------------------------------------------------------

export const SkillsSchema = Type.Object({
  authorized: Type.Array(Type.String({ minLength: 1 })),
});

export type Skills = Static<typeof SkillsSchema>;

// ---------------------------------------------------------------------------
// Cross-Installation Consent (optional — ecosystem readiness)
// ---------------------------------------------------------------------------

export const CrossInstallationConsentSchema = Type.Object({
  allow_inbound: Type.Boolean({ description: 'Accept patient CareAgent connections' }),
  allow_outbound: Type.Boolean({ description: 'Initiate connections to patient CareAgents' }),
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
  voice: Type.Optional(VoiceSchema),
  consent: ConsentSchema,
  skills: SkillsSchema,
  cross_installation: Type.Optional(CrossInstallationConsentSchema),
});

export type CANSDocument = Static<typeof CANSSchema>;
