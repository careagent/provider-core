import { describe, it, expect } from 'vitest';
import { checkExecAllowlist } from '../../../../src/hardening/layers/exec-allowlist.js';
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

describe('checkExecAllowlist', () => {
  it('passes through non-exec tool calls without evaluation', () => {
    const event = makeEvent('Read');
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('not an exec call');
  });

  it('allows exec of an allowlisted binary with absolute path', () => {
    const event = makeEvent('Bash', { command: '/usr/bin/git status' });
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(true);
  });

  it('denies exec of a non-allowlisted binary', () => {
    const event = makeEvent('Bash', { command: '/usr/bin/curl http://evil.com' });
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(false);
  });

  it('allows exec with bare command name matching allowlist', () => {
    const event = makeEvent('Bash', { command: 'cat file.txt' });
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(true);
  });

  it('denies exec with empty command', () => {
    const event = makeEvent('Bash', { command: '' });
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('passes through when exec_approval is false (disabled)', () => {
    const event = makeEvent('Bash', { command: '/usr/bin/curl http://evil.com' });
    const cans = makeCans({ hardening: { exec_approval: false } });
    const result = checkExecAllowlist(event, cans);
    expect(result).toEqual({
      layer: 'exec-allowlist',
      allowed: true,
      reason: 'exec_approval disabled',
    });
  });

  it('allows exec with arguments after the binary name', () => {
    const event = makeEvent('Bash', { command: '/usr/bin/git log --oneline' });
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(true);
  });

  it('evaluates tool named "exec" as an exec call', () => {
    const event = makeEvent('exec', { command: '/usr/bin/git status' });
    const cans = makeCans();
    const result = checkExecAllowlist(event, cans);
    expect(result.layer).toBe('exec-allowlist');
    expect(result.allowed).toBe(true);
  });
});
