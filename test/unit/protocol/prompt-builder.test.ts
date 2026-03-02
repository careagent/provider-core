/**
 * Tests for prompt builder — system prompt construction, tool schemas, re-ask.
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildAnswerTool } from '../../../src/protocol/prompt-builder.js';
import type { Question, Questionnaire } from '@careagent/axon/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    provider_type: 'test',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Test Questionnaire',
    description: 'A test',
    questions: [],
    ...overrides,
  } as Questionnaire;
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    text: 'Do you have degrees?',
    answer_type: 'boolean',
    required: true,
    ...overrides,
  } as Question;
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('includes questionnaire display name in default prompt', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire({ display_name: 'Physician Onboarding' }),
      question: makeQuestion(),
      questionIndex: 0,
      totalQuestions: 10,
    });
    expect(prompt).toContain('Physician Onboarding');
  });

  it('uses custom llm_system_prompt when provided', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire({
        llm_system_prompt: 'You are a custom assistant.',
      }),
      question: makeQuestion(),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).toContain('You are a custom assistant.');
    expect(prompt).not.toContain('healthcare onboarding assistant');
  });

  it('includes question progress', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion(),
      questionIndex: 3,
      totalQuestions: 10,
    });
    expect(prompt).toContain('Question 4 of 10');
  });

  it('includes question details', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion({ id: 'has_degrees', text: 'Do you have medical degrees?' }),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).toContain('has_degrees');
    expect(prompt).toContain('Do you have medical degrees?');
    expect(prompt).toContain('boolean');
  });

  it('includes options for select questions', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion({
        answer_type: 'single_select',
        options: [
          { value: 'academic', label: 'Academic/Teaching', description: 'University' },
          { value: 'private', label: 'Private Practice' },
        ],
      }),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).toContain('academic');
    expect(prompt).toContain('Academic/Teaching');
    expect(prompt).toContain('University');
    expect(prompt).toContain('Private Practice');
  });

  it('includes validation constraints', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion({
        answer_type: 'text',
        validation: { pattern: '^\\d{10}$', min_length: 10 },
      }),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).toContain('pattern');
    expect(prompt).toContain('min length: 10');
  });

  it('includes validation error when re-asking', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion(),
      questionIndex: 0,
      totalQuestions: 5,
      validationError: 'Expected yes/no',
    });
    expect(prompt).toContain('Previous Answer Invalid');
    expect(prompt).toContain('Expected yes/no');
  });

  it('excludes validation error block when no error', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion(),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).not.toContain('Previous Answer Invalid');
  });

  it('includes llm_guidance when present', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion({ llm_guidance: 'Present this warmly and casually.' }),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).toContain('Present this warmly and casually.');
  });

  it('includes instructions for the LLM', () => {
    const prompt = buildSystemPrompt({
      questionnaire: makeQuestionnaire(),
      question: makeQuestion(),
      questionIndex: 0,
      totalQuestions: 5,
    });
    expect(prompt).toContain('submit_answer');
    expect(prompt).toContain('Do NOT ask multiple questions');
  });
});

// ---------------------------------------------------------------------------
// buildAnswerTool
// ---------------------------------------------------------------------------

describe('buildAnswerTool', () => {
  it('creates tool with correct name', () => {
    const tool = buildAnswerTool(makeQuestion());
    expect(tool.name).toBe('submit_answer');
  });

  it('includes question id in description', () => {
    const tool = buildAnswerTool(makeQuestion({ id: 'has_degrees' }));
    expect(tool.description).toContain('has_degrees');
  });

  it('boolean value schema', () => {
    const tool = buildAnswerTool(makeQuestion({ answer_type: 'boolean' }));
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.value).toEqual({ type: 'boolean' });
  });

  it('single_select value schema with enum', () => {
    const tool = buildAnswerTool(makeQuestion({
      answer_type: 'single_select',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    }));
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.value).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('multi_select value schema with array of enums', () => {
    const tool = buildAnswerTool(makeQuestion({
      answer_type: 'multi_select',
      options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
      ],
    }));
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.value).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['x', 'y'] },
    });
  });

  it('text value schema', () => {
    const tool = buildAnswerTool(makeQuestion({ answer_type: 'text' }));
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.value).toEqual({ type: 'string' });
  });

  it('number value schema', () => {
    const tool = buildAnswerTool(makeQuestion({ answer_type: 'number' }));
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.value).toEqual({ type: 'number' });
  });

  it('date value schema', () => {
    const tool = buildAnswerTool(makeQuestion({ answer_type: 'date' }));
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.value).toEqual({ type: 'string', format: 'date' });
  });

  it('includes display_text field', () => {
    const tool = buildAnswerTool(makeQuestion());
    const props = (tool.input_schema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props.display_text).toBeDefined();
    expect((props.display_text as Record<string, unknown>).type).toBe('string');
  });

  it('requires value and display_text', () => {
    const tool = buildAnswerTool(makeQuestion());
    expect((tool.input_schema as Record<string, unknown>).required).toEqual(['value', 'display_text']);
  });
});
