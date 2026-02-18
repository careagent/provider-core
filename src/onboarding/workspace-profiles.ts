/**
 * Workspace profiles — define which files each platform supplements
 * during onboarding.
 *
 * Each profile lists the workspace files to write and how to generate
 * clinical content for them. This makes workspace supplementation
 * configurable by platform instead of hardcoded to OpenClaw's
 * SOUL.md/AGENTS.md/USER.md layout.
 */

import type { CANSDocument } from '../activation/cans-schema.js';
import {
  generateSoulContent,
  generateAgentsContent,
  generateUserContent,
} from './workspace-content.js';

/** Specification for a single workspace file to supplement. */
export interface WorkspaceFileSpec {
  filename: string;
  generateContent: (data: CANSDocument, philosophy: string) => string;
}

/** A workspace profile defines which files a platform uses and how to populate them. */
export interface WorkspaceProfile {
  platform: string;
  files: WorkspaceFileSpec[];
}

/** OpenClaw profile — supplements SOUL.md, AGENTS.md, and USER.md. */
export const openclawProfile: WorkspaceProfile = {
  platform: 'openclaw',
  files: [
    {
      filename: 'SOUL.md',
      generateContent: (data, philosophy) => generateSoulContent(data, philosophy),
    },
    {
      filename: 'AGENTS.md',
      generateContent: (data) => generateAgentsContent(data),
    },
    {
      filename: 'USER.md',
      generateContent: (data) => generateUserContent(data),
    },
  ],
};

/** AGENTS.md standard profile — merges all clinical content into a single AGENTS.md. */
export const agentsStandardProfile: WorkspaceProfile = {
  platform: 'agents-standard',
  files: [
    {
      filename: 'AGENTS.md',
      generateContent: (data, philosophy) => {
        const soul = generateSoulContent(data, philosophy);
        const agents = generateAgentsContent(data);
        const user = generateUserContent(data);
        return `${soul}\n\n${agents}\n\n${user}`;
      },
    },
  ],
};

/** Standalone profile — no workspace file supplementation. */
export const standaloneProfile: WorkspaceProfile = {
  platform: 'standalone',
  files: [],
};

const PROFILES: Record<string, WorkspaceProfile> = {
  openclaw: openclawProfile,
  'agents-standard': agentsStandardProfile,
  standalone: standaloneProfile,
};

/** Returns the workspace profile for the given platform name. Falls back to openclaw. */
export function getWorkspaceProfile(platform: string): WorkspaceProfile {
  return PROFILES[platform] ?? openclawProfile;
}
