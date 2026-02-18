/**
 * Pre-canned interview response sequences for testing.
 * Each entry maps to an interview question in order.
 */

// Complete interview with ALL questions answered
export const completeInterviewResponses: string[] = [
  // Welcome: acknowledge HIPAA warning
  'y',
  // Identity: name
  'Dr. Test Provider',
  // Identity: NPI (optional)
  '1234567890',
  // Credentials: license type (0 = MD)
  '0',
  // Credentials: state
  'TX',
  // Credentials: license number
  'A12345',
  // Specialty: primary specialty
  'Neurosurgery',
  // Specialty: subspecialty (optional)
  'Spine',
  // Specialty: institution (optional)
  'University Medical Center',
  // Specialty: privileges (comma-separated)
  'neurosurgical procedures, spine surgery',
  // Specialty: credential status (0 = active)
  '0',
  // Scope: permitted actions (comma-separated)
  'chart_operative_note, chart_progress_note, chart_h_and_p',
  // Scope: prohibited actions (optional)
  'prescribe_controlled_substances',
  // Scope: institutional limitations (optional)
  'no_pediatric_cases',
  // Philosophy: clinical philosophy
  'Evidence-based neurosurgical practice with emphasis on minimally invasive techniques and shared decision-making with patients.',
  // Voice: tone (optional)
  'formal',
  // Voice: documentation style (0 = concise)
  '0',
  // Voice: eponyms
  'y',
  // Voice: abbreviation style (0 = standard)
  '0',
  // Autonomy: chart tier (0 = autonomous)
  '0',
  // Autonomy: order tier (1 = supervised)
  '1',
  // Autonomy: charge tier (1 = supervised)
  '1',
  // Autonomy: perform tier (2 = manual)
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
  // Identity: name
  'Dr. Minimal Provider',
  // Identity: NPI (optional — skip)
  '',
  // Credentials: license type (1 = DO)
  '1',
  // Credentials: state
  'CA',
  // Credentials: license number
  'B99999',
  // Specialty: primary specialty
  'Internal Medicine',
  // Specialty: subspecialty (optional — skip)
  '',
  // Specialty: institution (optional — skip)
  '',
  // Specialty: privileges
  'general medical care',
  // Specialty: credential status (0 = active)
  '0',
  // Scope: permitted actions
  'chart_progress_note',
  // Scope: prohibited actions (optional — skip)
  '',
  // Scope: institutional limitations (optional — skip)
  '',
  // Philosophy: clinical philosophy
  'Patient-centered care with focus on preventive medicine and chronic disease management.',
  // Voice: tone (optional — skip)
  '',
  // Voice: documentation style (1 = narrative)
  '1',
  // Voice: eponyms
  'n',
  // Voice: abbreviation style (1 = minimal)
  '1',
  // Autonomy: chart (0 = autonomous)
  '0',
  // Autonomy: order (1 = supervised)
  '1',
  // Autonomy: charge (1 = supervised)
  '1',
  // Autonomy: perform (2 = manual)
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
