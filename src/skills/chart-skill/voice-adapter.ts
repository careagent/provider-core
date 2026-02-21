/**
 * Voice adapter — bridges Voice (CANS schema v2) to VoiceDirectives
 * (skill framework types) and generates human-readable voice instructions.
 *
 * In v2, Voice maps to 7 atomic actions (chart, order, charge, perform,
 * interpret, educate, coordinate). For the chart skill, we extract the
 * chart-specific directive.
 */

import type { Voice } from '../../activation/cans-schema.js';
import type { VoiceDirectives } from '../types.js';

/**
 * Extract VoiceDirectives from a Voice configuration.
 *
 * In v2, the Voice schema contains per-action string directives.
 * For backward compatibility with the VoiceDirectives interface,
 * we map the chart action directive to the tone field.
 */
export function extractVoiceDirectives(
  voice?: Voice | null,
): VoiceDirectives {
  if (!voice) {
    return {};
  }

  return {
    ...(voice.chart !== undefined && { tone: voice.chart }),
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
