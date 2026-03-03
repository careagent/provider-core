/**
 * Artifact generator — transforms validated questionnaire answers
 * into structured output artifacts (e.g., CANS.md).
 */

import type { Questionnaire, Question } from '@careagent/axon/types';
import { generateCANSContent, type GenerationResult } from '../onboarding/cans-generator.js';
import type { CANSDocument } from '../activation/cans-schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtifactGenerator {
  /** Generate a CANS.md artifact from questionnaire answers. */
  generate(
    answers: Record<string, unknown>,
    questionnaire: Questionnaire,
    baseDocument: Partial<CANSDocument>,
    philosophy: string,
  ): GenerationResult;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCANSArtifactGenerator(): ArtifactGenerator {
  return {
    generate(
      answers: Record<string, unknown>,
      questionnaire: Questionnaire,
      baseDocument: Partial<CANSDocument>,
      philosophy: string,
    ): GenerationResult {
      // Build a CANS document from the base + questionnaire answers
      const doc = mergeAnswersIntoDocument(answers, questionnaire, baseDocument);

      // Validate and generate content
      return generateCANSContent(doc as CANSDocument, philosophy);
    },
  };
}

// ---------------------------------------------------------------------------
// mergeAnswersIntoDocument
// ---------------------------------------------------------------------------

/**
 * Map validated answers to CANSDocument structure using cans_field paths
 * from the questionnaire.
 */
function mergeAnswersIntoDocument(
  answers: Record<string, unknown>,
  questionnaire: Questionnaire,
  base: Partial<CANSDocument>,
): Partial<CANSDocument> {
  const doc = structuredClone(base);
  const permittedActions: string[] = [];

  for (const question of questionnaire.questions) {
    const answer = answers[question.id];
    if (answer === undefined) continue;

    const cansField = question.cans_field;
    if (!cansField) continue;

    // Handle action_assignments — match answer against assignment.answer_value
    if (question.action_assignments) {
      for (const assignment of question.action_assignments) {
        if (String(answer) === assignment.answer_value) {
          permittedActions.push(...assignment.grants);
        }
      }
    }

    // Map answer to CANS field path
    setFieldByPath(doc, cansField, answer, question);
  }

  // Merge permitted actions into scope
  if (permittedActions.length > 0) {
    if (!doc.scope) doc.scope = { permitted_actions: [] };
    const existing = doc.scope.permitted_actions ?? [];
    doc.scope.permitted_actions = [...new Set([...existing, ...permittedActions])];
  }

  // Ensure the base provider type is preserved in types array
  // (additional_types via cans_field would overwrite with only the additional ones)
  if (doc.provider && base.provider) {
    const baseType = base.provider.types?.[0];
    if (baseType && Array.isArray(doc.provider.types) && !doc.provider.types.includes(baseType)) {
      doc.provider.types.unshift(baseType);
    }
  }

  // Remove empty voice section (voice is optional in CANS schema)
  if (doc.voice && typeof doc.voice === 'object' && Object.keys(doc.voice).length === 0) {
    delete (doc as Record<string, unknown>).voice;
  }

  return doc;
}

/**
 * Set a value in a nested object by dot-separated path.
 * Handles the CANS field mapping conventions.
 */
function setFieldByPath(
  doc: Record<string, unknown>,
  path: string,
  value: unknown,
  question: Question,
): void {
  const parts = path.split('.');
  if (parts.length !== 2) return;

  const [section, field] = parts;
  if (!section || !field) return;

  // Skip paths that need complex object construction (handled by caller)
  if (path === 'provider.organizations') return;

  // Skip scope.permitted_actions — handled separately via action_assignments
  if (path === 'scope.permitted_actions') return;

  // Don't overwrite array fields with boolean gate values
  if (isArrayField(path) && typeof value === 'boolean') return;

  // Ensure section exists
  if (!(section in doc) || typeof doc[section] !== 'object' || doc[section] === null) {
    doc[section] = {};
  }

  const sectionObj = doc[section] as Record<string, unknown>;

  // Handle array fields (comma-separated text answers become arrays)
  if (question.answer_type === 'text' && isArrayField(path)) {
    if (typeof value === 'string') {
      sectionObj[field] = value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    } else {
      sectionObj[field] = value;
    }
    return;
  }

  sectionObj[field] = value;
}

/** Fields that are arrays in the CANS schema. */
function isArrayField(path: string): boolean {
  const arrayFields = new Set([
    'provider.types',
    'provider.degrees',
    'provider.licenses',
    'provider.certifications',
    'provider.specialties',
    'provider.subspecialties',
    'skills.authorized',
  ]);
  return arrayFields.has(path);
}
