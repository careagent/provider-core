import { describe, it, expect } from 'vitest';
import { createProtocolServer } from '../../../src/protocol/server.js';

describe('createProtocolServer', () => {
  it('returns an object with start, stop, and activeSessions methods', () => {
    const server = createProtocolServer();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
    expect(typeof server.activeSessions).toBe('function');
  });

  it('start() rejects with message containing "not yet implemented"', async () => {
    const server = createProtocolServer();
    await expect(server.start(3000)).rejects.toThrow('not yet implemented');
  });

  it('stop() rejects with message containing "not yet implemented"', async () => {
    const server = createProtocolServer();
    await expect(server.stop()).rejects.toThrow('not yet implemented');
  });

  it('activeSessions() throws with message containing "not yet implemented"', () => {
    const server = createProtocolServer();
    expect(() => server.activeSessions()).toThrow('not yet implemented');
  });

  it('start() error message references Phase 5', async () => {
    const server = createProtocolServer();
    await expect(server.start(3000)).rejects.toThrow('Phase 5');
  });

  it('activeSessions() error message references Phase 5', () => {
    const server = createProtocolServer();
    expect(() => server.activeSessions()).toThrow('Phase 5');
  });
});
