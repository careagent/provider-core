/**
 * Answer validator — deterministic validation with zero LLM involvement.
 * Validates raw user input against question schema constraints.
 */

import type { Question } from '@careagent/axon/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  value?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// validateAnswer
// ---------------------------------------------------------------------------

export function validateAnswer(question: Question, rawInput: string): ValidationResult {
  const input = rawInput.trim();

  switch (question.answer_type) {
    case 'boolean':
      return validateBoolean(input);
    case 'single_select':
      return validateSingleSelect(input, question);
    case 'multi_select':
      return validateMultiSelect(input, question);
    case 'text':
      return validateText(input, question);
    case 'number':
      return validateNumber(input, question);
    case 'date':
      return validateDate(input);
    default:
      return { valid: false, error: `Unknown answer type: ${question.answer_type as string}` };
  }
}

// ---------------------------------------------------------------------------
// Type-specific validators
// ---------------------------------------------------------------------------

function validateBoolean(input: string): ValidationResult {
  const lower = input.toLowerCase();
  const trueValues = ['yes', 'y', 'true', '1'];
  const falseValues = ['no', 'n', 'false', '0'];

  if (trueValues.includes(lower)) return { valid: true, value: true };
  if (falseValues.includes(lower)) return { valid: true, value: false };
  return { valid: false, error: 'Expected yes/no, y/n, or true/false' };
}

function validateSingleSelect(input: string, question: Question): ValidationResult {
  if (!question.options || question.options.length === 0) {
    return { valid: false, error: 'No options defined for single_select question' };
  }

  const lower = input.toLowerCase();

  // Match by value (exact, case-insensitive)
  for (const opt of question.options) {
    if (opt.value.toLowerCase() === lower) {
      return { valid: true, value: opt.value };
    }
  }

  // Match by label (case-insensitive)
  for (const opt of question.options) {
    if (opt.label.toLowerCase() === lower) {
      return { valid: true, value: opt.value };
    }
  }

  const validOptions = question.options.map((o) => o.label).join(', ');
  return { valid: false, error: `Invalid selection. Valid options: ${validOptions}` };
}

function validateMultiSelect(input: string, question: Question): ValidationResult {
  if (!question.options || question.options.length === 0) {
    return { valid: false, error: 'No options defined for multi_select question' };
  }

  const parts = input.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) {
    return { valid: false, error: 'At least one selection is required' };
  }

  const values: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    let matched = false;

    for (const opt of question.options) {
      if (opt.value.toLowerCase() === lower || opt.label.toLowerCase() === lower) {
        values.push(opt.value);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const validOptions = question.options.map((o) => o.label).join(', ');
      return { valid: false, error: `Invalid selection "${part}". Valid options: ${validOptions}` };
    }
  }

  return { valid: true, value: values };
}

function validateText(input: string, question: Question): ValidationResult {
  const validation = question.validation;

  if (validation?.min_length !== undefined && input.length < validation.min_length) {
    return { valid: false, error: `Minimum length is ${validation.min_length} characters` };
  }

  if (validation?.max_length !== undefined && input.length > validation.max_length) {
    return { valid: false, error: `Maximum length is ${validation.max_length} characters` };
  }

  if (validation?.pattern) {
    const regex = new RegExp(validation.pattern);
    if (!regex.test(input)) {
      return { valid: false, error: `Input must match pattern: ${validation.pattern}` };
    }
  }

  return { valid: true, value: input };
}

function validateNumber(input: string, question: Question): ValidationResult {
  const num = Number(input);
  if (!Number.isFinite(num)) {
    return { valid: false, error: 'Expected a valid number' };
  }

  const validation = question.validation;

  // Use min_length/max_length as min/max bounds for numbers
  if (validation?.min_length !== undefined && num < validation.min_length) {
    return { valid: false, error: `Value must be at least ${validation.min_length}` };
  }

  if (validation?.max_length !== undefined && num > validation.max_length) {
    return { valid: false, error: `Value must be at most ${validation.max_length}` };
  }

  return { valid: true, value: num };
}

function validateDate(input: string): ValidationResult {
  // Accept ISO 8601 date (YYYY-MM-DD) or full ISO timestamp
  const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  if (!dateRegex.test(input)) {
    return { valid: false, error: 'Expected ISO 8601 date format (YYYY-MM-DD)' };
  }

  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    return { valid: false, error: 'Invalid date value' };
  }

  return { valid: true, value: input };
}
