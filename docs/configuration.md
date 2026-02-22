# Configuration Reference

This document covers the three configuration schemas in @careagent/provider-core: the CANS.md clinical activation file, skill manifest format, and plugin configuration. The source of truth for all schemas is the TypeBox definitions in source code. This documentation reflects the schema as of v0.1.0.

---

## CANS.md Schema Reference

CANS.md uses YAML frontmatter to define the provider's clinical configuration. The frontmatter is validated against a TypeBox schema at parse time. The current schema version is `"2.0"`.

### Field Reference

#### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Schema version (currently `"2.0"`) |
| `provider` | object | Yes | Provider identity and credentials |
| `scope` | object | Yes | Scope of practice configuration |
| `autonomy` | object | Yes | Autonomy tier per atomic action |
| `voice` | object | No | Voice directives per atomic action |
| `consent` | object | Yes | Consent and compliance acknowledgments |
| `skills` | object | Yes | Authorized clinical skills |
| `cross_installation` | object | No | Cross-installation communication consent |

#### Provider Fields (`provider.*`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider.name` | string (minLength: 1) | Yes | Provider's full name |
| `provider.npi` | string (10-digit pattern: `^[0-9]{10}$`) | No | National Provider Identifier |
| `provider.types` | string[] (minItems: 1) | Yes | Provider type(s): Physician, Nurse Practitioner, etc. |
| `provider.degrees` | string[] | Yes | Degrees held: MD, DO, DNP, etc. |
| `provider.licenses` | string[] | Yes | License identifiers: MD-TX-A12345 |
| `provider.certifications` | string[] | Yes | Board certifications |
| `provider.specialty` | string | No | Primary specialty |
| `provider.subspecialty` | string | No | Subspecialty |
| `provider.organizations` | Organization[] (minItems: 1) | Yes | Organizations with privileges |
| `provider.credential_status` | `"active"` \| `"pending"` \| `"expired"` | No | Current credential status |

#### Organization Fields (`provider.organizations[].*`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string (minLength: 1) | Yes | Organization name |
| `department` | string | No | Department within organization |
| `privileges` | string[] | No | Granted privileges at this organization |
| `neuron_endpoint` | string | No | Neuron server URL for this organization |
| `neuron_registration_id` | string | No | Registration ID with the Neuron |
| `primary` | boolean | No | Whether this is the primary organization |

#### Scope Fields (`scope.*`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope.permitted_actions` | string[] (minItems: 1) | Yes | Whitelist of permitted clinical actions |

#### Autonomy Fields (`autonomy.*`)

All autonomy fields accept one of three values: `"autonomous"`, `"supervised"`, or `"manual"`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `autonomy.chart` | AutonomyTier | Yes | Autonomy tier for charting |
| `autonomy.order` | AutonomyTier | Yes | Autonomy tier for ordering |
| `autonomy.charge` | AutonomyTier | Yes | Autonomy tier for charging |
| `autonomy.perform` | AutonomyTier | Yes | Autonomy tier for performing |
| `autonomy.interpret` | AutonomyTier | Yes | Autonomy tier for interpreting |
| `autonomy.educate` | AutonomyTier | Yes | Autonomy tier for educating |
| `autonomy.coordinate` | AutonomyTier | Yes | Autonomy tier for coordinating |

#### Voice Fields (`voice.*`)

The `voice` object itself is optional. When present, all individual fields within it are also optional.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `voice.chart` | string | No | Voice directive for charting documentation |
| `voice.order` | string | No | Voice directive for order communication |
| `voice.charge` | string | No | Voice directive for charge documentation |
| `voice.perform` | string | No | Voice directive for procedure documentation |
| `voice.interpret` | string | No | Voice directive for interpretation reports |
| `voice.educate` | string | No | Voice directive for patient education |
| `voice.coordinate` | string | No | Voice directive for care coordination |

#### Consent Fields (`consent.*`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `consent.hipaa_warning_acknowledged` | boolean | Yes | Provider acknowledged HIPAA non-compliance |
| `consent.synthetic_data_only` | boolean | Yes | Provider confirmed synthetic data only |
| `consent.audit_consent` | boolean | Yes | Provider consented to audit logging |
| `consent.acknowledged_at` | string (ISO 8601) | Yes | Timestamp of consent acknowledgment |

