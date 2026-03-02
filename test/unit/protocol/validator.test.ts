/**
 * Tests for answer validator — each answer type, edge cases, boundary values.
 */

import { describe, it, expect } from 'vitest';
import { validateAnswer } from '../../../src/protocol/validator.js';
import type { Question } from '@careagent/axon/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'test',
    text: 'Test?',
    answer_type: 'boolean',
    required: true,
    ...overrides,
  } as Question;
}

// ---------------------------------------------------------------------------
// Boolean
// ---------------------------------------------------------------------------

describe('Boolean validation', () => {
  const q = makeQuestion({ answer_type: 'boolean' });

  it.each(['yes', 'Yes', 'YES', 'y', 'Y', 'true', 'True', '1'])(
    'accepts truthy value: %s',
    (input) => {
      const result = validateAnswer(q, input);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(true);
    },
  );

  it.each(['no', 'No', 'NO', 'n', 'N', 'false', 'False', '0'])(
    'accepts falsy value: %s',
    (input) => {
      const result = validateAnswer(q, input);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(false);
    },
  );

  it('rejects ambiguous input', () => {
    const result = validateAnswer(q, 'maybe');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('yes/no');
  });

  it('trims whitespace', () => {
    const result = validateAnswer(q, '  yes  ');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Single Select
// ---------------------------------------------------------------------------

describe('Single select validation', () => {
  const q = makeQuestion({
    answer_type: 'single_select',
    options: [
      { value: 'academic', label: 'Academic/Teaching' },
      { value: 'private', label: 'Private Practice' },
      { value: 'hospital', label: 'Hospital-Employed' },
    ],
  });

  it('matches by value', () => {
    const result = validateAnswer(q, 'academic');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('academic');
  });

  it('matches by value case-insensitively', () => {
    const result = validateAnswer(q, 'Academic');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('academic');
  });

  it('matches by label', () => {
    const result = validateAnswer(q, 'Private Practice');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('private');
  });

  it('matches by label case-insensitively', () => {
    const result = validateAnswer(q, 'hospital-employed');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('hospital');
  });

  it('rejects invalid option', () => {
    const result = validateAnswer(q, 'government');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid selection');
  });

  it('rejects empty input', () => {
    const result = validateAnswer(q, '');
    expect(result.valid).toBe(false);
  });

  it('fails when no options defined', () => {
    const noOpts = makeQuestion({ answer_type: 'single_select' });
    const result = validateAnswer(noOpts, 'anything');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No options');
  });
});

// ---------------------------------------------------------------------------
// Multi Select
// ---------------------------------------------------------------------------

describe('Multi select validation', () => {
  const q = makeQuestion({
    answer_type: 'multi_select',
    options: [
      { value: 'chart', label: 'Chart' },
      { value: 'order', label: 'Order' },
      { value: 'educate', label: 'Educate' },
    ],
  });

  it('accepts single value', () => {
    const result = validateAnswer(q, 'chart');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['chart']);
  });

  it('accepts comma-separated values', () => {
    const result = validateAnswer(q, 'chart, order, educate');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['chart', 'order', 'educate']);
  });

  it('matches by label', () => {
    const result = validateAnswer(q, 'Chart, Educate');
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['chart', 'educate']);
  });

  it('rejects any invalid value in the list', () => {
    const result = validateAnswer(q, 'chart, invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('invalid');
  });

  it('rejects empty input', () => {
    const result = validateAnswer(q, '');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('At least one');
  });
});

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

describe('Text validation', () => {
  it('accepts text with no constraints', () => {
    const q = makeQuestion({ answer_type: 'text' });
    const result = validateAnswer(q, 'Hello world');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('Hello world');
  });

  it('enforces min_length', () => {
    const q = makeQuestion({
      answer_type: 'text',
      validation: { min_length: 10 },
    });
    const result = validateAnswer(q, 'short');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Minimum length');
  });

  it('enforces max_length', () => {
    const q = makeQuestion({
      answer_type: 'text',
      validation: { max_length: 5 },
    });
    const result = validateAnswer(q, 'too long input');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum length');
  });

  it('enforces pattern', () => {
    const q = makeQuestion({
      answer_type: 'text',
      validation: { pattern: '^\\d{10}$' },
    });

    expect(validateAnswer(q, '1234567890').valid).toBe(true);
    expect(validateAnswer(q, '12345').valid).toBe(false);
  });

  it('DEA number pattern validation', () => {
    const q = makeQuestion({
      answer_type: 'text',
      validation: { pattern: '^[A-Z]{2}\\d{7}$' },
    });

    expect(validateAnswer(q, 'AB1234567').valid).toBe(true);
    expect(validateAnswer(q, 'ab1234567').valid).toBe(false);
    expect(validateAnswer(q, 'A1234567').valid).toBe(false);
  });

  it('trims whitespace before validation', () => {
    const q = makeQuestion({
      answer_type: 'text',
      validation: { min_length: 5 },
    });
    const result = validateAnswer(q, '  hello  ');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

describe('Number validation', () => {
  it('accepts valid integers', () => {
    const q = makeQuestion({ answer_type: 'number' });
    const result = validateAnswer(q, '42');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(42);
  });

  it('accepts valid decimals', () => {
    const q = makeQuestion({ answer_type: 'number' });
    const result = validateAnswer(q, '3.14');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(3.14);
  });

  it('accepts negative numbers', () => {
    const q = makeQuestion({ answer_type: 'number' });
    const result = validateAnswer(q, '-5');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(-5);
  });

  it('rejects non-numeric input', () => {
    const q = makeQuestion({ answer_type: 'number' });
    const result = validateAnswer(q, 'abc');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('valid number');
  });

  it('rejects NaN', () => {
    const q = makeQuestion({ answer_type: 'number' });
    const result = validateAnswer(q, 'NaN');
    expect(result.valid).toBe(false);
  });

  it('rejects Infinity', () => {
    const q = makeQuestion({ answer_type: 'number' });
    const result = validateAnswer(q, 'Infinity');
    expect(result.valid).toBe(false);
  });

  it('enforces min bound via min_length', () => {
    const q = makeQuestion({
      answer_type: 'number',
      validation: { min_length: 0 },
    });
    expect(validateAnswer(q, '-1').valid).toBe(false);
    expect(validateAnswer(q, '0').valid).toBe(true);
  });

  it('enforces max bound via max_length', () => {
    const q = makeQuestion({
      answer_type: 'number',
      validation: { max_length: 100 },
    });
    expect(validateAnswer(q, '101').valid).toBe(false);
    expect(validateAnswer(q, '100').valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

describe('Date validation', () => {
  it('accepts YYYY-MM-DD format', () => {
    const q = makeQuestion({ answer_type: 'date' });
    const result = validateAnswer(q, '2026-03-02');
    expect(result.valid).toBe(true);
    expect(result.value).toBe('2026-03-02');
  });

  it('accepts full ISO 8601 timestamp', () => {
    const q = makeQuestion({ answer_type: 'date' });
    const result = validateAnswer(q, '2026-03-02T10:30:00Z');
    expect(result.valid).toBe(true);
  });

  it('accepts ISO with timezone offset', () => {
    const q = makeQuestion({ answer_type: 'date' });
    const result = validateAnswer(q, '2026-03-02T10:30:00+05:30');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid date format', () => {
    const q = makeQuestion({ answer_type: 'date' });
    const result = validateAnswer(q, 'March 2, 2026');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ISO 8601');
  });

  it('rejects empty string', () => {
    const q = makeQuestion({ answer_type: 'date' });
    const result = validateAnswer(q, '');
    expect(result.valid).toBe(false);
  });
});
