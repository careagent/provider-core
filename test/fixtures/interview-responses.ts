/**
 * Pre-canned interview response sequences for testing.
 * Each entry maps to an interview question in order.
 *
 * NOTE: Tests run without AXON_URL, so:
 * - NPI lookups return null → manual name entry
 * - Org NPI lookups return null → manual org name entry
 * - Credentials stage asks for degrees/licenses/certifications directly
 * - Specialty stage asks for specialties/subspecialties directly
 * - Scope stage falls back to manual permitted_actions
 */

// Complete interview with ALL questions answered
export const completeInterviewResponses: string[] = [
  // Welcome: acknowledge HIPAA warning
  'y',
  // Identity: provider type select (0 = Physician)
  '0',
  // Identity: NPI (required for Physician — 10 digits)
  '1234567890',
  // Identity: name (manual — NPI lookup returns null without AXON_URL)
  'Dr. Test Provider',
  // Identity: organization NPI (required — 10 digits, lookup returns null without AXON_URL)
  '9876543210',
  // Identity: organization name (manual — org NPI lookup returns null)
  'University Medical Center',
  // Credentials: do you practice in any other roles? (n — keep Physician from identity)
  'n',
  // Credentials: degrees (no AXON_URL → asked here)
  'MD',
  // Credentials: licenses (no AXON_URL → asked here)
  'MD-TX-A12345',
  // Credentials: certifications (no AXON_URL → asked here)
  'ABNS Board Certified',
  // Specialty: specialties (no AXON_URL → asked here, comma-separated)
  'Neurosurgery',
  // Specialty: subspecialties (no AXON_URL → asked here)
  'Spine',
  // (credential_status removed — set automatically to 'pending', verified by background process)
  // Scope: permitted actions (comma-separated, fallback without AXON_URL)
  'chart_operative_note, chart_progress_note, chart_h_and_p',
  // Philosophy: clinical philosophy
  'Evidence-based neurosurgical practice with emphasis on minimally invasive techniques and shared decision-making with patients.',
  // Voice: chart directive (optional)
  'formal, structured templates',
  // Voice: educate directive (optional)
  '',
  // Voice: interpret / documenting results (optional)
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
  // Identity: NPI (required for Physician)
  '0000000000',
  // Identity: name (manual — NPI lookup returns null without AXON_URL)
  'Dr. Minimal Provider',
  // Identity: organization NPI (required — lookup returns null)
  '1111111111',
  // Identity: organization name (manual — org NPI lookup returns null)
  'Community Clinic',
  // Credentials: do you practice in any other roles? (n)
  'n',
  // Credentials: degrees (no AXON_URL → asked here, skip)
  '',
  // Credentials: licenses (no AXON_URL → asked here, skip)
  '',
  // Credentials: certifications (no AXON_URL → asked here, skip)
  '',
  // Specialty: specialties (no AXON_URL → asked here, skip)
  '',
  // Specialty: subspecialties (no AXON_URL → asked here, skip)
  '',
  // (credential_status removed — set automatically to 'pending', verified by background process)
  // Scope: permitted actions (fallback without AXON_URL)
  'chart_progress_note',
  // Philosophy: clinical philosophy
  'Patient-centered care with focus on preventive medicine and chronic disease management.',
  // Voice: chart (optional — skip)
  '',
  // Voice: educate (optional — skip)
  '',
  // Voice: interpret / documenting results (optional — skip)
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
