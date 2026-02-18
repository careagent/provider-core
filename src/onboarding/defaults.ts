/**
 * Default values for CANS document fields populated during onboarding.
 * These are applied as final overrides — providers cannot opt out of hardening
 * or partially complete consent.
 */

import type { Hardening, Consent, Autonomy } from '../activation/cans-schema.js';

export const defaultHardening: Hardening = {
  tool_policy_lockdown: true,
  exec_approval: true,
  cans_protocol_injection: true,
  docker_sandbox: true,
  safety_guard: true,
  audit_trail: true,
};

export const defaultConsent: Consent = {
  hipaa_warning_acknowledged: false,
  synthetic_data_only: false,
  audit_consent: false,
};

export const defaultAutonomy: Autonomy = {
  chart: 'autonomous' as const,
  order: 'supervised' as const,
  charge: 'supervised' as const,
  perform: 'manual' as const,
};
