import { describe, it, expect, vi } from 'vitest';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';
import type { BootstrapContext } from '../../../../src/adapters/types.js';
import { validCANSData } from '../../../fixtures/valid-cans-data.js';
import {
  extractProtocolRules,
  injectProtocol,
  checkCansInjection,
} from '../../../../src/hardening/layers/cans-injection.js';

const cans = validCANSData as CANSDocument;

describe('extractProtocolRules', () => {
  it('includes provider name and types', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('Dr. Test Provider');
    expect(output).toContain('Physician');
  });

  it('includes specialty and subspecialty', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('Neurosurgery');
    expect(output).toContain('Spine');
  });

  it('includes Organization from primary organization', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('Organization:');
    expect(output).toContain('University Medical Center');
  });

  it('includes permitted_actions in scope boundaries', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('Permitted');
    expect(output).toContain('chart_operative_note');
    expect(output).toContain('chart_progress_note');
    expect(output).toContain('chart_h_and_p');
  });

  it('includes autonomy tiers with all 7 actions', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('autonomous');
    expect(output).toContain('supervised');
    expect(output).toContain('manual');
    expect(output).toContain('Chart');
    expect(output).toContain('Order');
    expect(output).toContain('Charge');
    expect(output).toContain('Perform');
    expect(output).toContain('Interpret');
    expect(output).toContain('Educate');
    expect(output).toContain('Coordinate');
  });

  it('includes "NEVER act outside these scope boundaries" instruction', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('NEVER act outside these scope boundaries');
  });

  it('output length is under 2000 characters', () => {
    const output = extractProtocolRules(cans);
    expect(output.length).toBeLessThan(2000);
  });
});

describe('injectProtocol', () => {
  it('calls context.addFile with CAREAGENT_PROTOCOL.md and extractProtocolRules content', () => {
    const addFile = vi.fn();
    const context: BootstrapContext = { addFile };

    injectProtocol(context, cans);

    expect(addFile).toHaveBeenCalledOnce();
    expect(addFile).toHaveBeenCalledWith(
      'CAREAGENT_PROTOCOL.md',
      extractProtocolRules(cans),
    );
  });

  it('addFile call content matches extractProtocolRules output exactly', () => {
    const addFile = vi.fn();
    const context: BootstrapContext = { addFile };

    injectProtocol(context, cans);

    const expected = extractProtocolRules(cans);
    const actual = addFile.mock.calls[0][1];
    expect(actual).toBe(expected);
  });
});

describe('checkCansInjection', () => {
  const event = { toolName: 'test-tool' };

  it('returns allowed with injection status (always on)', () => {
    const result = checkCansInjection(event, cans);
    expect(result).toEqual({
      layer: 'cans-injection',
      allowed: true,
      reason: 'protocol injected at bootstrap',
    });
  });

  it('never blocks tool calls', () => {
    const result = checkCansInjection({ toolName: 'any_tool' }, cans);
    expect(result.allowed).toBe(true);
  });
});
