/**
 * Version pinning logic for clinical skills.
 *
 * Clinical skills do not auto-update. The provider must explicitly approve
 * version changes before they take effect (SKIL-04).
 */

import type { SkillManifest } from './types.js';

export interface VersionPinResult {
  pinned: boolean;
  currentVersion: string;
  approvedVersion: string;
  updateAvailable: boolean;
  availableVersion?: string;
}

/**
 * Check whether a version update is available for a pinned skill.
 *
 * A skill reports updateAvailable: true only when:
 * - manifest.pinned is true
 * - availableVersion is provided
 * - availableVersion differs from manifest.approved_version
 */
export function checkVersionPin(
  manifest: SkillManifest,
  availableVersion?: string,
): VersionPinResult {
  const updateAvailable =
    manifest.pinned === true &&
    availableVersion !== undefined &&
    availableVersion !== manifest.approved_version;

  return {
    pinned: manifest.pinned,
    currentVersion: manifest.version,
    approvedVersion: manifest.approved_version,
    updateAvailable,
    ...(availableVersion !== undefined ? { availableVersion } : {}),
  };
}

/**
 * Approve a new version for a skill.
 *
 * Returns a new manifest object with updated version fields.
 * Does NOT mutate the input manifest.
 */
export function approveVersion(
  manifest: SkillManifest,
  newVersion: string,
): SkillManifest {
  return {
    ...manifest,
    requires: { ...manifest.requires },
    files: { ...manifest.files },
    version: newVersion,
    approved_version: newVersion,
  };
}
