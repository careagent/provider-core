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
    data: { version: '2.0' },
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
  it('sets types array from comma-separated input', async () => {
    const io = createMockIO([
      'Physician',       // types (required)
      'MD',              // degrees
      'MD-TX-A12345',    // licenses
      'ABNS Board Certified', // certifications
    ]);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.types).toEqual(['Physician']);
  });

  it('sets degrees array from input', async () => {
    const io = createMockIO([
      'Physician',
      'MD, DO',
      'MD-TX-A12345',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.degrees).toEqual(['MD', 'DO']);
  });

  it('sets licenses array from input', async () => {
    const io = createMockIO([
      'Physician',
      'MD',
      'MD-TX-A12345, DO-CA-B99999',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.licenses).toEqual(['MD-TX-A12345', 'DO-CA-B99999']);
  });

  it('sets certifications array from input', async () => {
    const io = createMockIO([
      'Physician',
      '',
      '',
      'ABNS Board Certified',
    ]);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.data.provider?.certifications).toEqual(['ABNS Board Certified']);
  });

  it('advances to SPECIALTY', async () => {
    const io = createMockIO([
      'Physician',
      'MD',
      'MD-TX-A12345',
      '',
    ]);
    const state = makeState({ stage: InterviewStage.CREDENTIALS });
    const newState = await credentialsStage(state, io);
    expect(newState.stage).toBe(InterviewStage.SPECIALTY);
  });
});

// ---------------------------------------------------------------------------
// specialtyStage
// ---------------------------------------------------------------------------

