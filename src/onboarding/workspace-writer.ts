/**
 * Workspace file supplementation writer.
 *
 * Reads existing SOUL.md, AGENTS.md, and USER.md files in the provider's
 * workspace and writes/updates CareAgent-managed clinical sections using
 * HTML comment markers for idempotent round-trips.
 *
 * All file writes are atomic: content is written to a .tmp file first,
 * then renamed into place.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { CANSDocument } from '../activation/cans-schema.js';
import {
  generateSoulContent,
  generateAgentsContent,
  generateUserContent,
} from './workspace-content.js';

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

interface WorkspaceFile {
  filename: string;
  generateContent: () => string;
}

/**
 * Supplements SOUL.md, AGENTS.md, and USER.md in the given workspace path
 * with clinical content derived from the provided CANS document and philosophy.
 * Each file is written atomically via a .tmp rename.
 */
export function supplementWorkspaceFiles(
  workspacePath: string,
  data: CANSDocument,
  philosophy: string,
): void {
  const files: WorkspaceFile[] = [
    {
      filename: 'SOUL.md',
      generateContent: () => generateSoulContent(data, philosophy),
    },
    {
      filename: 'AGENTS.md',
      generateContent: () => generateAgentsContent(data),
    },
    {
      filename: 'USER.md',
      generateContent: () => generateUserContent(data),
    },
  ];

  for (const { filename, generateContent } of files) {
    const filePath = join(workspacePath, filename);
    const existingContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    const clinicalContent = generateContent();
    const updatedContent = supplementFile(existingContent, clinicalContent);

    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, updatedContent, 'utf-8');
    renameSync(tmpPath, filePath);
  }
}
