/**
 * Valid CANS document fixture for reuse across tests.
 *
 * Represents a neurosurgeon at a university medical center with
 * spine subspecialty, standard hardening flags, and synthetic-data-only consent.
 */
export const validCANSData = {
  version: '1.0',
  provider: {
    name: 'Dr. Test Provider',
    npi: '1234567890',
    license: { type: 'MD' as const, state: 'TX', number: 'A12345', verified: false },
    specialty: 'Neurosurgery',
    subspecialty: 'Spine',
    institution: 'University Medical Center',
    privileges: ['neurosurgical procedures', 'spine surgery'],
    credential_status: 'active' as const,
  },
  scope: {
    permitted_actions: ['chart_operative_note', 'chart_progress_note', 'chart_h_and_p'],
    prohibited_actions: ['prescribe_controlled_substances'],
    institutional_limitations: ['no_pediatric_cases'],
  },
  autonomy: {
    chart: 'autonomous' as const,
    order: 'supervised' as const,
    charge: 'supervised' as const,
    perform: 'manual' as const,
  },
  hardening: {
    tool_policy_lockdown: true,
    exec_approval: true,
    cans_protocol_injection: true,
    docker_sandbox: false,
    safety_guard: true,
    audit_trail: true,
  },
  consent: {
    hipaa_warning_acknowledged: true,
    synthetic_data_only: true,
    audit_consent: true,
  },
};
