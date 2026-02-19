# Phase 4: Clinical Skills - Research

**Researched:** 2026-02-19
**Domain:** Clinical skill framework, credential gating, integrity verification, template-constrained clinical documentation generation
**Confidence:** HIGH

## Summary

Phase 4 builds the clinical skill framework on top of the hardened runtime from Phase 3. The work divides into four interconnected but separable subsystems: (1) a credential validator that checks CANS.md credentials against skill requirements, (2) a skill loader with SHA-256 integrity verification and version pinning, (3) a chart-skill that generates template-constrained clinical notes, and (4) audit integration that records every skill lifecycle event.

The codebase is well-prepared. The `CredentialValidator` interface already exists in `src/credentials/types.ts` with a `check(cans, requiredCredentials)` method. The CANS schema already includes an optional `skills` field with `SkillGatingSchema` (an array of `SkillGatingRule` objects, each with `skill_id`, `requires_license`, `requires_specialty`, `requires_privilege`). The `createCredentialValidator()` factory in `src/credentials/validator.ts` is a stub that throws "Phase 4". The `AuditPipeline` supports all needed audit patterns. The hardening engine is wired into both entry points. OpenClaw's skill system uses SKILL.md files with YAML frontmatter, loaded from plugin-declared skill directories in `openclaw.plugin.json`.

The critical design decision is how CareAgent clinical skills relate to OpenClaw's native skill system. CareAgent skills must be SKILL.md files (so OpenClaw can inject them into the agent's system prompt), but they need additional metadata (credential requirements, version, integrity hash) and a pre-load gate that OpenClaw's native system does not provide. The recommended approach is to use OpenClaw's standard SKILL.md format for the skill content but add a companion manifest file (`skill-manifest.json`) per skill with CareAgent-specific metadata. The plugin's `register()` function checks credentials and integrity before declaring skill directories in the plugin manifest, effectively gating which skills OpenClaw sees.

**Primary recommendation:** Implement credential validation as a pure function on the existing `CredentialValidator` interface. Create a `src/skills/` module with loader, manifest schema, integrity checker, and the chart-skill. Use OpenClaw's SKILL.md format for skill content with a companion `skill-manifest.json` for CareAgent metadata (credential requirements, version, SHA-256 checksums). Gate clinical skills at load time by only registering skill directories for skills that pass credential and integrity checks.

## Standard Stack

### Core (already locked -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.7.0 | Language | Already configured |
| @sinclair/typebox | ~0.34.0 | Schema validation | CANS and skill manifest schemas |
| vitest | ~4.0.0 | Testing | Already configured, 486 tests passing |
| tsdown | ~0.20.0 | Build/bundle | Already configured with 4 entry points |
| Node.js `node:crypto` | >=22.12.0 | SHA-256 checksumming | Skill integrity verification |
| Node.js `node:fs` | >=22.12.0 | File I/O | Skill loading, manifest reading |
| Node.js `node:path` | >=22.12.0 | Path resolution | Skill directory resolution |

### No New Dependencies Required

This phase requires **zero new npm dependencies**. The credential validator uses pure TypeScript logic on existing `CANSDocument` types. The integrity checker reuses the `computeHash()` pattern from `src/activation/cans-integrity.ts`. Skill manifests use TypeBox schemas. Clinical note templates are TypeScript string template functions.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Companion `skill-manifest.json` | Extended SKILL.md frontmatter | SKILL.md frontmatter is owned by OpenClaw; adding custom fields risks breakage on OpenClaw updates. Separate manifest keeps CareAgent concerns cleanly separated. |
| TypeScript template functions for notes | A template engine (Handlebars, Mustache) | Template engines add dependencies. Clinical note templates are structured with fixed sections and variable fields -- string template literals are sufficient and keep zero-dep constraint. |
| Per-skill integrity file | Single manifest with all hashes | Per-skill manifest is simpler, self-contained, and avoids a centralized file that must be updated atomically when any skill changes. |
| Custom skill loading pipeline | OpenClaw's native `skills.load.extraDirs` | OpenClaw's extraDirs loads all skills in a directory; CareAgent needs pre-load credential gating. However, the plugin's `openclaw.plugin.json` `skills` array controls which directories are visible. The recommended approach is to stage approved skills into a runtime directory that gets declared to OpenClaw. |

