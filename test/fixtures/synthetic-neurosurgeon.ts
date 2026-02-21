/**
 * Synthetic neurosurgeon fixture for integration tests.
 *
 * Provides a realistic neurosurgeon persona extending validCANSData
 * with specific credentials, clinical voice settings, and a helper
 * to create fully-formed test workspaces.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validCANSData } from './valid-cans-data.js';
import { stringifyYAML } from '../../src/vendor/yaml/index.js';
import { updateKnownGoodHash } from '../../src/activation/cans-integrity.js';

export const syntheticNeurosurgeonCANS = {
  ...validCANSData,
  provider: {
    ...validCANSData.provider,
    name: 'Dr. Sarah Chen',
    npi: '1234567890',
    types: ['Physician'],
    degrees: ['MD'],
    licenses: ['MD-TX-NS-2024-001'],
    certifications: ['ABNS Board Certified'],
    specialty: 'Neurosurgery',
    subspecialty: 'Spine',
    organizations: [
      {
        name: 'University Medical Center',
        privileges: ['neurosurgical procedures', 'spine surgery', 'craniotomy'],
        primary: true,
      },
    ],
    credential_status: 'active' as const,
  },
  voice: {
    chart: 'formal, structured templates',
    order: 'concise',
  },
};

export const syntheticNeurosurgeonCANSContent = `---\n${stringifyYAML(syntheticNeurosurgeonCANS)}---\n\nDr. Sarah Chen is a board-eligible neurosurgeon specializing in spine surgery at University Medical Center.`;

/**
 * Create a test workspace with CANS.md and seeded integrity hash.
 *
 * 1. Writes CANS.md with syntheticNeurosurgeonCANSContent
 * 2. Creates .careagent/ directory
 * 3. Seeds integrity hash via updateKnownGoodHash
 */
export function createTestWorkspace(dir: string): void {
  writeFileSync(join(dir, 'CANS.md'), syntheticNeurosurgeonCANSContent);
  mkdirSync(join(dir, '.careagent'), { recursive: true });
  updateKnownGoodHash(dir, syntheticNeurosurgeonCANSContent);
}
