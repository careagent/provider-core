/**
 * Clinical skill loader — composes credential validation, version pin
 * enforcement, integrity verification, and manifest parsing into a single
 * loading pipeline with audit logging.
 *
 * Implements SKIL-01 (credential gating), SKIL-02 (regular skills pass),
 * SKIL-03 (integrity verification), SKIL-04 (version pinning), and
 * SKIL-07 (audit logging) through a six-step pipeline:
 *
 * 1. Discovery — scan for skill-manifest.json in subdirectories
 * 2. Manifest validation — parse and validate via TypeBox schema
 * 2.5. Version pin check — block if version != approved_version
 * 3. Credential check — validate provider credentials against manifest
 * 4. CANS rules augmentation — merge CANS.md skills.rules with manifest
 * 5. Integrity verification — SHA-256 file hash comparison
 * 6. Success — register skill for loading
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CANSDocument } from '../activation/cans-schema.js';
import type { CredentialValidator } from '../credentials/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { SkillManifest, SkillLoadResult } from './types.js';
import { validateManifest } from './manifest-schema.js';
import { verifySkillIntegrity } from './integrity.js';
import { checkVersionPin } from './version-pin.js';

/**
 * Load all clinical skills from a base directory.
 *
 * Scans subdirectories for skill-manifest.json files and runs each through
 * the six-step validation pipeline. Regular OpenClaw skills (directories
 * without a manifest) are silently skipped.
 *
 * @param skillsBaseDir - Root directory containing skill subdirectories
 * @param cans - The provider's CANS document
 * @param validator - Credential validator instance
 * @param audit - Audit pipeline for logging every decision
 * @returns Array of load results (one per clinical skill found)
 */
export function loadClinicalSkills(
  skillsBaseDir: string,
  cans: CANSDocument,
  validator: CredentialValidator,
  audit: AuditPipeline,
): SkillLoadResult[] {
  const results: SkillLoadResult[] = [];

  // Guard: if skills base directory doesn't exist, return empty
  if (!existsSync(skillsBaseDir)) {
    return results;
  }

  let entries;
  try {
    entries = readdirSync(skillsBaseDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dirName = entry.name;
    const skillDir = join(skillsBaseDir, dirName);
    const manifestPath = join(skillDir, 'skill-manifest.json');

    // -----------------------------------------------------------------------
    // Step 1: Discovery — skip directories without a manifest (regular skills)
    // -----------------------------------------------------------------------

    if (!existsSync(manifestPath)) {
      continue;
    }

    audit.log({
      action: 'skill_discovery',
      outcome: 'active',
      details: { skill_id: dirName, directory: skillDir },
    });

    // -----------------------------------------------------------------------
    // Step 2: Manifest validation
    // -----------------------------------------------------------------------

    let manifest: SkillManifest;
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validation = validateManifest(parsed);

      if (!validation.valid) {
        const reason = `Invalid manifest: ${validation.errors.join(', ')}`;
        results.push({ skillId: dirName, loaded: false, reason });
        audit.log({
          action: 'skill_load',
          outcome: 'denied',
          details: { skill_id: dirName, reason },
        });
        continue;
      }

      manifest = validation.manifest;
    } catch (err) {
      const reason = `Invalid manifest: ${err instanceof Error ? err.message : String(err)}`;
      results.push({ skillId: dirName, loaded: false, reason });
      audit.log({
        action: 'skill_load',
        outcome: 'denied',
        details: { skill_id: dirName, reason },
      });
      continue;
    }

    // -----------------------------------------------------------------------
    // Step 2.5: Version pin check (SKIL-04)
    // -----------------------------------------------------------------------

    const pinResult = checkVersionPin(manifest, manifest.version);

    if (pinResult.updateAvailable) {
      const reason = `Version update requires approval: current v${manifest.version}, approved v${manifest.approved_version}`;
      results.push({ skillId: manifest.skill_id, loaded: false, reason });
      audit.log({
        action: 'skill_version_check',
        outcome: 'denied',
        details: {
          skill_id: manifest.skill_id,
          current_version: manifest.version,
          approved_version: manifest.approved_version,
        },
      });
      continue;
    }

    audit.log({
      action: 'skill_version_check',
      outcome: 'allowed',
      details: {
        skill_id: manifest.skill_id,
        version: manifest.version,
        pinned: manifest.pinned,
      },
    });

    // -----------------------------------------------------------------------
    // Step 3: Credential check
    // -----------------------------------------------------------------------

    const credResult = validator.check(cans, {
      degrees: manifest.requires.license,
      specialty: manifest.requires.specialty,
      privilege: manifest.requires.privilege,
    });

    if (!credResult.valid) {
      results.push({
        skillId: manifest.skill_id,
        loaded: false,
        reason: credResult.reason,
      });
      audit.log({
        action: 'skill_credential_check',
        outcome: 'denied',
        details: {
          skill_id: manifest.skill_id,
          missing_credentials: credResult.missingCredentials,
          reason: credResult.reason,
        },
      });
      continue;
    }

    audit.log({
      action: 'skill_credential_check',
      outcome: 'allowed',
      details: {
        skill_id: manifest.skill_id,
        provider: credResult.provider,
        types: credResult.types,
        specialty: credResult.specialty,
      },
    });

    // -----------------------------------------------------------------------
    // Step 4: CANS.md skills.authorized check
    // -----------------------------------------------------------------------

    if (cans.skills.authorized.length > 0 && !cans.skills.authorized.includes(manifest.skill_id)) {
      const reason = `Skill '${manifest.skill_id}' is not in the authorized skills list`;
      results.push({ skillId: manifest.skill_id, loaded: false, reason });
      audit.log({
        action: 'skill_authorization_check',
        outcome: 'denied',
        details: { skill_id: manifest.skill_id, reason },
      });
      continue;
    }

    // -----------------------------------------------------------------------
    // Step 5: Integrity verification (SKIL-03)
    // -----------------------------------------------------------------------

    const integrityResult = verifySkillIntegrity(skillDir, manifest);

    if (!integrityResult.valid) {
      results.push({
        skillId: manifest.skill_id,
        loaded: false,
        reason: integrityResult.reason,
      });
      audit.log({
        action: 'skill_integrity_check',
        outcome: 'denied',
        details: {
          skill_id: manifest.skill_id,
          reason: integrityResult.reason,
        },
      });
      continue;
    }

    audit.log({
      action: 'skill_integrity_check',
      outcome: 'allowed',
      details: {
        skill_id: manifest.skill_id,
        version: manifest.version,
      },
    });

    // -----------------------------------------------------------------------
    // Step 6: Success
    // -----------------------------------------------------------------------

    results.push({
      skillId: manifest.skill_id,
      loaded: true,
      version: manifest.version,
      directory: skillDir,
    });

    audit.log({
      action: 'skill_load',
      outcome: 'allowed',
      details: {
        skill_id: manifest.skill_id,
        version: manifest.version,
      },
    });
  }

  return results;
}
