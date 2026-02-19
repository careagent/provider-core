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
  it('includes provider name and specialty', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('Dr. Test Provider');
    expect(output).toContain('Neurosurgery');
  });

  it('includes PROHIBITED section with prohibited_actions', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('PROHIBITED');
    expect(output).toContain('prescribe_controlled_substances');
  });

  it('includes autonomy tiers', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('autonomous');
    expect(output).toContain('supervised');
    expect(output).toContain('manual');
  });

  it('includes institutional limitations', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('no_pediatric_cases');
  });

  it('includes "NEVER act outside these scope boundaries" instruction', () => {
    const output = extractProtocolRules(cans);
    expect(output).toContain('NEVER act outside these scope boundaries');
  });

  it('output length is under 2000 characters', () => {
    const output = extractProtocolRules(cans);
    expect(output.length).toBeLessThan(2000);
  });

  it('omits PROHIBITED section when prohibited_actions is empty', () => {
    const cansNoProhibited = {
      ...cans,
      scope: {
        ...cans.scope,
        prohibited_actions: [],
      },
    } as CANSDocument;
    const output = extractProtocolRules(cansNoProhibited);
    expect(output).not.toContain('PROHIBITED');
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

  it('returns allowed with injection status when cans_protocol_injection is true', () => {
    const result = checkCansInjection(event, cans);
    expect(result).toEqual({
      layer: 'cans-injection',
      allowed: true,
      reason: 'protocol injected at bootstrap',
    });
  });

  it('returns allowed with disabled message when cans_protocol_injection is false', () => {
    const cansDisabled = {
      ...cans,
      hardening: {
        ...cans.hardening,
        cans_protocol_injection: false,
      },
    } as CANSDocument;
    const result = checkCansInjection(event, cansDisabled);
    expect(result).toEqual({
      layer: 'cans-injection',
      allowed: true,
      reason: 'cans_protocol_injection disabled',
    });
  });
});
