import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../../../src/adapters/detect.js';

describe('detectPlatform', () => {
  it('returns "openclaw" when api has registerCli and on as functions', () => {
    const api = {
      registerCli: () => {},
      on: () => {},
    };
    expect(detectPlatform(api)).toBe('openclaw');
  });

  it('returns "standalone" when api is missing registerCli', () => {
    const api = {
      on: () => {},
    };
    expect(detectPlatform(api)).toBe('standalone');
  });

  it('returns "standalone" when api is missing on', () => {
    const api = {
      registerCli: () => {},
    };
    expect(detectPlatform(api)).toBe('standalone');
  });

  it('returns "standalone" when api is an empty object', () => {
    expect(detectPlatform({})).toBe('standalone');
  });

  it('returns "standalone" when api is undefined', () => {
    expect(detectPlatform(undefined)).toBe('standalone');
  });

  it('returns "standalone" when api is null', () => {
    expect(detectPlatform(null)).toBe('standalone');
  });

  it('returns "standalone" when registerCli is not a function', () => {
    const api = {
      registerCli: 'not-a-function',
      on: () => {},
    };
    expect(detectPlatform(api)).toBe('standalone');
  });

  it('returns "standalone" when on is not a function', () => {
    const api = {
      registerCli: () => {},
      on: 'not-a-function',
    };
    expect(detectPlatform(api)).toBe('standalone');
  });

  it('returns "openclaw" even with extra properties', () => {
    const api = {
      registerCli: () => {},
      on: () => {},
      workspaceDir: '/test',
      log: () => {},
    };
    expect(detectPlatform(api)).toBe('openclaw');
  });
});