#### Skills Fields (`skills.*`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skills.authorized` | string[] | Yes | List of authorized skill IDs |

#### Cross-Installation Fields (`cross_installation.*`)

The `cross_installation` object itself is optional. When present, both fields within it are required.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cross_installation.allow_inbound` | boolean | Yes | Accept patient CareAgent connections |
| `cross_installation.allow_outbound` | boolean | Yes | Initiate connections to patient CareAgents |

### Complete Example

The following is a fully annotated CANS.md file. This example uses a fictional provider identity.

```yaml
---
# Schema version — currently "2.0"
version: "2.0"

provider:
  # Full provider name
  name: Dr. Jane Smith
  # National Provider Identifier (10 digits, optional)
  npi: "1234567890"
  # Provider type(s) — at least one required
  types:
    - Physician
  # Degrees held
  degrees:
    - MD
  # License identifiers
  licenses:
    - MD-TX-A12345
  # Board certifications
  certifications:
    - ABIM Board Certified
  # Primary specialty (optional)
  specialty: Internal Medicine
  # Subspecialty (optional)
  subspecialty: Hospitalist Medicine
  # Organizations — at least one required
  organizations:
    - name: City General Hospital
      # Department (optional)
      department: Internal Medicine
      # Privileges at this organization (optional)
      privileges:
        - inpatient medicine
        - critical care consultation
      # Neuron server URL (optional — ecosystem integration)
      # neuron_endpoint: "https://neuron.citygeneral.example.com"
      # Neuron registration ID (optional)
      # neuron_registration_id: "reg-12345"
      # Mark as primary organization (optional)
      primary: true
  # Credential status (optional): "active", "pending", or "expired"
  credential_status: active

scope:
  # Whitelist of permitted actions — only these are authorized at runtime
  permitted_actions:
    - chart_progress_note
    - chart_h_and_p
    - chart_discharge_summary

# Autonomy tier per atomic action: "autonomous", "supervised", or "manual"
autonomy:
  chart: autonomous       # AI acts independently, post-hoc review
  order: supervised        # AI drafts, provider approves before execution
  charge: supervised       # AI drafts, provider approves before execution
  perform: manual          # Provider acts, AI assists on request
  interpret: manual        # Provider acts, AI assists on request
  educate: supervised      # AI drafts, provider approves before execution
  coordinate: supervised   # AI drafts, provider approves before execution

# Voice directives per atomic action (optional section)
# Describes how the Care Agent writes and communicates for each action type
voice:
  chart: "Concise, problem-oriented SOAP format. Active voice."
  order: "Standard order entry format with clinical indication."

# Consent — all fields required
consent:
  hipaa_warning_acknowledged: true
  synthetic_data_only: true
  audit_consent: true
  acknowledged_at: "2026-01-15T09:30:00.000Z"

# Authorized clinical skills
skills:
  authorized: []

# Cross-installation consent (optional section)
# cross_installation:
#   allow_inbound: true
#   allow_outbound: true
---

# Clinical Activation and Notification System

This document configures the CareAgent clinical AI assistant for
Dr. Jane Smith, an internal medicine physician specializing in
hospitalist medicine at City General Hospital.

## Provider Summary

Board-certified internist with active credentials and privileges
for inpatient medicine and critical care consultation.
```

### TypeScript Types

The following types are defined using TypeBox in `src/activation/cans-schema.ts`:

```typescript
type AutonomyTierType = "autonomous" | "supervised" | "manual";

type Organization = {
  name: string;
  department?: string;
  privileges?: string[];
  neuron_endpoint?: string;
  neuron_registration_id?: string;
  primary?: boolean;
};

type Provider = {
  name: string;
  npi?: string;
  types: string[];
  degrees: string[];
  licenses: string[];
  certifications: string[];
  specialty?: string;
  subspecialty?: string;
  organizations: Organization[];
  credential_status?: "active" | "pending" | "expired";
};

type Scope = {
  permitted_actions: string[];
};

