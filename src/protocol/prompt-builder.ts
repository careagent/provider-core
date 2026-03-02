/**
 * Prompt builder — constructs LLM system prompts and tool definitions
 * for the interaction protocol engine. CareAgent controls the prompt.
 */

import type { Question, Questionnaire } from '@careagent/axon/types';
import type { LLMTool } from './llm-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptContext {
  questionnaire: Questionnaire;
  question: Question;
  validationError?: string;
  questionIndex: number;
  totalQuestions: number;
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

export function buildSystemPrompt(ctx: PromptContext): string {
  const { questionnaire, question, validationError, questionIndex, totalQuestions } = ctx;

  const customPrompt = questionnaire.llm_system_prompt
    ?? `You are a professional healthcare onboarding assistant conducting the "${questionnaire.display_name}" questionnaire. Be warm, professional, and concise.`;

  const progressNote = `Question ${questionIndex + 1} of ${totalQuestions}.`;

  const questionBlock = buildQuestionBlock(question);

  const validationBlock = validationError
    ? `\n## Previous Answer Invalid\n\nThe provider's last answer was not valid: ${validationError}\nPlease ask them to try again with a valid response.\n`
    : '';

  return `${customPrompt}

## Current Question

${progressNote}

${questionBlock}
${validationBlock}
## Instructions

- Present the question naturally in conversation. Do NOT just repeat the raw question text.
- If the question has options, present them clearly.
- Use the submit_answer tool to submit the provider's structured answer.
- The display_text field should contain your conversational response to the user.
- Do NOT ask multiple questions at once.
- Do NOT make up answers. Extract the answer from the provider's message.`;
}

// ---------------------------------------------------------------------------
// buildQuestionBlock
// ---------------------------------------------------------------------------

function buildQuestionBlock(question: Question): string {
  const lines: string[] = [];

  lines.push(`**Question ID:** ${question.id}`);
  lines.push(`**Text:** ${question.text}`);
  lines.push(`**Answer Type:** ${question.answer_type}`);
  lines.push(`**Required:** ${question.required}`);

  if (question.options && question.options.length > 0) {
    lines.push('\n**Options:**');
    for (const opt of question.options) {
      const desc = opt.description ? ` — ${opt.description}` : '';
      lines.push(`- \`${opt.value}\`: ${opt.label}${desc}`);
    }
  }

  if (question.validation) {
    const v = question.validation;
    const constraints: string[] = [];
    if (v.pattern) constraints.push(`pattern: ${v.pattern}`);
    if (v.min_length !== undefined) constraints.push(`min length: ${v.min_length}`);
    if (v.max_length !== undefined) constraints.push(`max length: ${v.max_length}`);
    if (constraints.length > 0) {
      lines.push(`\n**Validation:** ${constraints.join(', ')}`);
    }
  }

  if (question.llm_guidance) {
    lines.push(`\n**Guidance:** ${question.llm_guidance}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildAnswerTool
// ---------------------------------------------------------------------------

export function buildAnswerTool(question: Question): LLMTool {
  return {
    name: 'submit_answer',
    description: `Submit the provider's answer to question "${question.id}": ${question.text}`,
    input_schema: {
      type: 'object',
      properties: {
        value: buildValueSchema(question),
        display_text: {
          type: 'string',
          description: 'Conversational message to show the user alongside the answer confirmation',
        },
      },
      required: ['value', 'display_text'],
    },
  };
}

// ---------------------------------------------------------------------------
// buildValueSchema
// ---------------------------------------------------------------------------

function buildValueSchema(question: Question): Record<string, unknown> {
  switch (question.answer_type) {
    case 'boolean':
      return { type: 'boolean' };

    case 'single_select': {
      const values = (question.options ?? []).map((o) => o.value);
      return { type: 'string', enum: values };
    }

    case 'multi_select': {
      const values = (question.options ?? []).map((o) => o.value);
      return {
        type: 'array',
        items: { type: 'string', enum: values },
      };
    }

    case 'text':
      return { type: 'string' };

    case 'number':
      return { type: 'number' };

    case 'date':
      return { type: 'string', format: 'date' };

    default:
      return { type: 'string' };
  }
}
