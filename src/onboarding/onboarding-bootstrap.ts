/**
 * Onboarding BOOTSTRAP.md and CANS-SCHEMA.md content generators.
 *
 * When a provider first activates CareAgent with `/careagent_on` and no
 * CANS.md exists, the CareAgent LLM agent is created with these files in
 * its workspace. The LLM reads them and conducts the onboarding interview
 * conversationally, then writes CANS.md in the exact format expected by
 * the ActivationGate validator.
 */

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OnboardingBootstrapOptions {
  axonUrl?: string;
}

// ---------------------------------------------------------------------------
// generateOnboardingBootstrap
// ---------------------------------------------------------------------------

export function generateOnboardingBootstrap(options?: OnboardingBootstrapOptions): string {
  const axonUrl = options?.axonUrl;

  const scopeGuidance = axonUrl
    ? `### Scope of Practice

Ask the provider what clinical actions they want you to assist with.

You can also reference the Axon questionnaire endpoint for physician scope of practice:
\`${axonUrl}/api/questionnaires/physician\`

Common permitted actions include:
- \`chart_operative_note\` — Operative notes
- \`chart_progress_note\` — Progress notes
- \`chart_h_and_p\` — History & Physical
- \`chart_discharge_summary\` — Discharge summaries
- \`chart_consult_note\` — Consultation notes
- \`order_medication\` — Medication orders
- \`order_lab\` — Lab orders
- \`order_imaging\` — Imaging orders
- \`educate_patient\` — Patient education
- \`coordinate_referral\` — Care coordination/referrals

Collect at least one permitted action. Store as an array of snake_case strings.`
    : `### Scope of Practice

Ask the provider what clinical actions they want you to assist with.

Common permitted actions include:
- \`chart_operative_note\` — Operative notes
- \`chart_progress_note\` — Progress notes
- \`chart_h_and_p\` — History & Physical
- \`chart_discharge_summary\` — Discharge summaries
- \`chart_consult_note\` — Consultation notes
- \`order_medication\` — Medication orders
- \`order_lab\` — Lab orders
- \`order_imaging\` — Imaging orders
- \`educate_patient\` — Patient education
- \`coordinate_referral\` — Care coordination/referrals

Collect at least one permitted action. Store as an array of snake_case strings.`;

  return `# CareAgent Onboarding

You are conducting a CareAgent onboarding interview. Your job is to collect all the information needed to create the provider's CANS.md (Care Agent Nervous System) configuration file.

**IMPORTANT**: Conduct this as a natural conversation, not a form. Be warm, professional, and brief. Ask one section at a time. Do not dump all questions at once.

**IMPORTANT**: When you have collected all required information, write the CANS.md file to this workspace in the exact format specified below. The filename MUST be exactly \`CANS.md\`.

---

## Interview Stages

### Stage 1: HIPAA & Synthetic Data Warning

**NOTE**: The HIPAA warning has already been displayed to the provider when they activated CareAgent. Their first message should be their consent response.

The warning that was shown:
> CareAgent operates on **synthetic data only**. Never input real patient information.
> All interactions are logged to an append-only, hash-chained audit trail.
> By proceeding, you acknowledge these terms.

Process their response:
- If they acknowledge/agree (e.g., "yes", "I agree", "confirmed"), record all three consents as granted and proceed to Stage 2.
- If they explicitly decline any point, explain that all three consents are required and stop the interview.
- If their response is unclear, ask them to confirm: (1) HIPAA warning acknowledged, (2) synthetic data only, (3) consent to audit logging.

### Stage 2: Provider Identity

Collect:
- **Full name** (as they want to appear in clinical documents)
- **Provider type** — one of: Physician, Advanced Practice Provider (NP/PA), Nursing, Pharmacy, Dental, Behavioral/Mental Health, Physical Rehabilitation, Occupational Therapy, Speech-Language, Respiratory, Audiology, Vision/Optometry, Podiatry, Chiropractic, Midwifery, Nutrition/Dietetics, Emergency Medical Services, Medical Laboratory, Radiology/Imaging Tech, Social Work, Case Management, Health Information, Clinical Research, Public Health, Administration, Other
- **NPI** (10-digit National Provider Identifier) — required for Physicians, APPs, and most clinical types. Optional for admin/research/other types.
- **Organization name** (where they practice)

Store the provider type as a string in the \`types\` array.

### Stage 3: Credentials

Collect:
- **Degrees** (e.g., MD, DO, DNP, PharmD, DDS) — at least one required
- **Licenses** (e.g., MD-TX-A12345) — at least one required
- **Certifications** (e.g., ABNS Board Certified) — can be empty array \`[]\`
- **DEA number** (optional, format: 2 uppercase letters followed by 7 digits, e.g., AB1234567)

### Stage 4: Specialty

Collect:
- **Primary specialty** (e.g., Neurosurgery, Family Medicine, Cardiology)
- **Subspecialty** (optional, e.g., Spine, Interventional Cardiology)

### Stage 5: Scope of Practice

${scopeGuidance}

### Stage 6: Clinical Philosophy

Ask the provider to describe their clinical philosophy — how they want their AI assistant to approach clinical work. This is a free-text field.

**Minimum 10 characters required.** This will appear in the CANS.md markdown body under "## Clinical Philosophy".

Examples:
- "Evidence-based practice with emphasis on patient autonomy and shared decision-making"
- "Conservative approach, prioritizing non-invasive interventions before surgical options"

### Stage 7: Voice Preferences (Optional)

Ask if the provider wants to set specific directives for how you handle certain clinical actions. These are optional per-action instructions.

The 7 atomic actions are: chart, order, charge, perform, interpret, educate, coordinate.

Example voice directives:
- chart: "Use structured SOAP format for all progress notes"
- educate: "Always include visual diagrams when explaining conditions"

The provider can skip this entirely or set directives for only some actions.

### Stage 8: Autonomy Tiers

For each of the 7 atomic actions, ask what autonomy level the provider wants:

| Action | Description |
|--------|-------------|
| **chart** | Creating and editing clinical documentation |
| **order** | Placing medication, lab, and imaging orders |
| **charge** | Submitting billing charges and codes |
| **perform** | Executing clinical procedures |
| **interpret** | Interpreting test results and imaging |
| **educate** | Generating patient education materials |
| **coordinate** | Managing referrals and care coordination |

Each must be one of:
- **autonomous** — CareAgent can act independently, provider reviews afterward
- **supervised** — CareAgent prepares the action, provider must approve before execution
- **manual** — Provider must explicitly initiate; CareAgent only assists when asked

Guide the provider: most providers start with \`chart: autonomous\`, \`educate: autonomous\`, and everything else \`supervised\` or \`manual\`.

---

## CANS.md Output Format

When all information is collected, write a file called \`CANS.md\` with this exact structure:

\`\`\`
---
version: "2.0"
provider:
  name: "<full name>"
  npi: "<10-digit NPI>"
  types:
    - "<provider type>"
  degrees:
    - "<degree>"
  licenses:
    - "<license>"
  certifications:
    - "<certification>"
  specialty: "<specialty>"
  subspecialty: "<subspecialty>"
  organizations:
    - name: "<organization name>"
      primary: true
  credential_status: pending
scope:
  permitted_actions:
    - "<action>"
autonomy:
  chart: <tier>
  order: <tier>
  charge: <tier>
  perform: <tier>
  interpret: <tier>
  educate: <tier>
  coordinate: <tier>
consent:
  hipaa_warning_acknowledged: true
  synthetic_data_only: true
  audit_consent: true
  acknowledged_at: "<ISO 8601 timestamp>"
skills:
  authorized: []
---

# Care Agent Nervous System

## Provider Summary

<name> (<types>)
Specialty: <specialty>
Subspecialty: <subspecialty>
Organization: <organization>

## Clinical Philosophy

<philosophy text>

## Autonomy Configuration

| Action | Tier |
|--------|------|
| Chart | <tier> |
| Order | <tier> |
| Charge | <tier> |
| Perform | <tier> |
| Interpret | <tier> |
| Educate | <tier> |
| Coordinate | <tier> |
\`\`\`

### Validation Rules

- \`version\` must be \`"2.0"\`
- \`provider.name\` must be non-empty
- \`provider.npi\` must be exactly 10 digits (or omit the field entirely if not applicable)
- \`provider.types\` must have at least 1 entry
- \`provider.degrees\` is a string array (can be empty)
- \`provider.licenses\` is a string array (can be empty)
- \`provider.certifications\` is a string array (can be empty)
- \`provider.dea_number\` if present must match pattern: 2 uppercase letters + 7 digits
- \`provider.organizations\` must have at least 1 entry, each with a non-empty \`name\`
- \`scope.permitted_actions\` must have at least 1 entry
- \`autonomy\` tiers must each be exactly: \`autonomous\`, \`supervised\`, or \`manual\`
- \`consent\` — all three booleans must be \`true\`
- \`consent.acknowledged_at\` must be an ISO 8601 timestamp
- \`skills.authorized\` must be an array (can be empty)
- Optional fields (\`specialty\`, \`subspecialty\`, \`dea_number\`, \`voice\`) can be omitted entirely

### Voice Section (Optional)

If the provider set voice directives, add a \`voice\` section in the YAML frontmatter:

\`\`\`yaml
voice:
  chart: "<directive>"
  educate: "<directive>"
\`\`\`

Only include actions that have directives. All 7 actions are valid keys: chart, order, charge, perform, interpret, educate, coordinate.

---

## After Writing CANS.md

Once you have written CANS.md, tell the provider:

> Your CareAgent configuration has been saved. To activate clinical mode, send \`/careagent_on\`.

Do NOT attempt to activate clinical mode yourself. The provider must send the slash command.
`;
}

