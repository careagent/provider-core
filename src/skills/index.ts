/**
 * Skills module — public API re-exports for the clinical skill framework.
 *
 * Provides skill manifest validation, integrity verification, version
 * pinning, the clinical skill loader, chart-skill templates, and voice
 * adaptation.
 */

// Types
export type {
  SkillManifest,
  SkillLoadResult,
  ChartTemplate,
  TemplateSection,
  VoiceDirectives,
} from './types.js';

// Manifest validation
export { SkillManifestSchema, validateManifest } from './manifest-schema.js';

// Integrity
export {
  computeSkillFileHash,
  computeSkillChecksums,
  verifySkillIntegrity,
} from './integrity.js';

// Version pinning
export { checkVersionPin, approveVersion } from './version-pin.js';

// Loader
export { loadClinicalSkills } from './loader.js';

// Chart-skill
export {
  getTemplate,
  getAllTemplates,
  CHART_SKILL_ID,
  buildChartSkillInstructions,
} from './chart-skill/index.js';
export {
  extractVoiceDirectives,
  buildVoiceInstructions,
} from './chart-skill/voice-adapter.js';
