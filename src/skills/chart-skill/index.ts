/**
 * Chart skill — clinical documentation generator with template-constrained
 * note generation and provider voice adaptation.
 *
 * Provides three neurosurgery-specific templates (Operative Note, H&P,
 * Progress Note) and a voice adapter that bridges CANS clinical voice
 * settings to template generation instructions.
 */

import type { ClinicalVoice } from '../../activation/cans-schema.js';
import type { ChartTemplate } from '../types.js';
import { operativeNoteTemplate } from './templates/operative-note.js';
import { hAndPTemplate } from './templates/h-and-p.js';
import { progressNoteTemplate } from './templates/progress-note.js';
import {
  extractVoiceDirectives,
  buildVoiceInstructions,
} from './voice-adapter.js';

export const CHART_SKILL_ID = 'chart-skill' as const;

const templateRegistry: Record<string, ChartTemplate> = {
  'operative-note': operativeNoteTemplate,
  'h-and-p': hAndPTemplate,
  'progress-note': progressNoteTemplate,
};

/**
 * Look up a template by its templateId.
 */
export function getTemplate(templateId: string): ChartTemplate | undefined {
  return templateRegistry[templateId];
}

/**
 * Return all available chart templates.
 */
export function getAllTemplates(): ChartTemplate[] {
  return Object.values(templateRegistry);
}

/**
 * Build complete chart-skill instruction text including voice directives
 * and template listings.
 *
 * Used by the skill loader to inject instructions into the LLM system prompt.
 */
export function buildChartSkillInstructions(voice?: ClinicalVoice): string {
  const directives = extractVoiceDirectives(voice);
  const voiceInstructions = buildVoiceInstructions(directives);

  const templateListings = getAllTemplates()
    .map((t) => {
      const requiredSections = t.sections
        .filter((s) => s.required)
        .map((s) => `  - ${s.name}`)
        .join('\n');
      const optionalSections = t.sections
        .filter((s) => !s.required)
        .map((s) => `  - ${s.name}`)
        .join('\n');

      let listing = `### ${t.name} (${t.templateId})\nRequired sections:\n${requiredSections}`;
      if (optionalSections) {
        listing += `\nOptional sections:\n${optionalSections}`;
      }
      return listing;
    })
    .join('\n\n');

  return [
    '## Voice Preferences',
    voiceInstructions,
    '',
    '## Available Templates',
    templateListings,
  ].join('\n');
}

// Re-export for convenience
export { operativeNoteTemplate } from './templates/operative-note.js';
export { hAndPTemplate } from './templates/h-and-p.js';
export { progressNoteTemplate } from './templates/progress-note.js';
export { extractVoiceDirectives, buildVoiceInstructions } from './voice-adapter.js';