type Autonomy = {
  chart: AutonomyTierType;
  order: AutonomyTierType;
  charge: AutonomyTierType;
  perform: AutonomyTierType;
  interpret: AutonomyTierType;
  educate: AutonomyTierType;
  coordinate: AutonomyTierType;
};

type Voice = {
  chart?: string;
  order?: string;
  charge?: string;
  perform?: string;
  interpret?: string;
  educate?: string;
  coordinate?: string;
};

type Consent = {
  hipaa_warning_acknowledged: boolean;
  synthetic_data_only: boolean;
  audit_consent: boolean;
  acknowledged_at: string;
};

type Skills = {
  authorized: string[];
};

type CrossInstallationConsent = {
  allow_inbound: boolean;
  allow_outbound: boolean;
};

type CANSDocument = {
  version: string;
  provider: Provider;
  scope: Scope;
  autonomy: Autonomy;
  voice?: Voice;
  consent: Consent;
  skills: Skills;
  cross_installation?: CrossInstallationConsent;
};
```

---

## Skill Manifest Reference

Each clinical skill includes a `skill-manifest.json` that declares the skill's identity, version, credential requirements, file integrity checksums, and version pinning. The schema is defined in `src/skills/manifest-schema.ts`.

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_id` | string (minLength: 1) | Yes | Unique skill identifier |
| `version` | string (semver: `^\d+\.\d+\.\d+$`) | Yes | Skill version in semver format |
| `requires` | object | Yes | Credential requirements for loading this skill |
| `requires.license` | string[] | No | Required license types |
| `requires.specialty` | string[] | No | Required specialties |
| `requires.privilege` | string[] | No | Required institutional privileges |
| `files` | Record<string, string> | Yes | Map of filename to SHA-256 hash for integrity verification |
| `pinned` | boolean | Yes | Whether the skill version is pinned |
| `approved_version` | string | Yes | The approved version string |

### Example

The following is the `skill-manifest.json` for the chart-skill, annotated with descriptions:

```json
{
  // Unique skill identifier
  "skill_id": "chart-skill",

  // Semver version
  "version": "1.0.0",

  // Credential requirements — skill loads only if provider meets these
  "requires": {
    // Provider must hold one of these license types
    "license": ["MD", "DO"],
    // No specialty restriction
    "specialty": [],
    // No privilege restriction
    "privilege": []
  },

  // File integrity map — filename to SHA-256 hash
  // Used to verify skill files have not been tampered with
  "files": {
    "SKILL.md": "af19321536ca380980f9e277a4783e837b3af878f36c7183567c5501a852608f"
  },

  // Version pinning — prevents automatic updates when true
  "pinned": true,

  // The approved version for this installation
  "approved_version": "1.0.0"
}
```

Note: JSON does not support comments. The comments above are for documentation purposes only. The actual file contains no comments.

---

## Plugin Configuration

The plugin manifest `openclaw.plugin.json` at the repository root declares the plugin's identity and registration with OpenClaw.

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Plugin identifier (`@careagent/provider-core`) |
| `name` | string | Display name (`CareAgent`) |
| `description` | string | Plugin description |
| `version` | string | Plugin version (currently `0.1.0`) |
| `configSchema` | object | Configuration schema (currently empty -- no user-configurable settings) |
| `skills` | string[] | Array of skill directory paths relative to the repo root |
| `commands` | array | CLI commands (currently empty -- commands are registered dynamically via hooks) |
| `hooks` | array | Hook registrations (currently empty -- hooks are registered dynamically in code) |

### Example

```json
{
  "id": "@careagent/provider-core",
  "name": "CareAgent",
  "description": "Clinical activation layer — transforms OpenClaw into a credentialed, auditable clinical agent",
  "version": "0.1.0",
  "configSchema": {},
  "skills": ["skills/chart-skill"],
  "commands": [],
  "hooks": []
}
```

The `skills` array lists directories containing clinical skills. Each directory must contain a `skill-manifest.json` and a `SKILL.md` file. The `commands` and `hooks` arrays are empty in the manifest because the plugin registers these programmatically at runtime through the OpenClaw plugin API in `src/index.ts`.
