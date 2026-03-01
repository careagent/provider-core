/**
 * TelegramIO — InterviewIO adapter for Telegram Bot API.
 * Routes question(), select(), confirm(), display() through Telegram messages
 * and waits for user responses via long polling.
 */

import type { InterviewIO } from '../cli/io.js';
import type { TelegramTransport, TelegramUpdate, InlineKeyboardMarkup, TelegramCallbackQuery } from './telegram-client.js';

export interface TelegramIOConfig {
  transport: TelegramTransport;
  chatId: number;
  pollTimeoutMs?: number;
}

export function createTelegramIO(config: TelegramIOConfig): InterviewIO & {
  getOffset(): number;
  setOffset(offset: number): void;
  injectUpdate(update: TelegramUpdate): void;
} {
  const { transport, chatId, pollTimeoutMs = 120_000 } = config;
  let currentOffset = 0;
  const pendingUpdates: TelegramUpdate[] = [];

  async function waitForTextMessage(): Promise<string> {
    const deadline = Date.now() + pollTimeoutMs;
    while (Date.now() < deadline) {
      // Check pending queue first
      while (pendingUpdates.length > 0) {
        const update = pendingUpdates.shift()!;
        if (update.message?.text && update.message.chat.id === chatId) {
          currentOffset = update.update_id + 1;
          return update.message.text.trim();
        }
      }
      // Poll Telegram
      const updates = await transport.getUpdates(currentOffset, 5);
      for (const update of updates) {
        if (update.message?.text && update.message.chat.id === chatId) {
          currentOffset = update.update_id + 1;
          return update.message.text.trim();
        }
        currentOffset = update.update_id + 1;
      }
    }
    throw new Error('Telegram IO: timed out waiting for user response');
  }

  async function waitForCallbackQuery(): Promise<TelegramCallbackQuery> {
    const deadline = Date.now() + pollTimeoutMs;
    while (Date.now() < deadline) {
      while (pendingUpdates.length > 0) {
        const update = pendingUpdates.shift()!;
        if (update.callback_query && update.callback_query.message?.chat.id === chatId) {
          currentOffset = update.update_id + 1;
          return update.callback_query;
        }
      }
      const updates = await transport.getUpdates(currentOffset, 5);
      for (const update of updates) {
        if (update.callback_query && update.callback_query.message?.chat.id === chatId) {
          currentOffset = update.update_id + 1;
          return update.callback_query;
        }
        currentOffset = update.update_id + 1;
      }
    }
    throw new Error('Telegram IO: timed out waiting for button press');
  }

  return {
    getOffset: () => currentOffset,
    setOffset: (offset: number) => { currentOffset = offset; },
    injectUpdate: (update: TelegramUpdate) => { pendingUpdates.push(update); },

    async question(prompt: string): Promise<string> {
      await transport.sendMessage(chatId, prompt);
      return waitForTextMessage();
    },

    async select(prompt: string, options: string[]): Promise<number> {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: options.map((opt, idx) => [
          { text: opt, callback_data: String(idx) },
        ]),
      };
      await transport.sendMessage(chatId, prompt, keyboard);
      const query = await waitForCallbackQuery();
      const selected = parseInt(query.data ?? '0', 10);
      return selected;
    },

    async confirm(prompt: string): Promise<boolean> {
      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [[
          { text: 'Yes', callback_data: 'yes' },
          { text: 'No', callback_data: 'no' },
        ]],
      };
      await transport.sendMessage(chatId, prompt, keyboard);
      const query = await waitForCallbackQuery();
      return query.data === 'yes';
    },

    display(text: string): void {
      // Fire-and-forget — display is synchronous in the interface
      transport.sendMessage(chatId, text).catch(() => {
        // Swallow errors for display — non-critical
      });
    },

    close(): void {
      // No-op for Telegram — connection stays open
    },
  };
}
