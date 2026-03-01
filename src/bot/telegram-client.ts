/**
 * Telegram Bot API HTTP transport for provider CareAgent.
 * Zero runtime dependencies — uses Node.js built-in fetch.
 */

export interface TelegramTransport {
  sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<TelegramSendMessageResponse>;
  getUpdates(offset?: number, timeout?: number): Promise<TelegramUpdate[]>;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramSendMessageResponse {
  ok: boolean;
  result?: TelegramMessage;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface MockTransportRecord {
  method: string;
  args: unknown[];
}

export function createTelegramTransport(botToken: string): TelegramTransport {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  return {
    async sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<TelegramSendMessageResponse> {
      const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'Markdown' };
      if (replyMarkup) {
        body.reply_markup = replyMarkup;
      }
      const res = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as TelegramSendMessageResponse;
      if (!data.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
      return data;
    },

    async getUpdates(offset?: number, timeout = 30): Promise<TelegramUpdate[]> {
      const params = new URLSearchParams();
      if (offset !== undefined) params.set('offset', String(offset));
      params.set('timeout', String(timeout));
      params.set('allowed_updates', JSON.stringify(['message', 'callback_query']));
      const res = await fetch(`${baseUrl}/getUpdates?${params}`);
      const data = await res.json() as { ok: boolean; result: TelegramUpdate[] };
      if (!data.ok) throw new Error(`Telegram getUpdates failed: ${JSON.stringify(data)}`);
      return data.result;
    },
  };
}

export function createMockTransport(): TelegramTransport & {
  calls: MockTransportRecord[];
  getSentMessages(): Array<{ chatId: number; text: string; replyMarkup?: InlineKeyboardMarkup }>;
  queueUpdates(updates: TelegramUpdate[]): void;
  queueCallbackQuery(query: TelegramCallbackQuery): void;
} {
  const calls: MockTransportRecord[] = [];
  const sentMessages: Array<{ chatId: number; text: string; replyMarkup?: InlineKeyboardMarkup }> = [];
  const pendingUpdates: TelegramUpdate[] = [];
  let updateIdCounter = 1;

  return {
    calls,
    getSentMessages: () => [...sentMessages],
    queueUpdates(updates: TelegramUpdate[]) {
      pendingUpdates.push(...updates);
    },
    queueCallbackQuery(query: TelegramCallbackQuery) {
      pendingUpdates.push({ update_id: updateIdCounter++, callback_query: query });
    },

    async sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<TelegramSendMessageResponse> {
      calls.push({ method: 'sendMessage', args: [chatId, text, replyMarkup] });
      sentMessages.push({ chatId, text, replyMarkup });
      return { ok: true, result: { message_id: calls.length, chat: { id: chatId, type: 'private' }, date: Date.now() } };
    },

    async getUpdates(offset?: number, timeout?: number): Promise<TelegramUpdate[]> {
      calls.push({ method: 'getUpdates', args: [offset, timeout] });
      const batch = pendingUpdates.splice(0, pendingUpdates.length);
      return batch;
    },
  };
}
