import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CANSDocument } from '../../../../src/activation/cans-schema.js';
import { validCANSData } from '../../../fixtures/valid-cans-data.js';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
}));

import { existsSync, readFileSync } from 'node:fs';
import {
  detectDocker,
  checkDockerSandbox,
} from '../../../../src/hardening/layers/docker-sandbox.js';

const cans = validCANSData as CANSDocument;
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('detectDocker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    // Clear CONTAINER env var
    delete process.env.CONTAINER;
  });

  afterEach(() => {
    delete process.env.CONTAINER;
  });

  it('detects /.dockerenv file', () => {
    mockExistsSync.mockImplementation((path) => path === '/.dockerenv');

    const result = detectDocker();
    expect(result.inContainer).toBe(true);
    expect(result.signals).toContain('/.dockerenv exists');
  });

  it('detects /proc/1/cgroup containing docker', () => {
    mockReadFileSync.mockReturnValue('12:cpuset:/docker/abc123\n');

    const result = detectDocker();
    expect(result.inContainer).toBe(true);
    expect(result.signals).toContain('/proc/1/cgroup contains container reference');
  });

  it('detects CONTAINER env var', () => {
    process.env.CONTAINER = 'true';

    const result = detectDocker();
    expect(result.inContainer).toBe(true);
    expect(result.signals).toContain('CONTAINER env var set');
  });

  it('returns false when no signals present', () => {
    const result = detectDocker();
    expect(result.inContainer).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it('lists multiple signals when present', () => {
    mockExistsSync.mockImplementation((path) => path === '/.dockerenv');
    process.env.CONTAINER = 'docker';

    const result = detectDocker();
    expect(result.inContainer).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
    expect(result.signals).toContain('/.dockerenv exists');
    expect(result.signals).toContain('CONTAINER env var set');
  });

  it('gracefully handles readFileSync throwing', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const result = detectDocker();
    expect(result.inContainer).toBe(false);
    expect(result.signals).toEqual([]);
  });
});

describe('checkDockerSandbox', () => {
  const event = { toolName: 'test-tool' };

  beforeEach(() => {
    vi.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    delete process.env.CONTAINER;
  });

  afterEach(() => {
    delete process.env.CONTAINER;
  });

  it('returns allowed with disabled message when docker_sandbox is false', () => {
    const result = checkDockerSandbox(event, cans);
    expect(result).toEqual({
      layer: 'docker-sandbox',
      allowed: true,
      reason: 'docker_sandbox disabled',
    });
  });

  it('returns allowed with sandbox active when container detected', () => {
    const cansEnabled = {
      ...cans,
      hardening: { ...cans.hardening, docker_sandbox: true },
    } as CANSDocument;
    mockExistsSync.mockImplementation((path) => path === '/.dockerenv');

    const result = checkDockerSandbox(event, cansEnabled);
    expect(result.layer).toBe('docker-sandbox');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('sandbox active');
  });

  it('returns allowed with no container message when not in container', () => {
    const cansEnabled = {
      ...cans,
      hardening: { ...cans.hardening, docker_sandbox: true },
    } as CANSDocument;

    const result = checkDockerSandbox(event, cansEnabled);
    expect(result.layer).toBe('docker-sandbox');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('no container detected');
  });
});
