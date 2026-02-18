import { describe, it, expect } from 'vitest';
import {
  openclawProfile,
  agentsStandardProfile,
  standaloneProfile,
  getWorkspaceProfile,
} from '../../../src/onboarding/workspace-profiles.js';
import { validCANSData } from '../../fixtures/valid-cans-data.js';
import type { CANSDocument } from '../../../src/activation/cans-schema.js';

const testData = validCANSData as unknown as CANSDocument;
const testPhilosophy = 'Evidence-based, patient-centered care.';

describe('workspace profiles', () => {
  describe('openclawProfile', () => {
    it('has platform "openclaw"', () => {
      expect(openclawProfile.platform).toBe('openclaw');
    });

    it('supplements SOUL.md, AGENTS.md, and USER.md', () => {
      const filenames = openclawProfile.files.map(f => f.filename);
      expect(filenames).toEqual(['SOUL.md', 'AGENTS.md', 'USER.md']);
    });

    it('generates non-empty content for each file', () => {
      for (const file of openclawProfile.files) {
        const content = file.generateContent(testData, testPhilosophy);
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('agentsStandardProfile', () => {
    it('has platform "agents-standard"', () => {
      expect(agentsStandardProfile.platform).toBe('agents-standard');
    });

    it('supplements only AGENTS.md', () => {
      const filenames = agentsStandardProfile.files.map(f => f.filename);
      expect(filenames).toEqual(['AGENTS.md']);
    });

    it('merges all clinical content into AGENTS.md', () => {
      const content = agentsStandardProfile.files[0].generateContent(testData, testPhilosophy);
      // Should contain content from all three generators
      expect(content).toContain('Clinical Persona');
      expect(content).toContain('Clinical Safety Rules');
      expect(content).toContain('Provider Identity');
    });
  });

  describe('standaloneProfile', () => {
    it('has platform "standalone"', () => {
      expect(standaloneProfile.platform).toBe('standalone');
    });

    it('supplements no files', () => {
      expect(standaloneProfile.files).toHaveLength(0);
    });
  });

  describe('getWorkspaceProfile', () => {
    it('returns openclaw profile for "openclaw"', () => {
      expect(getWorkspaceProfile('openclaw')).toBe(openclawProfile);
    });

    it('returns agents-standard profile for "agents-standard"', () => {
      expect(getWorkspaceProfile('agents-standard')).toBe(agentsStandardProfile);
    });

    it('returns standalone profile for "standalone"', () => {
      expect(getWorkspaceProfile('standalone')).toBe(standaloneProfile);
    });

    it('falls back to openclaw profile for unknown platforms', () => {
      expect(getWorkspaceProfile('unknown')).toBe(openclawProfile);
    });
  });
});
