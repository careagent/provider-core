/**
 * Tests for protocol-based onboarding — full flow with mock LLM + mock MessageIO.
 */

import { describe, it, expect, vi } from 'vitest';
import { runProtocolOnboarding } from '../../../src/onboarding/protocol-onboarding.js';
import { createMockMessageIO } from '../../../src/protocol/message-io.js';
import type { LLMClient, LLMResponse, LLMContentBlock } from '../../../src/protocol/llm-client.js';
import type { Questionnaire } from '@careagent/axon/types';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolUseResponse(
  value: unknown,
  displayText: string,
  toolUseId: string,
): LLMResponse {
  return {
    id: 'msg_test',
    content: [{
      type: 'tool_use',
      id: toolUseId,
      name: 'submit_answer',
      input: { value, display_text: displayText },
    } as LLMContentBlock],
    stop_reason: 'tool_use',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function createSequenceMockLLM(responses: LLMResponse[]): LLMClient {
  let idx = 0;
  return {
    async chat() {
      const r = responses[idx];
      if (!r) throw new Error(`Mock LLM: no response at index ${idx}`);
      idx++;
      return r;
    },
  };
}

function makeMinimalCredentialQuestionnaire(): Questionnaire {
  return {
    id: 'test-credential',
    provider_type: 'physician',
    version: '1.0.0',
    taxonomy_version: '1.0.0',
    display_name: 'Test Credentialing',
    description: 'Minimal credentialing questionnaire',
    questions: [
      {
        id: 'has_degrees',
        text: 'Do you hold medical degrees?',
        answer_type: 'boolean',
        required: true,
        cans_field: 'provider.degrees',
      },
    ],
  } as Questionnaire;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Protocol Onboarding', () => {
  it('runs onboarding and receives messages via MessageIO', async () => {
    const credentialQ = makeMinimalCredentialQuestionnaire();

    // Mock LLM responses:
    // 1. Credentialing: answer has_degrees = true
    // 2. Config: clinical_philosophy
    // 3. Config: voice_chart (skip)
    // 4. Config: voice_educate (skip)
    // 5. Config: voice_interpret (skip)
    // 6-12. Config: 7 autonomy questions
    // 13. Config: consent_confirm
    const llmResponses: LLMResponse[] = [
      // Credential questionnaire — 1 question
      makeToolUseResponse('true', 'You have degrees!', 'tu_1'),
      // Config questionnaire — philosophy
      makeToolUseResponse(
        'Evidence-based practice with patient autonomy',
        'Great philosophy!',
        'tu_2',
      ),
      // voice_chart (optional, skip with empty text answer)
      makeToolUseResponse('Use SOAP format', 'Got it, SOAP format', 'tu_3'),
      // voice_educate (optional)
      makeToolUseResponse('', "No voice directives for education", 'tu_4'),
      // voice_interpret (optional)
      makeToolUseResponse('', "No voice directives for interpretation", 'tu_5'),
      // 7 autonomy questions
      makeToolUseResponse('autonomous', 'Chart: autonomous', 'tu_6'),
      makeToolUseResponse('supervised', 'Order: supervised', 'tu_7'),
      makeToolUseResponse('supervised', 'Charge: supervised', 'tu_8'),
      makeToolUseResponse('manual', 'Perform: manual', 'tu_9'),
      makeToolUseResponse('supervised', 'Interpret: supervised', 'tu_10'),
      makeToolUseResponse('autonomous', 'Educate: autonomous', 'tu_11'),
      makeToolUseResponse('supervised', 'Coordinate: supervised', 'tu_12'),
      // consent
      makeToolUseResponse('true', 'Consent confirmed!', 'tu_13'),
    ];

    const mockLLM = createSequenceMockLLM(llmResponses);

    // MessageIO: simulate user responses for each question
    const userResponses = [
      // Credential Q1 response
      'Yes, I have an MD',
      // Config: philosophy
      'Evidence-based practice with patient autonomy',
      // Config: voice_chart
      'Use SOAP format',
      // Config: voice_educate
      'skip',
      // Config: voice_interpret
      'skip',
      // Config: 7 autonomy answers
      'autonomous', 'supervised', 'supervised', 'manual', 'supervised', 'autonomous', 'supervised',
      // Config: consent
      'yes',
    ];

    const mockIO = createMockMessageIO(userResponses);
    const tmpDir = mkdtempSync(join(tmpdir(), 'protocol-onboarding-'));

    const result = await runProtocolOnboarding({
      llmClient: mockLLM,
      messageIO: mockIO,
      credentialingQuestionnaire: credentialQ,
      workspacePath: tmpDir,
    });

    // Verify messages were sent via MessageIO
    const sentMessages = mockIO.getSentMessages();
    expect(sentMessages.length).toBeGreaterThan(0);

    // Verify the first message contains something (from the engine start)
    expect(sentMessages[0]).toBeTruthy();
  });

  it('calls audit function during onboarding', async () => {
    const credentialQ = makeMinimalCredentialQuestionnaire();
    const auditFn = vi.fn();

    const llmResponses: LLMResponse[] = [
      makeToolUseResponse('true', 'Degrees confirmed!', 'tu_1'),
      makeToolUseResponse('Conservative medicine', 'Philosophy noted', 'tu_2'),
      makeToolUseResponse('', 'Skipped', 'tu_3'),
      makeToolUseResponse('', 'Skipped', 'tu_4'),
      makeToolUseResponse('', 'Skipped', 'tu_5'),
      makeToolUseResponse('autonomous', 'Chart: auto', 'tu_6'),
      makeToolUseResponse('supervised', 'Order: sup', 'tu_7'),
      makeToolUseResponse('supervised', 'Charge: sup', 'tu_8'),
      makeToolUseResponse('manual', 'Perform: man', 'tu_9'),
      makeToolUseResponse('supervised', 'Interpret: sup', 'tu_10'),
      makeToolUseResponse('autonomous', 'Educate: auto', 'tu_11'),
      makeToolUseResponse('supervised', 'Coord: sup', 'tu_12'),
      makeToolUseResponse('true', 'Consent confirmed', 'tu_13'),
    ];

    const mockIO = createMockMessageIO([
      'yes', 'Conservative', 'skip', 'skip', 'skip',
      'autonomous', 'supervised', 'supervised', 'manual', 'supervised', 'autonomous', 'supervised',
      'yes',
    ]);
    const tmpDir = mkdtempSync(join(tmpdir(), 'protocol-audit-'));

    await runProtocolOnboarding({
      llmClient: createSequenceMockLLM(llmResponses),
      messageIO: mockIO,
      credentialingQuestionnaire: credentialQ,
      workspacePath: tmpDir,
      audit: auditFn,
    });

    // Audit should have been called
    expect(auditFn).toHaveBeenCalled();
  });

  it('handles LLM failure gracefully', async () => {
    const credentialQ = makeMinimalCredentialQuestionnaire();

    const failingLLM: LLMClient = {
      async chat() {
        throw new Error('LLM connection refused');
      },
    };

    const mockIO = createMockMessageIO(['yes']);
    const tmpDir = mkdtempSync(join(tmpdir(), 'protocol-fail-'));

    const result = await runProtocolOnboarding({
      llmClient: failingLLM,
      messageIO: mockIO,
      credentialingQuestionnaire: credentialQ,
      workspacePath: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('LLM connection refused');

    // Should send error message to user
    const sent = mockIO.getSentMessages();
    expect(sent.some((m) => m.includes('Onboarding failed'))).toBe(true);
  });
});
