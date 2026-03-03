/**
 * MessageIO — transport-agnostic I/O interface for the protocol engine.
 * Decouples the engine from specific transports (Telegram, CLI, WebSocket).
 */

import type { TelegramTransport, TelegramUpdate } from '../bot/telegram-client.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface MessageIO {
  /** Send a text message to the user. */
  send(text: string): Promise<void>;
  /** Wait for and receive a text message from the user. */
  receive(): Promise<string>;
}

// ---------------------------------------------------------------------------
// TelegramMessageIO
// ---------------------------------------------------------------------------

export interface TelegramMessageIOConfig {
  transport: TelegramTransport;
  chatId: number;
  pollTimeoutMs?: number;
  /** Starting offset to avoid re-processing already-handled updates. */
  initialOffset?: number;
}

export function createTelegramMessageIO(config: TelegramMessageIOConfig): MessageIO {
  const { transport, chatId, pollTimeoutMs = 120_000, initialOffset = 0 } = config;
  let currentOffset = initialOffset;
  const pendingUpdates: TelegramUpdate[] = [];

  return {
    async send(text: string): Promise<void> {
      await transport.sendMessage(chatId, text);
    },

    async receive(): Promise<string> {
      const deadline = Date.now() + pollTimeoutMs;

      while (Date.now() < deadline) {
        // Check pending queue first
        while (pendingUpdates.length > 0) {
          const update = pendingUpdates.shift()!;
          if (update.message?.text && update.message.chat.id === chatId) {
            currentOffset = update.update_id + 1;
            return update.message.text.trim();
          }
          if (update.update_id >= currentOffset) {
            currentOffset = update.update_id + 1;
          }
        }

        // Poll Telegram
        const updates = await transport.getUpdates(currentOffset, 5);
        for (const update of updates) {
          if (update.message?.text && update.message.chat.id === chatId) {
            currentOffset = update.update_id + 1;
            return update.message.text.trim();
          }
          if (update.update_id >= currentOffset) {
            currentOffset = update.update_id + 1;
          }
        }
      }

      throw new Error('MessageIO: timed out waiting for user response');
    },
  };
}

// ---------------------------------------------------------------------------
// MockMessageIO (for testing)
// ---------------------------------------------------------------------------

export function createMockMessageIO(
  responses: string[],
): MessageIO & { getSentMessages(): string[] } {
  let responseIdx = 0;
  const sent: string[] = [];

  return {
    async send(text: string): Promise<void> {
      sent.push(text);
    },

    async receive(): Promise<string> {
      const response = responses[responseIdx];
      if (response === undefined) {
        throw new Error('MockMessageIO: no more responses queued');
      }
      responseIdx++;
      return response;
    },

    getSentMessages(): string[] {
      return [...sent];
    },
  };
}