## Architecture Patterns

### Recommended Project Structure

```
src/skills/
  index.ts              # Re-exports
  types.ts              # SkillManifest, SkillLoadResult, ChartTemplate types
  manifest-schema.ts    # TypeBox schema for skill-manifest.json
  loader.ts             # Skill discovery, credential check, integrity verify, load
  integrity.ts          # SHA-256 checksumming for skill files
  version-pin.ts        # Version pinning and upgrade approval logic
  chart-skill/
    index.ts            # chart-skill registration and template dispatch
    templates/
      operative-note.ts   # Neurosurgery operative note template
      h-and-p.ts          # History & Physical template
      progress-note.ts    # Progress note template
    template-types.ts     # Shared template interface and section types
    voice-adapter.ts      # Applies clinical_voice preferences to generated text
skills/                   # Plugin skill directories (SKILL.md files)
  chart-skill/
    SKILL.md              # OpenClaw skill file -- instructions for the LLM
    skill-manifest.json   # CareAgent metadata (credentials, version, checksums)
```

### Pattern 1: Credential Gating at Load Time

**What:** Before declaring skill directories to OpenClaw, the loader validates each skill's credential requirements against the provider's CANS.md. Skills that fail credential checks are never registered with OpenClaw, so the LLM never sees them in its system prompt.

**When to use:** Every plugin activation when CANS.md is present.

**Why:** This is the cleanest gating mechanism. OpenClaw's native skill system has no concept of credential-based filtering. By gating at the directory-registration level, we ensure unauthorized skills never enter the system prompt, never appear as available tools, and never get invoked. This is defense-in-depth alongside the hardening engine.

**Example:**
```typescript
// src/skills/loader.ts
import type { CANSDocument } from '../activation/cans-schema.js';
import type { CredentialValidator } from '../credentials/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { SkillManifest } from './types.js';

export interface SkillLoadResult {
  skillId: string;
  loaded: boolean;
  reason?: string;
}

export function loadClinicalSkills(
  skillsDir: string,
  cans: CANSDocument,
  validator: CredentialValidator,
  audit: AuditPipeline,
): SkillLoadResult[] {
  // 1. Discover skill directories (each has SKILL.md + skill-manifest.json)
  // 2. For each skill: read manifest, verify integrity, check credentials
  // 3. Return list of approved skill directories for OpenClaw registration
  // 4. Audit-log every decision (loaded, blocked-credential, blocked-integrity)
}
```

### Pattern 2: Template-Constrained Generation

**What:** Clinical notes are generated by filling structured templates with provider-specific data, not by freeform LLM generation. Each template defines mandatory sections with typed fields. The LLM fills the fields; the template enforces structure.

**When to use:** Every chart-skill invocation (operative note, H&P, progress note).

**Why:** This is a locked decision from research findings applied in the roadmap. Template-constrained generation prevents hallucination of clinical content structure. The LLM provides clinical intelligence (filling in the content), but the structure (which sections exist, their order, required fields) is deterministic code. This is critical for medicolegal compliance -- an operative note must always have a preoperative diagnosis, postoperative diagnosis, procedure description, and findings.