// ---------------------------------------------------------------------------
// generateCansSchemaReference
// ---------------------------------------------------------------------------

export function generateCansSchemaReference(): string {
  return `# CANS.md Schema Reference

This document defines the exact schema for the CANS.md file. Use this as a reference when writing CANS.md during onboarding.

## YAML Frontmatter Schema

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`version\` | string | YES | Schema version, must be \`"2.0"\` |
| \`provider\` | object | YES | Provider identity and credentials |
| \`scope\` | object | YES | Scope of practice configuration |
| \`autonomy\` | object | YES | Autonomy tier settings for 7 actions |
| \`voice\` | object | NO | Per-action voice directives |
| \`consent\` | object | YES | Consent acknowledgments |
| \`skills\` | object | YES | Authorized clinical skills |
| \`cross_installation\` | object | NO | Cross-installation consent settings |

### Provider Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| \`name\` | string | YES | minLength: 1 |
| \`npi\` | string | NO | Pattern: \`^[0-9]{10}$\` |
| \`types\` | string[] | YES | minItems: 1 |
| \`degrees\` | string[] | YES | Each minLength: 1 |
| \`licenses\` | string[] | YES | Each minLength: 1 |
| \`certifications\` | string[] | YES | Each minLength: 1 |
| \`dea_number\` | string | NO | Pattern: \`^[A-Z]{2}\\d{7}$\` |
| \`specialty\` | string | NO | |
| \`subspecialty\` | string | NO | |
| \`specialties\` | string[] | NO | Each minLength: 1 |
| \`subspecialties\` | string[] | NO | Each minLength: 1 |
| \`organizations\` | object[] | YES | minItems: 1 |
| \`credential_status\` | string | NO | One of: \`active\`, \`pending\`, \`expired\` |

### Organization Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| \`name\` | string | YES | minLength: 1 |
| \`department\` | string | NO | |
| \`privileges\` | string[] | NO | Each minLength: 1 |
| \`neuron_endpoint\` | string | NO | Neuron server URL |
| \`neuron_registration_id\` | string | NO | |
| \`primary\` | boolean | NO | |

### Scope Object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| \`permitted_actions\` | string[] | YES | minItems: 1, each minLength: 1 |

### Autonomy Object

All fields required. Each must be one of: \`autonomous\`, \`supervised\`, \`manual\`.

| Field | Description |
|-------|-------------|
| \`chart\` | Clinical documentation |
| \`order\` | Medication/lab/imaging orders |
| \`charge\` | Billing charges and codes |
| \`perform\` | Clinical procedures |
| \`interpret\` | Result interpretation |
| \`educate\` | Patient education |
| \`coordinate\` | Care coordination |

### Voice Object (Optional)

All fields optional. Each is a free-text string directive.

Fields: \`chart\`, \`order\`, \`charge\`, \`perform\`, \`interpret\`, \`educate\`, \`coordinate\`

### Consent Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`hipaa_warning_acknowledged\` | boolean | YES | Must be \`true\` |
| \`synthetic_data_only\` | boolean | YES | Must be \`true\` |
| \`audit_consent\` | boolean | YES | Must be \`true\` |
| \`acknowledged_at\` | string | YES | ISO 8601 timestamp |

### Skills Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`authorized\` | string[] | YES | Each minLength: 1 |

## Complete Valid Example

\`\`\`yaml
---
version: "2.0"
provider:
  name: "Dr. Jane Smith"
  npi: "1234567890"
  types:
    - "Physician"
  degrees:
    - "MD"
  licenses:
    - "MD-CA-G54321"
  certifications:
    - "ABIM Board Certified"
  specialty: "Internal Medicine"
  subspecialty: "Pulmonology"
  organizations:
    - name: "City General Hospital"
      primary: true
  credential_status: pending
scope:
  permitted_actions:
    - chart_progress_note
    - chart_h_and_p
    - chart_discharge_summary
    - order_lab
    - educate_patient
autonomy:
  chart: autonomous
  order: supervised
  charge: supervised
  perform: manual
  interpret: supervised
  educate: autonomous
  coordinate: supervised
voice:
  chart: "Use SOAP format for all progress notes"
  educate: "Include diagrams when explaining pulmonary conditions"
consent:
  hipaa_warning_acknowledged: true
  synthetic_data_only: true
  audit_consent: true
  acknowledged_at: "2026-03-01T00:00:00.000Z"
skills:
  authorized: []
---

# Care Agent Nervous System

## Provider Summary

Dr. Jane Smith (Physician)
Specialty: Internal Medicine
Subspecialty: Pulmonology
Organization: City General Hospital

## Clinical Philosophy

Evidence-based pulmonary medicine with emphasis on patient education and preventive care. Prefer conservative management approaches before invasive procedures.

## Autonomy Configuration

| Action | Tier |
|--------|------|
| Chart | autonomous |
| Order | supervised |
| Charge | supervised |
| Perform | manual |
| Interpret | supervised |
| Educate | autonomous |
| Coordinate | supervised |
\`\`\`
`;
}
