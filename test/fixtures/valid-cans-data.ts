/**
 * Valid CANS document fixture for reuse across tests.
 *
 * Represents a neurosurgeon at a university medical center with
 * spine subspecialty, standard consent, and synthetic-data-only.
 */
export const validCANSData = {
  version: '2.0',
  provider: {
    name: 'Dr. Test Provider',
    npi: '1234567890',
    types: ['Physician'],
    degrees: ['MD'],
    licenses: ['MD-TX-A12345'],
    certifications: ['ABNS Board Certified'],
    specialty: 'Neurosurgery',
    subspecialty: 'Spine',
    organizations: [
      {
        name: 'University Medical Center',
        privileges: ['neurosurgical procedures', 'spine surgery'],
        primary: true,
      },
    ],
    credential_status: 'active' as const,
  },
  scope: {
    permitted_actions: ['chart_operative_note', 'chart_progress_note', 'chart_h_and_p'],
  },
  autonomy: {
    chart: 'autonomous' as const,
    order: 'supervised' as const,
    charge: 'supervised' as const,
    perform: 'manual' as const,
    interpret: 'manual' as const,
    educate: 'manual' as const,
    coordinate: 'manual' as const,
  },
  consent: {
    hipaa_warning_acknowledged: true,
    synthetic_data_only: true,
    audit_consent: true,
    acknowledged_at: '2026-02-21T00:00:00.000Z',
  },
  skills: {
    authorized: [],
  },
};