**Example:**
```typescript
// src/skills/chart-skill/template-types.ts
export interface TemplateSection {
  name: string;
  required: boolean;
  description: string;         // Instruction to the LLM about what goes here
  format?: 'text' | 'list' | 'table';
}

export interface ChartTemplate {
  templateId: string;
  name: string;
  sections: TemplateSection[];
  version: string;
}

// src/skills/chart-skill/templates/operative-note.ts
export const operativeNoteTemplate: ChartTemplate = {
  templateId: 'operative-note',
  name: 'Operative Note',
  sections: [
    { name: 'Date of Procedure', required: true, description: 'Date the procedure was performed', format: 'text' },
    { name: 'Preoperative Diagnosis', required: true, description: 'Diagnosis assigned before surgery', format: 'text' },
    { name: 'Postoperative Diagnosis', required: true, description: 'Diagnosis confirmed or discovered during surgery', format: 'text' },
    { name: 'Procedure Performed', required: true, description: 'Name(s) of procedure(s) performed', format: 'text' },
    { name: 'Surgeon', required: true, description: 'Name of primary surgeon', format: 'text' },
    { name: 'Assistant(s)', required: false, description: 'Name(s) of surgical assistants', format: 'text' },
    { name: 'Anesthesia', required: true, description: 'Type of anesthesia administered', format: 'text' },
    { name: 'Indications', required: true, description: 'Clinical reason and necessity for the procedure', format: 'text' },
    { name: 'Procedure Description', required: true, description: 'Step-by-step narrative of the surgical procedure', format: 'text' },
    { name: 'Findings', required: true, description: 'Intraoperative findings', format: 'text' },
    { name: 'Specimens', required: false, description: 'Specimens removed and sent for pathology', format: 'list' },
    { name: 'Estimated Blood Loss', required: true, description: 'Estimated blood loss in mL', format: 'text' },
    { name: 'Complications', required: true, description: 'Intraoperative complications or "None"', format: 'text' },
    { name: 'Disposition', required: true, description: 'Patient condition and disposition at end of procedure', format: 'text' },
  ],
  version: '1.0.0',
};
```

### Pattern 3: Integrity Manifest Pattern

**What:** Each clinical skill has a `skill-manifest.json` containing version, credential requirements, and SHA-256 checksums of all skill files. At install time, checksums are computed and stored. At load time, checksums are recomputed and compared. A mismatch blocks loading.

**When to use:** Every skill install and every skill load.

**Why:** SKIL-03 requires integrity verification. The manifest pattern is used by npm (package-lock.json integrity), Node.js (experimental policy manifests), and Subresource Integrity (SRI). It is a well-understood pattern. Storing checksums per-skill (not centrally) means each skill is self-contained and independently verifiable.

**Example:**
```typescript
// skill-manifest.json
{
  "skill_id": "chart-skill",
  "version": "1.0.0",
  "requires": {
    "license": ["MD", "DO"],
    "specialty": [],
    "privilege": []
  },
  "files": {
    "SKILL.md": "sha256-<hex>",
    "skill-manifest.json": "sha256-<hex-of-manifest-without-this-field>"
  },
  "pinned": true,
  "approved_version": "1.0.0"
}
```

### Pattern 4: Version Pinning with Explicit Approval

**What:** Clinical skills do not auto-update. The `skill-manifest.json` contains `pinned: true` and `approved_version`. When a new version is available, the skill remains at the pinned version until the provider explicitly approves the upgrade. The approval is audit-logged.

**When to use:** Every skill version check.

**Why:** SKIL-04 requires explicit approval for version changes. Auto-update of clinical tools is a liability risk -- a template change could alter documentation structure without the provider's knowledge. The provider must consciously approve each change.

### Pattern 5: Clinical Voice Adaptation

**What:** Generated clinical notes incorporate the provider's `clinical_voice` preferences from CANS.md (tone, documentation_style, eponyms, abbreviations). The voice adapter transforms template output to match provider preferences.

**When to use:** After template sections are filled, before final output.

**Why:** SKIL-05 requires documentation in the provider's clinical voice. The clinical_voice schema already exists in CANS.md and is populated during onboarding. The voice adapter is a post-processing step that does not affect template structure.

