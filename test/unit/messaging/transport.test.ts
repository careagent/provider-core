import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessage } from '../../../src/messaging/transport.js';
import type { SignedMessageEnvelope } from '../../../src/messaging/schemas.js';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WsListener = (event: unknown) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  private listeners: Record<string, WsListener[]> = {};
  readyState = 0;
  closeCode?: number;
  closeReason?: string;
  sentData: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.readyState = 1;
      this.emit('open', {});
    }, 5);
  }

  addEventListener(event: string, listener: WsListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  send(data: string): void {
    this.sentData.push(data);
    // Simulate server acknowledgment
    setTimeout(() => {
      this.emit('message', { data: JSON.stringify({ ack: true }) });
    }, 5);
  }

  close(): void {
    this.readyState = 3;
  }

  emit(event: string, data: unknown): void {
    const listeners = this.listeners[event] || [];
    for (const listener of listeners) {
      listener(data);
    }
  }
}

class MockWebSocketError {
  private listeners: Record<string, WsListener[]> = {};

  constructor(public url: string) {
    setTimeout(() => {
      this.emit('error', { message: 'connect failed: ECONNREFUSED' });
    }, 5);
  }

  addEventListener(event: string, listener: WsListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  send(_data: string): void {
    throw new Error('Cannot send: not connected');
  }

  close(): void {}

  emit(event: string, data: unknown): void {
    const listeners = this.listeners[event] || [];
    for (const listener of listeners) {
      listener(data);
    }
  }
}

class MockWebSocketRejection {
  private listeners: Record<string, WsListener[]> = {};

  constructor(public url: string) {
    setTimeout(() => {
      this.emit('open', {});
    }, 5);
  }

  addEventListener(event: string, listener: WsListener): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  send(_data: string): void {
    setTimeout(() => {
      this.emit('message', { data: JSON.stringify({ error: 'message rejected' }) });
    }, 5);
  }

  close(): void {}

  emit(event: string, data: unknown): void {
    const listeners = this.listeners[event] || [];
    for (const listener of listeners) {
      listener(data);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(overrides: Partial<SignedMessageEnvelope> = {}): SignedMessageEnvelope {
  return {
    version: '1',
    message_id: 'msg-001',
    correlation_id: 'corr-001',
    timestamp: '2026-02-28T10:00:00Z',
    sender_public_key: 'test-pub-key',
    patient_agent_id: 'patient-001',
    payload: {
      type: 'clinical_summary',
      summary: 'Test summary',
      provider_npi: '1234567893',
      provider_name: 'Dr. Smith',
    },
    signature: 'test-signature',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendMessage (transport)', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends message successfully via WebSocket', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket);

    const result = await sendMessage(
      { patientEndpoint: 'ws://patient:8080' },
      makeEnvelope(),
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].sentData).toHaveLength(1);

    const sent = JSON.parse(MockWebSocket.instances[0].sentData[0]);
    expect(sent.message_id).toBe('msg-001');
    expect(sent.correlation_id).toBe('corr-001');
  });

  it('returns PATIENT_UNREACHABLE on connection refused', async () => {
    vi.stubGlobal('WebSocket', MockWebSocketError);

    const result = await sendMessage(
      { patientEndpoint: 'ws://patient:8080' },
      makeEnvelope(),
    );

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('PATIENT_UNREACHABLE');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('handles patient rejection of message', async () => {
    vi.stubGlobal('WebSocket', MockWebSocketRejection);

    const result = await sendMessage(
      { patientEndpoint: 'ws://patient:8080' },
      makeEnvelope(),
    );

    expect(result.success).toBe(false);
    // Patient rejected → retried → eventually MAX_RETRIES_EXCEEDED
    expect(result.error_code).toBe('MAX_RETRIES_EXCEEDED');
  });

  it('retries up to 3 times on transient errors', async () => {
    let callCount = 0;

    class FailThenSucceedWs {
      static instances: FailThenSucceedWs[] = [];
      private listeners: Record<string, WsListener[]> = {};

      constructor(public url: string) {
        FailThenSucceedWs.instances.push(this);
        callCount++;

        if (callCount <= 2) {
          setTimeout(() => {
            this.emit('error', { message: 'transient error' });
          }, 5);
        } else {
          setTimeout(() => {
            this.emit('open', {});
          }, 5);
        }
      }

      addEventListener(event: string, listener: WsListener): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
      }

      send(_data: string): void {
        setTimeout(() => {
          this.emit('message', { data: '{"ack":true}' });
        }, 5);
      }

      close(): void {}

      emit(event: string, data: unknown): void {
        const listeners = this.listeners[event] || [];
        for (const listener of listeners) {
          listener(data);
        }
      }
    }

    FailThenSucceedWs.instances = [];
    vi.stubGlobal('WebSocket', FailThenSucceedWs);

    const result = await sendMessage(
      { patientEndpoint: 'ws://patient:8080' },
      makeEnvelope(),
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('returns MAX_RETRIES_EXCEEDED after 3 failed attempts', async () => {
    class AlwaysFailWs {
      private listeners: Record<string, WsListener[]> = {};

      constructor(public url: string) {
        setTimeout(() => {
          this.emit('error', { message: 'persistent error' });
        }, 5);
      }

      addEventListener(event: string, listener: WsListener): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
      }

      send(_data: string): void {
        throw new Error('not connected');
      }

      close(): void {}

      emit(event: string, data: unknown): void {
        const listeners = this.listeners[event] || [];
        for (const listener of listeners) {
          listener(data);
        }
      }
    }

    vi.stubGlobal('WebSocket', AlwaysFailWs);

    const result = await sendMessage(
      { patientEndpoint: 'ws://patient:8080' },
      makeEnvelope(),
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error_code).toBe('MAX_RETRIES_EXCEEDED');
  });
});
