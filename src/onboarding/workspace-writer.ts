/**
 * Workspace file supplementation writer.
 *
 * Reads existing workspace files and writes/updates CareAgent-managed clinical
 * sections using HTML comment markers for idempotent round-trips.
 *
 * Which files are supplemented is determined by the workspace profile — different
 * platforms use different workspace file layouts (e.g. OpenClaw uses SOUL.md +
 * AGENTS.md + USER.md, the AGENTS.md standard uses a single AGENTS.md).
 *
 * All file writes are atomic: content is written to a .tmp file first,
 * then renamed into place.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { CANSDocument } from '../activation/cans-schema.js';
import type { WorkspaceProfile } from './workspace-profiles.js';
import { openclawProfile } from './workspace-profiles.js';

// ---------------------------------------------------------------------------
// Marker constants
// ---------------------------------------------------------------------------

const BEGIN_MARKER = '<!-- CareAgent: BEGIN -->';
const END_MARKER = '<!-- CareAgent: END -->';

// ---------------------------------------------------------------------------
// supplementFile — pure read-modify function
// ---------------------------------------------------------------------------

/**
 * Given the existing content of a workspace file and a clinical section string,
 * returns the updated file content with the CareAgent markers replaced or
 * appended, preserving all other content.
 */
export function supplementFile(existingContent: string, clinicalSection: string): string {
  const markedSection = `${BEGIN_MARKER}\n${clinicalSection}\n${END_MARKER}`;

  const beginIdx = existingContent.indexOf(BEGIN_MARKER);
  const endIdx = existingContent.indexOf(END_MARKER);

  // Both markers present and END comes after BEGIN — replace between them
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existingContent.slice(0, beginIdx);
    const after = existingContent.slice(endIdx + END_MARKER.length);
    return `${before}${markedSection}${after}`;
  }

  // No markers — check if content is empty/whitespace
  if (existingContent.trim() === '') {
    return `${markedSection}\n`;
  }

  // Content exists but no markers — append with appropriate separator
  const endsWithNewline = existingContent.endsWith('\n');
  const separator = endsWithNewline ? '\n' : '\n\n';
  return `${existingContent}${separator}${markedSection}\n`;
}

// ---------------------------------------------------------------------------
// supplementWorkspaceFiles — reads, supplements, and atomically writes files
// ---------------------------------------------------------------------------

/**
 * Supplements workspace files with clinical content derived from the provided
 * CANS document and philosophy. Which files are written depends on the profile.
 *
 * When no profile is provided, defaults to the OpenClaw profile (SOUL.md,
 * AGENTS.md, USER.md) for backward compatibility.
 *
 * Each file is written atomically via a .tmp rename.
 *
 * @returns The list of filenames that were supplemented.
 */
export function supplementWorkspaceFiles(
  workspacePath: string,
  data: CANSDocument,
  philosophy: string,
  profile?: WorkspaceProfile,
): string[] {
  const resolvedProfile = profile ?? openclawProfile;
  const supplemented: string[] = [];

  for (const { filename, generateContent } of resolvedProfile.files) {
    const filePath = join(workspacePath, filename);
    const existingContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    const clinicalContent = generateContent(data, philosophy);
    const updatedContent = supplementFile(existingContent, clinicalContent);

    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, updatedContent, 'utf-8');
    renameSync(tmpPath, filePath);
    supplemented.push(filename);
  }

  return supplemented;
}