**Example:**
```typescript
// src/skills/chart-skill/voice-adapter.ts
import type { ClinicalVoice } from '../../activation/cans-schema.js';

export interface VoiceDirectives {
  tone?: string;
  documentationStyle?: string;
  useEponyms?: boolean;
  abbreviationStyle?: string;
}

export function extractVoiceDirectives(voice?: ClinicalVoice): VoiceDirectives {
  if (!voice) return {};
  return {
    tone: voice.tone,
    documentationStyle: voice.documentation_style,
    useEponyms: voice.eponyms,
    abbreviationStyle: voice.abbreviations,
  };
}

// Voice directives are injected into the SKILL.md instructions so the LLM
// adapts its language style when filling template sections.
export function buildVoiceInstructions(directives: VoiceDirectives): string {
  const lines: string[] = [];
  if (directives.tone) lines.push(`Write in a ${directives.tone} tone.`);
  if (directives.documentationStyle) {
    lines.push(`Use ${directives.documentationStyle} documentation style.`);
  }
  if (directives.useEponyms !== undefined) {
    lines.push(directives.useEponyms
      ? 'Use standard medical eponyms (e.g., Babinski sign).'
      : 'Avoid eponyms; use descriptive terminology.');
  }
  if (directives.abbreviationStyle) {
    lines.push(`Abbreviation style: ${directives.abbreviationStyle}.`);
  }
  return lines.join('\n');
}
```

### Anti-Patterns to Avoid

- **Freeform clinical generation:** Never let the LLM generate a clinical note without template constraints. The template defines structure; the LLM fills content. An operative note without a postoperative diagnosis section is medicolegally dangerous.
- **Storing checksums separately from skill:** Keep the integrity manifest co-located with the skill. A central integrity database creates a single point of failure and synchronization complexity.
- **Auto-updating clinical skills:** Never auto-update. A version change to an operative note template could add or remove sections that the provider has not reviewed.
- **Credential checking at invocation time only:** Check credentials at load time (to prevent the skill from appearing in the system prompt) AND at the hardening layer (defense-in-depth). The hardening engine's tool-policy layer already prevents invocation of tools not in `permitted_actions`.
- **Modifying OpenClaw's SKILL.md frontmatter schema:** Do not add CareAgent-specific fields to the SKILL.md YAML frontmatter. OpenClaw owns that schema and may change it. Use the companion `skill-manifest.json` for CareAgent metadata.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash implementation | `node:crypto` `createHash('sha256')` | Existing pattern in `cans-integrity.ts`; battle-tested Node.js built-in |
| Schema validation for manifests | Custom JSON validator | TypeBox `Value.Check` + `Value.Errors` | Consistent with CANS schema validation; structured errors with paths |
| YAML frontmatter parsing | Custom parser | Vendored `yaml` package (already in `src/vendor/`) | Already solved in Phase 1; YAML edge cases are notorious |
| Clinical note section ordering | Ad-hoc string concatenation | Template object with ordered sections array | Sections must be in consistent, medicolegally-correct order |
| UUID generation for trace IDs | Custom ID generation | `node:crypto` `randomUUID()` | Already used in AuditPipeline; CSPRNG-based |

**Key insight:** The integrity verification pattern (hash at install, verify at load) is the same pattern already implemented for CANS.md in `src/activation/cans-integrity.ts`. Reuse the `computeHash()` function. Do not build a second hashing utility.

## Common Pitfalls

### Pitfall 1: Skill Gating Race Condition
**What goes wrong:** Skills are registered with OpenClaw before credential validation completes, allowing unauthorized skills to briefly appear in the system prompt.
**Why it happens:** OpenClaw's skill loading is synchronous during plugin registration. If credential checking is async but registration is sync, there is a timing window.
**How to avoid:** Make credential validation synchronous. The `CredentialValidator.check()` interface already returns `CredentialCheckResult` (not a Promise). All data is local (CANS.md, skill manifest) -- no network I/O needed.
**Warning signs:** Skills appearing in agent responses that the provider is not credentialed for.

### Pitfall 2: Integrity Check on Wrong Files
**What goes wrong:** Checksumming only SKILL.md but not skill-manifest.json, allowing an attacker to modify credential requirements in the manifest without detection.
**Why it happens:** The manifest itself is a file that can be tampered with.
**How to avoid:** The manifest includes a self-referential checksum computed over all fields except the checksum fields themselves. Alternatively, compute the manifest checksum over a canonical form that excludes the `files` entry for the manifest itself. The simpler approach: compute a single hash over the entire skill directory (all files concatenated in sorted order).
**Warning signs:** Skills loading with different credential requirements than originally installed.

