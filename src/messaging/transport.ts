/**
 * WebSocket transport — connects to a patient agent's neuron endpoint
 * and sends signed clinical messages.
 *
 * Covers:
 * - MSG-06: WebSocket client for P2P provider-to-patient messaging
 * - MSG-07: Retry logic with exponential backoff (max 3 attempts)
 * - MSG-08: Error handling for patient unreachable, WebSocket errors
 *
 * Uses the Node.js built-in WebSocket API (available in Node >= 22).
 * Provider-initiated push model — the provider connects and sends.
 */

import type { SignedMessageEnvelope } from './schemas.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const SEND_TIMEOUT_MS = 15_000;

export interface TransportConfig {
  /** Patient's neuron WebSocket endpoint URL (ws:// or wss://). */
  patientEndpoint: string;
  /** Connection timeout in milliseconds (default: 15000). */
  timeoutMs?: number;
}

export interface TransportResult {
  success: boolean;
  attempts: number;
  error?: string;
  error_code?: 'PATIENT_UNREACHABLE' | 'WEBSOCKET_ERROR' | 'MAX_RETRIES_EXCEEDED';
}

/**
 * Send a signed message envelope to a patient agent via WebSocket.
 *
 * Implements exponential backoff retry logic:
 * - Attempt 1: immediate
 * - Attempt 2: 1s delay
 * - Attempt 3: 2s delay
 *
 * @param config - Transport configuration
 * @param envelope - The signed message envelope to send
 * @returns Transport result with success/failure details
 */
export async function sendMessage(
  config: TransportConfig,
  envelope: SignedMessageEnvelope,
): Promise<TransportResult> {
  const timeoutMs = config.timeoutMs ?? SEND_TIMEOUT_MS;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Exponential backoff: skip delay on first attempt
    if (attempt > 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 2);
      await sleep(delay);
    }

    try {
      await sendOnce(config.patientEndpoint, envelope, timeoutMs);
      return { success: true, attempts: attempt };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);

      // Don't retry on connection refused — patient is truly unreachable
      if (lastError.includes('ECONNREFUSED') || lastError.includes('connect failed')) {
        return {
          success: false,
          attempts: attempt,
          error: `Patient unreachable: ${lastError}`,
          error_code: 'PATIENT_UNREACHABLE',
        };
      }
    }
  }

  return {
    success: false,
    attempts: MAX_RETRIES,
    error: `Max retries exceeded: ${lastError}`,
    error_code: 'MAX_RETRIES_EXCEEDED',
  };
}

/**
 * Send a message over a single WebSocket connection attempt.
 *
 * Opens a WebSocket, sends the message as JSON text frame,
 * waits for acknowledgment or timeout, then closes.
 */
async function sendOnce(
  endpoint: string,
  envelope: SignedMessageEnvelope,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout>;

    try {
      ws = new WebSocket(endpoint);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reject(new Error(`WebSocket connect failed: ${msg}`));
      return;
    }

    timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore close errors during timeout cleanup
      }
      reject(new Error(`WebSocket send timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.addEventListener('open', () => {
      try {
        ws.send(JSON.stringify(envelope));
      } catch (err: unknown) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(`WebSocket send failed: ${msg}`));
      }
    });

    ws.addEventListener('message', (event) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      // Any response is treated as acknowledgment
      const data = typeof event.data === 'string' ? event.data : '';
      if (data.includes('"error"')) {
        reject(new Error(`Patient rejected message: ${data}`));
      } else {
        resolve();
      }
    });

    ws.addEventListener('error', (event) => {
      clearTimeout(timer);
      const ev = event as Event & { message?: string };
      const msg = ev.message || 'WebSocket error';
      reject(new Error(`WebSocket error: ${msg}`));
    });

    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      // If close comes after open+send without a message response,
      // consider it success (fire-and-forget for non-ack endpoints)
      if (event.code === 1000 || event.code === 1001) {
        resolve();
      }
      // If not already resolved/rejected, reject on abnormal close
      reject(new Error(`WebSocket closed unexpectedly: code=${event.code} reason=${event.reason}`));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