describe('specialtyStage', () => {
  it('sets specialty and organization with privileges', async () => {
    const io = createMockIO([
      'Neurosurgery',                               // specialty (optional)
      '',                                            // subspecialty (skip)
      'University Medical Center',                   // organization name (required)
      '',                                            // department (skip)
      'brain surgery, spine surgery',                // privileges
      '0',                                           // credential status (active)
    ]);
    const state = makeState({ stage: InterviewStage.SPECIALTY });
    const newState = await specialtyStage(state, io);
    expect(newState.data.provider?.specialty).toBe('Neurosurgery');
    expect(newState.data.provider?.organizations).toEqual([
      { name: 'University Medical Center', privileges: ['brain surgery', 'spine surgery'], primary: true },
    ]);
  });

  it('omits specialty when skipped', async () => {
    const io = createMockIO([
      '',                           // specialty (skip)
      '',                           // subspecialty (skip)
      'Community Clinic',           // organization name
      '',                           // department (skip)
      '',                           // privileges (skip)
      '0',                          // credential status
    ]);
    const state = makeState({ stage: InterviewStage.SPECIALTY });
    const newState = await specialtyStage(state, io);
    expect(newState.data.provider).not.toHaveProperty('specialty');
  });

  it('omits subspecialty when skipped', async () => {
    const io = createMockIO([
      'Cardiology',
      '',                           // subspecialty (skip)
      'Heart Hospital',
      '',
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
      'Heart Hospital',
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
      'Community Clinic',
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
    ]);
    const state = makeState({ stage: InterviewStage.SCOPE });
    const newState = await scopeStage(state, io);
    expect(newState.data.scope?.permitted_actions).toEqual(['chart_note', 'chart_h_and_p']);
  });

  it('sets single permitted action', async () => {
    const io = createMockIO([
      'chart_note',
    ]);
    const state = makeState({ stage: InterviewStage.SCOPE });
    const newState = await scopeStage(state, io);
    expect(newState.data.scope?.permitted_actions).toEqual(['chart_note']);
  });

  it('advances to PHILOSOPHY', async () => {
    const io = createMockIO([
      'chart_note',
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
  it('sets voice directives for all 7 actions', async () => {
    const io = createMockIO([
      'formal, structured templates',  // chart
      'concise',                        // order
      'detailed billing language',      // charge
      'step-by-step procedural',        // perform
      'systematic analysis',            // interpret
      'plain language',                 // educate
      'professional, collaborative',    // coordinate
    ]);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.data.voice?.chart).toBe('formal, structured templates');
    expect(newState.data.voice?.order).toBe('concise');
    expect(newState.data.voice?.charge).toBe('detailed billing language');
    expect(newState.data.voice?.perform).toBe('step-by-step procedural');
    expect(newState.data.voice?.interpret).toBe('systematic analysis');
    expect(newState.data.voice?.educate).toBe('plain language');
    expect(newState.data.voice?.coordinate).toBe('professional, collaborative');
  });

  it('omits voice directives when skipped', async () => {
    const io = createMockIO([
      '',  // chart (skip)
      '',  // order (skip)
      '',  // charge (skip)
      '',  // perform (skip)
      '',  // interpret (skip)
      '',  // educate (skip)
      '',  // coordinate (skip)
    ]);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.data.voice?.chart).toBeUndefined();
    expect(newState.data.voice?.order).toBeUndefined();
  });

  it('sets only provided voice directives', async () => {
    const io = createMockIO([
      'formal',  // chart
      '',        // order (skip)
      '',        // charge (skip)
      '',        // perform (skip)
      '',        // interpret (skip)
      '',        // educate (skip)
      '',        // coordinate (skip)
    ]);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.data.voice?.chart).toBe('formal');
    expect(newState.data.voice).not.toHaveProperty('order');
  });

  it('advances to AUTONOMY', async () => {
    const io = createMockIO(['', '', '', '', '', '', '']);
    const state = makeState({ stage: InterviewStage.VOICE });
    const newState = await voiceStage(state, io);
    expect(newState.stage).toBe(InterviewStage.AUTONOMY);
  });
});

// ---------------------------------------------------------------------------
// autonomyStage
// ---------------------------------------------------------------------------

describe('autonomyStage', () => {
  it('sets all 7 autonomy tiers', async () => {
    const io = createMockIO([
      '0',  // chart: autonomous
      '1',  // order: supervised
      '1',  // charge: supervised
      '2',  // perform: manual
      '2',  // interpret: manual
      '2',  // educate: manual
      '2',  // coordinate: manual
    ]);
    const state = makeState({ stage: InterviewStage.AUTONOMY });
    const newState = await autonomyStage(state, io);
    expect(newState.data.autonomy?.chart).toBe('autonomous');
    expect(newState.data.autonomy?.order).toBe('supervised');
    expect(newState.data.autonomy?.charge).toBe('supervised');
    expect(newState.data.autonomy?.perform).toBe('manual');
    expect(newState.data.autonomy?.interpret).toBe('manual');
    expect(newState.data.autonomy?.educate).toBe('manual');
    expect(newState.data.autonomy?.coordinate).toBe('manual');
  });

  it('advances to CONSENT', async () => {
    const io = createMockIO(['0', '1', '1', '2', '2', '2', '2']);
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

  it('sets acknowledged_at ISO 8601 timestamp', async () => {
    const io = createMockIO(['y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.data.consent?.acknowledged_at).toBeDefined();
    expect(typeof newState.data.consent?.acknowledged_at).toBe('string');
    // Verify it is a valid ISO 8601 date
    const parsed = new Date(newState.data.consent!.acknowledged_at);
    expect(parsed.toISOString()).toBe(newState.data.consent!.acknowledged_at);
  });

  it('re-prompts if any consent refused then accepted', async () => {
    // First HIPAA consent refused, then accepted; others accepted
    const io = createMockIO(['n', 'y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.data.consent?.hipaa_warning_acknowledged).toBe(true);
    expect(io.getOutput().some((line) => line.includes('required to proceed'))).toBe(true);
  });

  it('sets skills with empty authorized array', async () => {
    const io = createMockIO(['y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.data.skills).toEqual({ authorized: [] });
  });

  it('advances to COMPLETE', async () => {
    const io = createMockIO(['y', 'y', 'y']);
    const state = makeState({ stage: InterviewStage.CONSENT });
    const newState = await consentStage(state, io);
    expect(newState.stage).toBe(InterviewStage.COMPLETE);
  });
});