### Pitfall 3: Template Section Omission by LLM
**What goes wrong:** The LLM fills some template sections but skips required ones, producing an incomplete operative note.
**Why it happens:** LLMs may skip sections they consider unnecessary or merge sections together.
**How to avoid:** The SKILL.md instructions must explicitly list every required section and state that all required sections must be present. Post-generation validation should check that all required section headers appear in the output. The template-constrained approach means the output format is specified in the skill instructions -- the LLM fills in content, but the structure is prescribed.
**Warning signs:** Generated notes missing standard sections like "Estimated Blood Loss" or "Complications".

### Pitfall 4: Clinical Voice Override of Safety Content
**What goes wrong:** The voice adapter's "concise" style causes the LLM to omit critical safety information from clinical notes.
**Why it happens:** A "concise" documentation style might be interpreted as permission to skip details.
**How to avoid:** Voice directives apply to writing style, not content completeness. The SKILL.md instructions must state: "Voice preferences affect language style only. All required clinical content must be present regardless of voice settings."
**Warning signs:** Notes generated with "concise" style missing relevant negatives or safety-critical details.

### Pitfall 5: Version Pin Bypass via File Replacement
**What goes wrong:** A skill's files are replaced on disk without going through the version upgrade approval flow, bypassing the version pin.
**Why it happens:** Nothing prevents direct file modification on the filesystem.
**How to avoid:** Integrity verification at load time (SKIL-03) catches this. If files change, checksums won't match, and the skill won't load. This is why integrity checking and version pinning work together -- the checksum detects unauthorized changes, and the version pin prevents authorized but unapproved updates.
**Warning signs:** Skill load failures due to integrity mismatch.

### Pitfall 6: Circular Dependency Between Credential Validator and Skill Loader
**What goes wrong:** The skill loader imports from credentials, which imports from skills, creating a circular module dependency.
**Why it happens:** Both modules deal with CANS credential data.
**How to avoid:** The credential validator depends only on CANS types (already the case in `src/credentials/types.ts`). The skill loader depends on the credential validator interface. There is no reason for the credential module to import from the skill module. Keep the dependency one-directional: skills -> credentials -> CANS types.
**Warning signs:** Build failures or runtime `undefined` imports.

## Code Examples

### Credential Validator Implementation

```typescript
// src/credentials/validator.ts (replace stub)
import type { CANSDocument } from '../activation/cans-schema.js';
import type { CredentialValidator, CredentialCheckResult } from './types.js';

export function createCredentialValidator(): CredentialValidator {
  return {
    check(cans, requiredCredentials) {
      const missing: string[] = [];
      const provider = cans.provider;

      // Check license type
      if (requiredCredentials.license?.length) {
        if (!requiredCredentials.license.includes(provider.license.type)) {
          missing.push(`license:${requiredCredentials.license.join('|')}`);
        }
      }

      // Check specialty
      if (requiredCredentials.specialty?.length) {
        const providerSpecialties = [
          provider.specialty,
          ...(provider.subspecialty ? [provider.subspecialty] : []),
        ];
        const hasMatch = requiredCredentials.specialty.some(
          (s) => providerSpecialties.includes(s),
        );
        if (!hasMatch) {
          missing.push(`specialty:${requiredCredentials.specialty.join('|')}`);
        }
      }

      // Check privileges
      if (requiredCredentials.privilege?.length) {
        const missingPrivileges = requiredCredentials.privilege.filter(
          (p) => !provider.privileges.includes(p),
        );
        if (missingPrivileges.length) {
          missing.push(`privilege:${missingPrivileges.join(',')}`);
        }
      }

      return {
        valid: missing.length === 0,
        provider: provider.name,
        licenseType: provider.license.type,
        specialty: provider.specialty,
        ...(missing.length > 0 && { missingCredentials: missing }),
        ...(missing.length > 0 && {
          reason: `Provider lacks required credentials: ${missing.join('; ')}`,
        }),
      };
    },
  };
}
```

### Skill Manifest TypeBox Schema

