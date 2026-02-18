/**
 * Tests for individual stage handler functions in src/onboarding/stages.ts.
 */

import { describe, it, expect } from 'vitest';
import { createMockIO } from '../../../src/cli/io.js';
import { InterviewStage } from '../../../src/onboarding/engine.js';
import type { InterviewState } from '../../../src/onboarding/engine.js';
import {
  welcomeStage,
  identityStage,
  credentialsStage,
  specialtyStage,
  scopeStage,
  philosophyStage,
  voiceStage,
  autonomyStage,
  consentStage,
} from '../../../src/onboarding/stages.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<InterviewState> = {}): InterviewState {
  return {
    stage: InterviewStage.WELCOME,
    data: { version: '1.0' },
    philosophy: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// welcomeStage
// ---------------------------------------------------------------------------

describe('welcomeStage', () => {
  it('advances to IDENTITY after confirmation', async () => {
    const io = createMockIO(['y']);
    const newState = await welcomeStage(makeState(), io);
    expect(newState.stage).toBe(InterviewStage.IDENTITY);
  });

  it('re-prompts if not confirmed then confirms', async () => {
    const io = createMockIO(['n', 'y']);
    const newState = await welcomeStage(makeState(), io);
    expect(newState.stage).toBe(InterviewStage.IDENTITY);
    expect(io.getOutput().some((line) => line.includes('cannot proceed'))).toBe(true);
  });

  it('display output includes "NOT HIPAA compliant"', async () => {
    const io = createMockIO(['y']);
    await welcomeStage(makeState(), io);
    const allOutput = io.getOutput().join('\n');
    expect(allOutput).toContain('NOT HIPAA compliant');
  });
});

// ---------------------------------------------------------------------------
// identityStage
// ---------------------------------------------------------------------------

describe('identityStage', () => {
  it('sets provider.name and advances to CREDENTIALS', async () => {
    const io = createMockIO([
      'Dr. Identity Test', // name
      '',                  // NPI (skip)
    ]);
    const state = makeState({ stage: InterviewStage.IDENTITY });
    const newState = await identityStage(state, io);
    expect(newState.data.provider?.name).toBe('Dr. Identity Test');
    expect(newState.stage).toBe(InterviewStage.CREDENTIALS);
  });

  it('sets npi when 10-digit value provided', async () => {
    const io = createMockIO([
      'Dr. NPI Test',
      '1234567890',
    ]);
    const state = makeState({ stage: InterviewStage.IDENTITY });
    const newState = await identityStage(state, io);
    expect(newState.data.provider?.npi).toBe('1234567890');
  });

  it('omits npi when empty', async () => {
    const io = createMockIO([
      'Dr. No NPI',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.IDENTITY });
    const newState = await identityStage(state, io);
    expect(newState.data.provider).not.toHaveProperty('npi');
  });

  it('re-prompts when NPI is not 10 digits, then accepts valid NPI', async () => {
    const io = createMockIO([
      'Dr. Retry NPI',
      '12345',        // invalid - not 10 digits
      '1234567890',   // valid
    ]);
    const state = makeState({ stage: InterviewStage.IDENTITY });
    const newState = await identityStage(state, io);
    expect(newState.data.provider?.npi).toBe('1234567890');
    expect(io.getOutput().some((line) => line.includes('10 digits'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// credentialsStage
// ---------------------------------------------------------------------------

describe('credentialsStage', () => {
  it('sets license.type to valid literal', async () => {
    // License type index 0 = MD
    const io = createMockIO(['0', 'TX', 'LIC123']);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.license?.type).toBe('MD');
  });

  it('sets license.state as uppercase', async () => {
    // License type 0 = MD, state 'tx' should become 'TX'
    const io = createMockIO(['0', 'tx', 'LIC456']);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.license?.state).toBe('TX');
  });

  it('sets license.verified to false', async () => {
    const io = createMockIO(['0', 'CA', 'LIC789']);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.license?.verified).toBe(false);
  });

  it('advances to SPECIALTY', async () => {
    const io = createMockIO(['0', 'NY', 'LIC101']);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.stage).toBe(InterviewStage.SPECIALTY);
  });
});

// ---------------------------------------------------------------------------
// specialtyStage
// ---------------------------------------------------------------------------

describe('specialtyStage', () => {
  it('sets specialty and splits privileges', async () => {
    const io = createMockIO([
      'Neurosurgery',                          // specialty
      '',                                       // subspecialty (skip)
      '',                                       // institution (skip)
      'brain surgery, spine surgery',           // privileges
      '0',                                      // credential status (active)
    ]);
    const state = makeState({ stage: InterviewStage.SPECIALTY });
    const newState = await specialtyStage(state, io);
    expect(newState.data.provider?.specialty).toBe('Neurosurgery');
    expect(newState.data.provider?.privileges).toEqual(['brain surgery', 'spine surgery']);
  });

  it('omits subspecialty when skipped', async () => {
    const io = createMockIO([
      'Cardiology',
      '',          // subspecialty (skip)
      '',          // institution (skip)
      'cardiac procedures',
      '0',
    ]);
    const state = makeState({ stage: InterviewStage.SPECIALTY });
    const newState = await specialtyStage(state, io);
    expect(newState.data.provider).not.toHaveProperty('subspecialty');
  });

  it('sets subspecialty when provided', async () => {
    const io = createMockIO([
      'Cardiology',
      'Electrophysiology',
      '',
      'cardiac procedures',
      '0',
    ]);
    const state = makeState({ stage: InterviewStage.SPECIALTY });
    const newState = await specialtyStage(state, io);
    expect(newState.data.provider?.subspecialty).toBe('Electrophysiology');
  });

  it('advances to SCOPE', async () => {
    const io = createMockIO([
      'Internal Medicine',
      '',
      '',
      'general care',
      '0',
    ]);
    const state = makeState({ stage: InterviewStage.SPECIALTY });
    const newState = await specialtyStage(state, io);
    expect(newState.stage).toBe(InterviewStage.SCOPE);
  });
});

// ---------------------------------------------------------------------------
// scopeStage
// ---------------------------------------------------------------------------

describe('scopeStage', () => {
  it('splits permitted_actions', async () => {
    const io = createMockIO([
      'chart_note, chart_h_and_p',  // permitted
      '',                            // prohibited (skip)
      '',                            // limitations (skip)
    ]);
    const state = makeState({ stage: InterviewStage.SCOPE });
    const newState = await scopeStage(state, io);
    expect(newState.data.scope?.permitted_actions).toEqual(['chart_note', 'chart_h_and_p']);
  });

  it('omits prohibited_actions when skipped', async () => {
    const io = createMockIO([
      'chart_note',
      '',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.SCOPE });
    const newState = await scopeStage(state, io);
    expect(newState.data.scope).not.toHaveProperty('prohibited_actions');
  });

  it('sets prohibited_actions when provided', async () => {
    const io = createMockIO([
      'chart_note',
      'prescribe_opioids',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.SCOPE });
    const newState = await scopeStage(state, io);
    expect(newState.data.scope?.prohibited_actions).toEqual(['prescribe_opioids']);
  });

  it('advances to PHILOSOPHY', async () => {
    const io = createMockIO([
      'chart_note',
      '',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.SCOPE });
    const newState = await scopeStage(state, io);
    expect(newState.stage).toBe(InterviewStage.PHILOSOPHY);
  });
});

// ---------------------------------------------------------------------------
// philosophyStage
// ---------------------------------------------------------------------------

describe('philosophyStage', () => {
  it('stores philosophy in state.philosophy', async () => {
    const io = createMockIO([
      'Patient-centered evidence-based practice with focus on quality outcomes.',
    ]);
    const state = makeState({ stage: InterviewStage.PHILOSOPHY });
    const newState = await philosophyStage(state, io);
    expect(newState.philosophy).toBe(
      'Patient-centered evidence-based practice with focus on quality outcomes.',
    );
  });

  it('advances to VOICE', async () => {
    const io = createMockIO([
      'My clinical philosophy is comprehensive and holistic in approach.',
    ]);
    const state = makeState({ stage: InterviewStage.PHILOSOPHY });
    const newState = await philosophyStage(state, io);
    expect(newState.stage).toBe(InterviewStage.VOICE);
  });
});

// ---------------------------------------------------------------------------
// voiceStage
// ---------------------------------------------------------------------------

describe('voiceStage', () => {
  it('sets all four clinical_voice fields', async () => {
    const io = createMockIO([
      'formal',  // tone
      '0',       // documentation style (concise)
      'y',       // eponyms
      '0',       // abbreviations (standard)
    ]);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.data.clinical_voice?.tone).toBe('formal');
    expect(newState.data.clinical_voice?.documentation_style).toBe('concise');
    expect(newState.data.clinical_voice?.eponyms).toBe(true);
    expect(newState.data.clinical_voice?.abbreviations).toBe('standard');
  });

  it('omits tone when skipped', async () => {
    const io = createMockIO([
      '',   // tone (skip)
      '1',  // narrative
      'n',  // no eponyms
      '1',  // minimal abbreviations
    ]);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.data.clinical_voice).not.toHaveProperty('tone');
  });

  it('advances to AUTONOMY', async () => {
    const io = createMockIO(['', '0', 'y', '0']);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.stage).toBe(InterviewStage.AUTONOMY);
  });
});

// ---------------------------------------------------------------------------
// autonomyStage
// ---------------------------------------------------------------------------

describe('autonomyStage', () => {
  it('sets chart, order, charge, perform tiers', async () => {
    const io = createMockIO([
      '0',  // chart: autonomous
      '1',  // order: supervised
      '1',  // charge: supervised
      '2',  // perform: manual
    ]);
    const state = makeState({ stage: InterviewStage.AUTONOMY });
    const newState = await autonomyStage(state, io);
    expect(newState.data.autonomy?.chart).toBe('autonomous');
    expect(newState.data.autonomy?.order).toBe('supervised');
    expect(newState.data.autonomy?.charge).toBe('supervised');
    expect(newState.data.autonomy?.perform).toBe('manual');
  });

  it('advances to CONSENT', async () => {
    const io = createMockIO(['0', '1', '1', '2']);
    const state = makeState({ stage: InterviewStage.AUTONOMY });
    const newState = await autonomyStage(state, io);
    expect(newState.stage).toBe(InterviewStage.CONSENT);
  });
});

// ---------------------------------------------------------------------------
// consentStage
// ---------------------------------------------------------------------------

describe('consentStage', () => {
  it('sets all three consent booleans to true', async () => {
    const io = createMockIO(['y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.data.consent?.hipaa_warning_acknowledged).toBe(true);
    expect(newState.data.consent?.synthetic_data_only).toBe(true);
    expect(newState.data.consent?.audit_consent).toBe(true);
  });

  it('re-prompts if any consent refused then accepted', async () => {
    // First HIPAA consent refused, then accepted; others accepted
    const io = createMockIO(['n', 'y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.data.consent?.hipaa_warning_acknowledged).toBe(true);
    expect(io.getOutput().some((line) => line.includes('required to proceed'))).toBe(true);
  });

  it('sets hardening with all flags true', async () => {
    const io = createMockIO(['y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    const h = newState.data.hardening;
    expect(h?.tool_policy_lockdown).toBe(true);
    expect(h?.exec_approval).toBe(true);
    expect(h?.cans_protocol_injection).toBe(true);
    expect(h?.docker_sandbox).toBe(true);
    expect(h?.safety_guard).toBe(true);
    expect(h?.audit_trail).toBe(true);
  });

  it('advances to COMPLETE', async () => {
    const io = createMockIO(['y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.stage).toBe(InterviewStage.COMPLETE);
  });
});
