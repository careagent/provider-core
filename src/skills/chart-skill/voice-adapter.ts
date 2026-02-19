/**
 * Voice adapter — bridges ClinicalVoice (CANS schema) to VoiceDirectives
 * (skill framework types) and generates human-readable voice instructions.
 */

import type { ClinicalVoice } from '../../activation/cans-schema.js';
import type { VoiceDirectives } from '../types.js';

/**
 * Extract VoiceDirectives from a ClinicalVoice configuration.
 *
 * Maps CANS schema field names (snake_case) to skill framework field
 * names (camelCase). Only includes fields that are defined in the input.
 */
export function extractVoiceDirectives(
  voice?: ClinicalVoice | null,
): VoiceDirectives {
  if (!voice) {
    return {};
  }

  return {
    ...(voice.tone !== undefined && { tone: voice.tone }),
    ...(voice.documentation_style !== undefined && {
      documentationStyle: voice.documentation_style,
    }),
    ...(voice.eponyms !== undefined && { useEponyms: voice.eponyms }),
    ...(voice.abbreviations !== undefined && {
      abbreviationStyle: voice.abbreviations,
    }),
  };
}

/**
 * Build a multi-line voice instruction string from VoiceDirectives.
 *
 * Always appends the safety line about clinical content completeness.
 */
export function buildVoiceInstructions(directives: VoiceDirectives): string {
  const lines: string[] = [];

  if (directives.tone) {
    lines.push(`Write in a ${directives.tone} tone.`);
  }

  if (directives.documentationStyle) {
    lines.push(
      `Use ${directives.documentationStyle} documentation style.`,
    );
  }

  if (directives.useEponyms === true) {
    lines.push(
      'Use standard medical eponyms (e.g., Babinski sign, Kernohan notch phenomenon).',
    );
  } else if (directives.useEponyms === false) {
    lines.push('Avoid eponyms; use descriptive terminology.');
  }

  if (directives.abbreviationStyle) {
    lines.push(`Abbreviation style: ${directives.abbreviationStyle}.`);
  }

  lines.push(
    'Voice preferences affect language style only. All required clinical content must be present regardless of voice settings.',
  );

  return lines.join('\n');
}
