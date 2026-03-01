/**
 * Pre-canned interview response sequences for testing.
 * Each entry maps to an interview question in order.
 */

// Complete interview with ALL questions answered
export const completeInterviewResponses: string[] = [
  // Welcome: acknowledge HIPAA warning
  'y',
  // Identity: provider type select (0 = Physician)
  '0',
  // Identity: NPI (optional — 10 digits)
  '1234567890',
  // Identity: name (manual — NPI lookup returns null without AXON_URL)
  'Dr. Test Provider',
  // Credentials: add additional provider types? (n — keep Physician from identity)
  'n',
  // Credentials: degrees (optional, comma-separated)
  'MD',
  // Credentials: licenses (optional, comma-separated)
  'MD-TX-A12345',
  // Credentials: certifications (optional, comma-separated)
  'ABNS Board Certified',
  // Specialty: primary specialty (optional)
  'Neurosurgery',
  // Specialty: subspecialty (optional)
  'Spine',
  // Specialty: organization name
  'University Medical Center',
  // Specialty: department (optional)
  '',
  // Specialty: privileges (optional, comma-separated)
  'neurosurgical procedures, spine surgery',
  // Specialty: credential status (0 = active)
  '0',
  // Scope: permitted actions (comma-separated)
  'chart_operative_note, chart_progress_note, chart_h_and_p',
  // Philosophy: clinical philosophy
  'Evidence-based neurosurgical practice with emphasis on minimally invasive techniques and shared decision-making with patients.',
  // Voice: chart directive (optional)
  'formal, structured templates',
  // Voice: order directive (optional)
  'concise',
  // Voice: charge directive (optional)
  '',
  // Voice: perform directive (optional)
  '',
  // Voice: interpret directive (optional)
  '',
  // Voice: educate directive (optional)
  '',
  // Voice: coordinate directive (optional)
  '',
  // Autonomy: chart tier (0 = autonomous)
  '0',
  // Autonomy: order tier (1 = supervised)
  '1',
  // Autonomy: charge tier (1 = supervised)
  '1',
  // Autonomy: perform tier (2 = manual)
  '2',
  // Autonomy: interpret tier (2 = manual)
  '2',
  // Autonomy: educate tier (2 = manual)
  '2',
  // Autonomy: coordinate tier (2 = manual)
  '2',
  // Consent: HIPAA warning acknowledgment
  'y',
  // Consent: synthetic data only
  'y',
  // Consent: audit consent
  'y',
  // Review: approve (0 = approve and save)
  '0',
];

// Minimal interview — skips all optional fields
export const minimalInterviewResponses: string[] = [
  // Welcome: acknowledge HIPAA warning
  'y',
  // Identity: provider type select (0 = Physician)
  '0',
  // Identity: NPI (optional — skip)
  '',
  // Identity: name (manual entry)
  'Dr. Minimal Provider',
  // Credentials: add additional provider types? (n — keep Physician from identity)
  'n',
  // Credentials: degrees (optional — skip)
  '',
  // Credentials: licenses (optional — skip)
  '',
  // Credentials: certifications (optional — skip)
  '',
  // Specialty: primary specialty (optional — skip)
  '',
  // Specialty: subspecialty (optional — skip)
  '',
  // Specialty: organization name
  'Community Clinic',
  // Specialty: department (optional — skip)
  '',
  // Specialty: privileges (optional — skip)
  '',
  // Specialty: credential status (0 = active)
  '0',
  // Scope: permitted actions
  'chart_progress_note',
  // Philosophy: clinical philosophy
  'Patient-centered care with focus on preventive medicine and chronic disease management.',
  // Voice: chart (optional — skip)
  '',
  // Voice: order (optional — skip)
  '',
  // Voice: charge (optional — skip)
  '',
  // Voice: perform (optional — skip)
  '',
  // Voice: interpret (optional — skip)
  '',
  // Voice: educate (optional — skip)
  '',
  // Voice: coordinate (optional — skip)
  '',
  // Autonomy: chart (0 = autonomous)
  '0',
  // Autonomy: order (1 = supervised)
  '1',
  // Autonomy: charge (1 = supervised)
  '1',
  // Autonomy: perform (2 = manual)
  '2',
  // Autonomy: interpret (2 = manual)
  '2',
  // Autonomy: educate (2 = manual)
  '2',
  // Autonomy: coordinate (2 = manual)
  '2',
  // Consent: HIPAA
  'y',
  // Consent: synthetic data
  'y',
  // Consent: audit
  'y',
  // Review: approve
  '0',
];
