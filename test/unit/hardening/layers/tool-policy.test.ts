import { describe, it, expect } from 'vitest';
import { checkToolPolicy } from '../../../../src/hardening/layers/tool-policy.js';
import { validCANSData } from '../../../fixtures/valid-cans-data.js';
import type { ToolCallEvent } from '../../../../src/adapters/types.js';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';

/** Helper: create a minimal ToolCallEvent. */
function makeEvent(toolName: string, params?: Record<string, unknown>): ToolCallEvent {
  return { toolName, ...(params !== undefined && { params }) };
}

/** Helper: deep-merge overrides into a copy of validCANSData. */
function makeCans(overrides?: Record<string, unknown>): CANSDocument {
  const base = structuredClone(validCANSData) as Record<string, unknown>;
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof base[key] === 'object' &&
        base[key] !== null
      ) {
        base[key] = { ...(base[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
      } else {
        base[key] = value;
      }
    }
  }
  return base as unknown as CANSDocument;
}

describe('checkToolPolicy', () => {
  it('allows a tool that is in permitted_actions', () => {
    const event = makeEvent('chart_operative_note');
    const cans = makeCans();
    const result = checkToolPolicy(event, cans);
    expect(result).toEqual({ layer: 'tool-policy', allowed: true });
  });

  it('denies a tool that is not in permitted_actions (allowlist model)', () => {
    const event = makeEvent('unknown_tool');
    const cans = makeCans();
    const result = checkToolPolicy(event, cans);
    expect(result.layer).toBe('tool-policy');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in permitted_actions');
  });

  it('denies a tool that exists but is not in the scope', () => {
    const event = makeEvent('prescribe_controlled_substances');
    const cans = makeCans();
    const result = checkToolPolicy(event, cans);
    expect(result.layer).toBe('tool-policy');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in permitted_actions');
  });

  it('allows all tools that are in permitted_actions', () => {
    for (const action of validCANSData.scope.permitted_actions) {
      const event = makeEvent(action);
      const cans = makeCans();
      const result = checkToolPolicy(event, cans);
      expect(result).toEqual({ layer: 'tool-policy', allowed: true });
    }
  });

  it('denies when permitted_actions is empty', () => {
    const event = makeEvent('chart_operative_note');
    const cans = makeCans({
      scope: { permitted_actions: [] },
    });
    const result = checkToolPolicy(event, cans);
    expect(result.layer).toBe('tool-policy');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in permitted_actions');
  });
});
