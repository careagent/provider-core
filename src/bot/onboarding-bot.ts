/**
 * Provider onboarding bot — wires TelegramIO adapter to the 9-stage
 * interview engine. Listens for /start from a Telegram user, then
 * runs the full provider onboarding interview over Telegram.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { TelegramTransport, TelegramUpdate } from './telegram-client.js';
import { createTelegramIO } from './telegram-io.js';
import { runInterview } from '../onboarding/engine.js';

export interface ProviderOnboardingBotConfig {
  transport: TelegramTransport;
  workspacePath: string;
  axonUrl?: string;
  onActivation?: (cansPath: string) => void | Promise<void>;
}

export interface ProviderOnboardingBot {
  handleUpdate(update: TelegramUpdate): Promise<void>;
  startPolling(): { stop: () => void };
  getActiveSessions(): Map<number, ProviderSession>;
}

export interface ProviderSession {
  chatId: number;
  state: 'idle' | 'interviewing' | 'complete' | 'failed';
  startedAt: string;
  completedAt?: string;
  cansPath?: string;
}

export function createProviderOnboardingBot(config: ProviderOnboardingBotConfig): ProviderOnboardingBot {
  const { transport, workspacePath, onActivation } = config;
  const sessions = new Map<number, ProviderSession>();
  let pollingOffset = 0;

  async function startInterview(chatId: number): Promise<void> {
    const session: ProviderSession = {
      chatId,
      state: 'interviewing',
      startedAt: new Date().toISOString(),
    };
    sessions.set(chatId, session);

    try {
      const io = createTelegramIO({ transport, chatId });
      io.setOffset(pollingOffset);

      const result = await runInterview(io);

      pollingOffset = io.getOffset();

      // Write CANS.md
      const cansContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const cansPath = join(workspacePath, 'CANS.md');
      await writeFile(cansPath, cansContent, 'utf-8');

      // Write integrity sidecar
      const hash = createHash('sha256').update(cansContent).digest('hex');
      await writeFile(`${cansPath}.sha256`, hash, 'utf-8');

      session.state = 'complete';
      session.completedAt = new Date().toISOString();
      session.cansPath = cansPath;

      await transport.sendMessage(chatId, 'Provider onboarding complete! Your CareAgent is now activating...');

      if (onActivation) {
        await onActivation(cansPath);
      }
    } catch (err) {
      session.state = 'failed';
      const msg = err instanceof Error ? err.message : String(err);
      await transport.sendMessage(chatId, `Onboarding failed: ${msg}\n\nSend /start to try again.`);
    }
  }

  const bot: ProviderOnboardingBot = {
    async handleUpdate(update: TelegramUpdate): Promise<void> {
      if (!update.message?.text) return;

      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      pollingOffset = update.update_id + 1;

      // Only respond to /start when not already interviewing
      if (text.toLowerCase() === '/start') {
        const existing = sessions.get(chatId);
        if (existing?.state === 'interviewing') {
          await transport.sendMessage(chatId, 'An interview is already in progress. Please complete it or wait for it to finish.');
          return;
        }
        if (existing?.state === 'complete') {
          await transport.sendMessage(chatId, 'You have already completed onboarding. Your CareAgent is active.');
          return;
        }
        // Start the interview — runs asynchronously consuming future updates
        startInterview(chatId);
        return;
      }

      // If no active interview, prompt to start
      if (!sessions.has(chatId) || sessions.get(chatId)?.state === 'failed') {
        await transport.sendMessage(chatId, 'Welcome! Send /start to begin provider onboarding.');
      }
    },

    startPolling(): { stop: () => void } {
      let running = true;

      const poll = async () => {
        while (running) {
          try {
            const updates = await transport.getUpdates(pollingOffset, 30);
            for (const update of updates) {
              pollingOffset = update.update_id + 1;
              await bot.handleUpdate(update);
            }
          } catch {
            // Network error — retry after delay
            if (running) await new Promise(r => setTimeout(r, 5000));
          }
        }
      };

      poll();

      return {
        stop: () => { running = false; },
      };
    },

    getActiveSessions: () => new Map(sessions),
  };

  return bot;
}
