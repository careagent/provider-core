/**
 * Skill file integrity verification — SHA-256 checksumming for skill files.
 *
 * Reuses the same node:crypto SHA-256 pattern as src/activation/cans-integrity.ts
 * but operates on skill directories rather than individual CANS.md files.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Compute the SHA-256 hex digest of a single file.
 */
export function computeSkillFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Compute SHA-256 checksums for all files in a skill directory.
 * Skips subdirectories. Returns filenames sorted for deterministic ordering.
 */
export function computeSkillChecksums(
  skillDir: string,
): Record<string, string> {
  const entries = readdirSync(skillDir, { withFileTypes: true });
  const result: Record<string, string> = {};

  const fileNames = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();

  for (const name of fileNames) {
    result[name] = computeSkillFileHash(join(skillDir, name));
  }

  return result;
}

/**
 * Verify skill file integrity against manifest checksums.
 *
 * Compares actual file hashes against the hashes recorded in the manifest.
 * Skips the skill-manifest.json entry itself to avoid self-referential
 * checksum issues (the manifest file changes after hashes are computed).
 *
 * Returns on first mismatch or missing file for fail-fast behavior.
 */
export function verifySkillIntegrity(
  skillDir: string,
  manifest: { files: Record<string, string> },
): { valid: boolean; reason?: string } {
  for (const [filename, expectedHash] of Object.entries(manifest.files)) {
    // Skip self-referential manifest entry
    if (filename === 'skill-manifest.json') {
      continue;
    }

    const filePath = join(skillDir, filename);

    let actualHash: string;
    try {
      actualHash = computeSkillFileHash(filePath);
    } catch {
      return {
        valid: false,
        reason: `Missing skill file: ${filename}`,
      };
    }

    if (actualHash !== expectedHash) {
      return {
        valid: false,
        reason: `Hash mismatch for ${filename}: expected ${expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...`,
      };
    }
  }

  return { valid: true };
}