```typescript
// src/skills/manifest-schema.ts
import { Type, type Static } from '@sinclair/typebox';

export const SkillManifestSchema = Type.Object({
  skill_id: Type.String({ minLength: 1 }),
  version: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+$' }),
  requires: Type.Object({
    license: Type.Optional(Type.Array(Type.String())),
    specialty: Type.Optional(Type.Array(Type.String())),
    privilege: Type.Optional(Type.Array(Type.String())),
  }),
  files: Type.Record(Type.String(), Type.String()),
  pinned: Type.Boolean(),
  approved_version: Type.String(),
});

export type SkillManifest = Static<typeof SkillManifestSchema>;
```

### Skill Integrity Verification

```typescript
// src/skills/integrity.ts
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function verifySkillIntegrity(
  skillDir: string,
  manifest: { files: Record<string, string> },
): { valid: boolean; reason?: string } {
  for (const [filename, expectedHash] of Object.entries(manifest.files)) {
    // Skip self-referential manifest hash check on the files field
    if (filename === 'skill-manifest.json') continue;

    const filePath = join(skillDir, filename);
    try {
      const actualHash = computeFileHash(filePath);
      if (actualHash !== expectedHash) {
        return {
          valid: false,
          reason: `Integrity mismatch for ${filename}: expected ${expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...`,
        };
      }
    } catch {
      return { valid: false, reason: `Cannot read skill file: ${filename}` };
    }
  }
  return { valid: true };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Freeform LLM clinical note generation | Template-constrained generation | 2024-2025 industry shift | Prevents hallucinated note structure; medicolegal compliance |
| Trust-on-install for plugins | Integrity verification at load time | Node.js 11.8+ experimental policies | Catches post-install tampering |
| Auto-updating clinical tools | Version pinning with explicit approval | Healthcare AI compliance requirements | Provider maintains control over clinical tool changes |

**Deprecated/outdated:**
- None relevant -- this is a greenfield implementation within an established codebase.

## Open Questions

1. **How should chart-skill interact with the LLM at runtime?**
   - What we know: The SKILL.md gets injected into the system prompt. The LLM reads it and knows how to use the chart tool. When invoked, the chart-skill tool receives parameters and returns structured output.
   - What's unclear: Whether the chart-skill should be a "tool" (invoked by the LLM with parameters) or purely a "skill" (prompt injection only, no tool registration). OpenClaw skills can be either.
   - Recommendation: The chart-skill should be a skill (SKILL.md with prompt instructions) that instructs the LLM to use structured output format matching the template sections. The SKILL.md defines the template structure and tells the LLM exactly how to format its output. No custom tool registration is needed for v1 -- the LLM generates the note as text following the template structure defined in SKILL.md.

2. **Should credential gating rules come from the skill manifest only, or also from CANS.md `skills.rules`?**
   - What we know: CANS.md already has `skills.rules` (array of `SkillGatingRule` with `skill_id`, `requires_license`, `requires_specialty`, `requires_privilege`). The skill manifest also declares credential requirements.
   - What's unclear: What happens when both exist? Which takes precedence?
   - Recommendation: The skill manifest declares the skill's intrinsic requirements (minimum credentials the skill needs). The CANS.md `skills.rules` can add additional restrictions (the provider or institution can further restrict which skills load). The effective requirement is the union of both -- the skill must satisfy both the manifest requirements AND any CANS.md rules. This means CANS.md can only make gating stricter, never more permissive.

3. **Where are skill files stored on disk?**
   - What we know: OpenClaw skills live in `~/clawd/skills/<name>/` or plugin-declared directories. Plugin skills ship in the plugin repo under `skills/` and are declared in `openclaw.plugin.json`.
   - What's unclear: Whether to ship skills inside the plugin repo or install them separately.
   - Recommendation: For v1, ship the chart-skill inside the plugin repo at `skills/chart-skill/SKILL.md`. This is the simplest approach and follows the OpenClaw plugin pattern. Future skills can be installed from a registry (careagent/provider-skills). The `openclaw.plugin.json` `skills` array should list `["skills/chart-skill"]` -- but only after credential and integrity checks pass. If checks fail, the skills array stays empty.

## Neurosurgery-Specific Template Content (SKIL-06)

Based on clinical documentation standards, the three required templates contain these sections:

### Operative Note (Joint Commission Mandated Sections)
1. Date of Procedure (required)
2. Preoperative Diagnosis (required)
3. Postoperative Diagnosis (required)
4. Procedure Performed (required)
5. Surgeon / Assistant(s) (required)
6. Anesthesia (required)
7. Indications (required)
8. Description of Procedure (required) -- step-by-step narrative
9. Findings (required) -- intraoperative findings
10. Specimens (optional)
11. Implants/Hardware (neurosurgery-specific, optional)
12. Estimated Blood Loss (required)
13. Fluids/Drains (neurosurgery-specific, optional)
14. Neuromonitoring (neurosurgery-specific, optional)
15. Complications (required)
16. Disposition (required)

### History & Physical (H&P)
1. Chief Complaint (required)
2. History of Present Illness (required)
3. Past Medical History (required)
4. Past Surgical History (required)
5. Medications (required)
6. Allergies (required)
7. Family History (optional)
8. Social History (optional)
9. Review of Systems (required)
10. Physical Examination (required)
11. Neurological Examination (neurosurgery-specific, required)
12. Imaging/Studies (required)
13. Assessment (required)
14. Plan (required)

### Progress Note (SOAP Format)
1. Date/Time (required)
2. Subjective (required) -- patient-reported symptoms, concerns
3. Objective (required) -- vitals, exam findings, lab results
4. Neurological Status (neurosurgery-specific, required)
5. Assessment (required) -- clinical impression, problem list
6. Plan (required) -- orders, interventions, disposition

## Relationship to Existing Code

### Files to Modify
| File | Change | Reason |
|------|--------|--------|
| `src/credentials/validator.ts` | Replace stub with implementation | SKIL-01: credential gating |
| `src/entry/openclaw.ts` | Add skill loading step after hardening | Wire skills into plugin registration |
| `src/entry/standalone.ts` | Add skill loading to activate result | Expose skills in standalone mode |
| `src/entry/core.ts` | Add skill module re-exports | Complete API surface |
| `openclaw.plugin.json` | Add skills directory paths | Declare plugin skills to OpenClaw |
| `test/unit/credentials/credentials.test.ts` | Replace stub tests with real tests | Test new implementation |

### Files to Create
| File | Purpose |
|------|---------|
| `src/skills/index.ts` | Module re-exports |
| `src/skills/types.ts` | Skill types and interfaces |
| `src/skills/manifest-schema.ts` | TypeBox schema for skill-manifest.json |
| `src/skills/loader.ts` | Skill discovery, validation, loading |
| `src/skills/integrity.ts` | SHA-256 integrity verification |
| `src/skills/version-pin.ts` | Version pinning logic |
| `src/skills/chart-skill/index.ts` | Chart skill registration |
| `src/skills/chart-skill/template-types.ts` | Template interfaces |
| `src/skills/chart-skill/templates/operative-note.ts` | Operative note template |
| `src/skills/chart-skill/templates/h-and-p.ts` | H&P template |
| `src/skills/chart-skill/templates/progress-note.ts` | Progress note template |
| `src/skills/chart-skill/voice-adapter.ts` | Clinical voice application |
| `skills/chart-skill/SKILL.md` | OpenClaw skill file for LLM |
| `skills/chart-skill/skill-manifest.json` | CareAgent skill metadata |
| `test/unit/skills/` | Unit tests for skill module |
| `test/unit/credentials/validator.test.ts` | Credential validator unit tests |
| `test/integration/skills.test.ts` | Integration tests for skill loading pipeline |

### Dependencies Between New and Existing Code
```
skills/loader.ts -----> credentials/validator.ts -----> activation/cans-schema.ts
       |                                                        ^
       +-----> skills/integrity.ts                              |
       |                                                        |
       +-----> skills/manifest-schema.ts                        |
       |                                                        |
       +-----> audit/pipeline.ts                                |
       |                                                        |
       +-----> skills/chart-skill/ -----> cans-schema.ts (ClinicalVoice)
```

## CANS Schema Interaction

The existing `SkillGatingSchema` in `src/activation/cans-schema.ts` is already well-designed for this phase:

```typescript
// Already exists:
export const SkillGatingRuleSchema = Type.Object({
  skill_id: Type.String({ description: 'Skill package identifier' }),
  requires_license: Type.Optional(Type.Array(Type.String())),
  requires_specialty: Type.Optional(Type.Array(Type.String())),
  requires_privilege: Type.Optional(Type.Array(Type.String())),
});

export const SkillGatingSchema = Type.Object({
  rules: Type.Array(SkillGatingRuleSchema),
});
```

The `CANSDocument.skills` field is `Type.Optional(SkillGatingSchema)`, so existing CANS.md files without skill gating rules remain valid. The credential validator checks both the skill manifest requirements AND any matching CANS.md `skills.rules` entry.

## Audit Events for SKIL-07

All skill lifecycle events must be audit-logged:

| Event | Action | Outcome | Details |
|-------|--------|---------|---------|
| Skill discovered | `skill_discovery` | `active` | `{ skill_id, version, directory }` |
| Credential check passed | `skill_credential_check` | `allowed` | `{ skill_id, provider, license, specialty }` |
| Credential check failed | `skill_credential_check` | `denied` | `{ skill_id, missing_credentials, reason }` |
| Integrity check passed | `skill_integrity_check` | `allowed` | `{ skill_id, version }` |
| Integrity check failed | `skill_integrity_check` | `denied` | `{ skill_id, reason, expected_hash, actual_hash }` |
| Skill loaded | `skill_load` | `allowed` | `{ skill_id, version }` |
| Skill blocked | `skill_load` | `denied` | `{ skill_id, reason }` |
| Skill invoked (chart generation) | `skill_usage` | `allowed` | `{ skill_id, template_id, provider }` |
| Version pin checked | `skill_version_check` | `allowed` or `denied` | `{ skill_id, pinned_version, available_version }` |

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/credentials/types.ts`, `src/credentials/validator.ts` -- CredentialValidator interface
- Existing codebase: `src/activation/cans-schema.ts` -- SkillGatingSchema, ClinicalVoiceSchema
- Existing codebase: `src/activation/cans-integrity.ts` -- computeHash pattern for reuse
- Existing codebase: `src/hardening/engine.ts` -- engine activation and audit logging patterns
- Existing codebase: `src/audit/pipeline.ts` -- AuditPipeline API
- Existing codebase: `src/entry/openclaw.ts`, `src/entry/standalone.ts` -- entry point wiring patterns
- OpenClaw Skills Documentation: https://docs.openclaw.ai/tools/skills -- SKILL.md format, plugin skill loading
- DeepWiki OpenClaw Skills System: https://deepwiki.com/openclaw/openclaw/6.4-skills-system -- skill architecture details

### Secondary (MEDIUM confidence)
- Joint Commission operative note requirements: https://pmc.ncbi.nlm.nih.gov/articles/PMC4781788/ -- 11 required elements
- Heidi Health operative note template: https://www.heidihealth.com/en-us/blog/operative-note-template-with-examples
- AI Clinical Documentation Guide: https://www.sully.ai/blog/ai-clinical-documentation-the-complete-guide-for-healthcare-organizations-in-2025
- Node.js experimental integrity policies: https://snyk.io/blog/introducing-experimental-integrity-policies-to-node-js/

### Tertiary (LOW confidence)
- None -- all findings verified through codebase analysis or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all tools already proven in Phases 1-3
- Architecture: HIGH -- extends proven patterns (integrity checking, credential types, audit logging); OpenClaw skill system well-documented
- Clinical templates: HIGH -- operative note sections based on Joint Commission mandates; H&P and progress note sections based on standard medical documentation practice
- Pitfalls: HIGH -- derived from codebase analysis and prior phase experience

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable -- no rapidly-moving external dependencies)
