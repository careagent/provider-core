/**
 * Tests for the interview engine orchestrator in src/onboarding/engine.ts.
 */

import { describe, it, expect } from 'vitest';
import { createMockIO } from '../../../src/cli/io.js';
import { runInterview, runSingleStage, InterviewStage } from '../../../src/onboarding/engine.js';
import { completeInterviewResponses } from '../../fixtures/interview-responses.js';

describe('runInterview', () => {
  it('returns an InterviewResult with complete responses', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.philosophy).toBeDefined();
  });

  it('returned data has all required top-level CANS fields', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    expect(result.data).toHaveProperty('version');
    expect(result.data).toHaveProperty('provider');
    expect(result.data).toHaveProperty('scope');
    expect(result.data).toHaveProperty('autonomy');
    expect(result.data).toHaveProperty('hardening');
    expect(result.data).toHaveProperty('consent');
  });

  it('data.provider.name matches the name from responses', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    expect(result.data.provider.name).toBe('Dr. Test Provider');
  });

  it('data.provider.license.type is MD', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    expect(result.data.provider.license.type).toBe('MD');
  });

  it('data.autonomy has all four action tiers', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    expect(result.data.autonomy).toHaveProperty('chart');
    expect(result.data.autonomy).toHaveProperty('order');
    expect(result.data.autonomy).toHaveProperty('charge');
    expect(result.data.autonomy).toHaveProperty('perform');
  });

  it('data.hardening has all six boolean flags, all true', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    const h = result.data.hardening;
    expect(h.tool_policy_lockdown).toBe(true);
    expect(h.exec_approval).toBe(true);
    expect(h.cans_protocol_injection).toBe(true);
    expect(h.docker_sandbox).toBe(true);
    expect(h.safety_guard).toBe(true);
    expect(h.audit_trail).toBe(true);
  });

  it('data.consent has all three boolean flags, all true', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    const c = result.data.consent;
    expect(c.hipaa_warning_acknowledged).toBe(true);
    expect(c.synthetic_data_only).toBe(true);
    expect(c.audit_consent).toBe(true);
  });

  it('philosophy is a non-empty string', async () => {
    const io = createMockIO([...completeInterviewResponses]);
    const result = await runInterview(io);
    expect(typeof result.philosophy).toBe('string');
    expect(result.philosophy.length).toBeGreaterThan(0);
  });
});

describe('runSingleStage', () => {
  it('IDENTITY stage updates only provider identity fields', async () => {
    const initialState = {
      stage: InterviewStage.IDENTITY,
      data: { version: '1.0' },
      philosophy: '',
    };
    const io = createMockIO([
      'Dr. Single Stage',  // name
      '9876543210',        // NPI
    ]);
    const newState = await runSingleStage(InterviewStage.IDENTITY, initialState, io);
    expect(newState.data.provider?.name).toBe('Dr. Single Stage');
    expect(newState.data.provider?.npi).toBe('9876543210');
    expect(newState.stage).toBe(InterviewStage.CREDENTIALS);
    // Other data fields should be unchanged
    expect(newState.data.version).toBe('1.0');
    expect(newState.data.scope).toBeUndefined();
    expect(newState.data.autonomy).toBeUndefined();
  });

  it('throws on unknown stage', async () => {
    const initialState = {
      stage: InterviewStage.COMPLETE,
      data: {},
      philosophy: '',
    };
    const io = createMockIO([]);
    await expect(
      runSingleStage(InterviewStage.COMPLETE, initialState, io),
    ).rejects.toThrow('No handler for stage: COMPLETE');
  });
});
