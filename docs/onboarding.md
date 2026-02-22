# Onboarding Walkthrough

`careagent init` launches an interactive onboarding interview that discovers the provider's clinical identity, generates a personalized CANS.md file, and supplements existing workspace files with clinical content. The provider answers questions in a conversational format and the system builds their clinical profile from the responses. Before running onboarding, complete the steps in [docs/installation.md](installation.md).

---

## Starting Onboarding

```bash
careagent init
```

The interview is conversational. The provider answers questions about their identity, credentials, scope of practice, clinical philosophy, documentation voice, and autonomy preferences. The system uses these answers to generate a CANS.md file tailored to the provider's practice.

---

## Interview Stages

The onboarding interview proceeds through the following stages in order.

### Welcome

The system displays a HIPAA compliance warning and confirms that the provider understands CareAgent operates on synthetic data only. No real patient information should be entered at any point. The provider must acknowledge this warning before proceeding.

This establishes the compliance boundary for the entire installation.

### Identity

The provider enters their full name, National Provider Identifier (NPI, optional), and basic identifying information. The NPI is validated as a 10-digit number if provided.

Identity information anchors every action the Care Agent takes to a specific provider.

### Credentials

The provider declares their provider type(s) (e.g., Physician, Nurse Practitioner), degrees, license numbers, and certifications. Multiple values are supported for each field.

Credentials determine which clinical skills the Care Agent is authorized to load.

### Specialty

The provider declares their primary specialty and optional subspecialty, then configures their primary organization including the organization name, department, and institutional privileges. Credential status (active, pending, or expired) is set here.

Specialty and organizational affiliation scope the Care Agent to the provider's actual practice context.

### Scope

The provider defines the list of clinical actions the Care Agent is permitted to perform. This is a whitelist model -- only explicitly listed actions are authorized. Actions not on the list are denied at runtime.

Scope is the primary safety boundary. The Care Agent cannot take actions outside this list regardless of what is requested.

### Philosophy

The provider writes a clinical philosophy statement describing how they approach patient care. This free-text statement is included in the CANS.md profile and shapes the Care Agent's clinical behavior.

The philosophy grounds the agent's clinical judgment in the provider's actual approach to care.

### Voice

The provider configures documentation voice directives for each of the seven atomic actions: chart, order, charge, perform, interpret, educate, and coordinate. Each directive describes how the Care Agent should write and communicate when performing that action type. All voice directives are optional.

Voice directives ensure generated clinical documentation matches the provider's professional style.

### Autonomy

The provider sets an autonomy tier for each of the seven atomic actions. The three tiers are:

- **autonomous** -- the Care Agent acts independently with post-hoc review
- **supervised** -- the Care Agent drafts, the provider approves before execution
- **manual** -- the provider acts, the Care Agent assists on request

Autonomy tiers define the delegation boundary for each clinical function.

### Consent

The provider confirms three required acknowledgments:

1. The system is not HIPAA compliant
2. Only synthetic data will be used
3. All clinical actions will be logged to an audit trail

Consent is the final gate before CANS.md generation. All three acknowledgments are required.

---

## CANS.md Generation

After the interview completes, the system generates a personalized CANS.md file from the provider's responses. The provider reviews the generated file, can request adjustments, and approves before finalizing. The approved CANS.md is placed in the agent's workspace directory.

CANS.md is the clinical activation kernel -- a single file that activates the entire clinical layer when detected by the plugin. See [docs/configuration.md](configuration.md) for the full schema reference.

---

## Workspace Supplementation

After CANS.md is generated, onboarding supplements existing workspace files with clinical content. Existing content in these files is preserved -- onboarding never replaces what is already there. It only adds clinical material.

| File | Source | Purpose |
|------|--------|---------|
| `SOUL.md` | OpenClaw + onboarding | Clinical identity and persona |
| `AGENTS.md` | OpenClaw + onboarding | Clinical protocols and hard rules |
| `USER.md` | OpenClaw + onboarding | Provider preferences |
| `TOOLS.md` | OpenClaw | Tool usage instructions |
| `IDENTITY.md` | OpenClaw | Agent presentation |
| `MEMORY.md` | OpenClaw | Long-term memory |
| `HEARTBEAT.md` | OpenClaw | Monitoring loop |
| `BOOT.md` | OpenClaw | Startup checklist |
| `CANS.md` | CareAgent (generated by onboarding) | Clinical activation kernel |
| `AUDIT.log` | CareAgent (generated at runtime) | Immutable action log |

---

## Activation

On the next agent run after onboarding, the presence of CANS.md in the workspace activates the clinical layer automatically. The provider can verify activation at any time:

```bash
careagent status
```

The status output shows:

- **Activation state** -- whether the clinical layer is active
- **CANS summary** -- the provider's identity, specialty, and credential status
- **Hardening layer status** -- confirmation that runtime hardening is engaged
- **Loaded clinical skills** -- which skills are active based on the provider's credentials
- **Audit stats** -- action counts from the audit trail

When `careagent status` shows skills active and the hardening layer engaged, the Care Agent is ready for clinical use.
