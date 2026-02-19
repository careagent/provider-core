import { describe, it, expect } from 'vitest';
import { createNeuronClient } from '../../../src/neuron/client.js';

describe('createNeuronClient', () => {
  it('returns an object with register, heartbeat, and disconnect methods', () => {
    const client = createNeuronClient();
    expect(typeof client.register).toBe('function');
    expect(typeof client.heartbeat).toBe('function');
    expect(typeof client.disconnect).toBe('function');
  });

  it('register() rejects with message containing "not yet implemented"', async () => {
    const client = createNeuronClient();
    await expect(
      client.register({
        endpoint: 'http://localhost:3000',
        providerName: 'Dr. Test',
        specialty: 'Internal Medicine',
      }),
    ).rejects.toThrow('not yet implemented');
  });

  it('heartbeat() rejects with message containing "not yet implemented"', async () => {
    const client = createNeuronClient();
    await expect(client.heartbeat()).rejects.toThrow('not yet implemented');
  });

  it('disconnect() rejects with message containing "not yet implemented"', async () => {
    const client = createNeuronClient();
    await expect(client.disconnect()).rejects.toThrow('not yet implemented');
  });

  it('register() error message references Phase 5', async () => {
    const client = createNeuronClient();
    await expect(
      client.register({
        endpoint: 'http://localhost:3000',
        providerName: 'Dr. Test',
        specialty: 'Internal Medicine',
      }),
    ).rejects.toThrow('Phase 5');
  });

  it('heartbeat() error message references Phase 5', async () => {
    const client = createNeuronClient();
    await expect(client.heartbeat()).rejects.toThrow('Phase 5');
  });

  it('disconnect() error message references Phase 5', async () => {
    const client = createNeuronClient();
    await expect(client.disconnect()).rejects.toThrow('Phase 5');
  });
});
