/**
 * Default values for CANS document fields populated during onboarding.
 *
 * Hardening is deterministic (always on, hardcoded in plugin) — not in CANS.
 */

import type { Consent, Autonomy, Voice } from '../activation/cans-schema.js';

export const defaultConsent: Consent = {
  hipaa_warning_acknowledged: false,
  synthetic_data_only: false,
  audit_consent: false,
  acknowledged_at: '',
};

export const defaultAutonomy: Autonomy = {
  chart: 'autonomous' as const,
  order: 'supervised' as const,
  charge: 'supervised' as const,
  perform: 'manual' as const,
  interpret: 'manual' as const,
  educate: 'manual' as const,
  coordinate: 'manual' as const,
};

export const defaultVoice: Voice = {};
