/**
 * Provider Telegram bot — entry point and public API.
 * Mirrors patient-core's src/bot/index.ts barrel pattern.
 */

export {
  createTelegramTransport,
  createMockTransport,
  type TelegramTransport,
  type TelegramUser,
  type TelegramChat,
  type TelegramMessage,
  type TelegramCallbackQuery,
  type TelegramUpdate,
  type TelegramSendMessageResponse,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
  type MockTransportRecord,
} from './telegram-client.js';

export {
  createTelegramIO,
  type TelegramIOConfig,
} from './telegram-io.js';

export {
  createProviderOnboardingBot,
  type ProviderOnboardingBotConfig,
  type ProviderOnboardingBot,
  type ProviderSession,
} from './onboarding-bot.js';
