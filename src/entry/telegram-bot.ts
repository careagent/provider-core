/**
 * Standalone Telegram bot for CareAgent protocol onboarding.
 *
 * Polls Telegram directly (no OpenClaw Telegram channel needed).
 * - /start → welcome message
 * - /careagent_on → starts protocol onboarding
 * - /reset → clears CANS.md for re-onboarding
 *
 * Run: node dist/entry/telegram-bot.js
 *
 * Required env vars: TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, AXON_URL
 * Optional: WORKSPACE_PATH (default: ./workspace-clinical), CAREAGENT_MODEL
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTelegramTransport } from '../bot/telegram-client.js';
import { createTelegramMessageIO } from '../protocol/message-io.js';
import { createLLMClient } from '../protocol/llm-client.js';
import { runProtocolOnboarding } from '../onboarding/protocol-onboarding.js';
import type { TelegramUpdate } from '../bot/telegram-client.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'];
const API_KEY = process.env['ANTHROPIC_API_KEY'];
const AXON_URL = process.env['AXON_URL'];
const WORKSPACE = resolve(process.env['WORKSPACE_PATH'] || './workspace-clinical');
const MODEL = process.env['CAREAGENT_MODEL'] || undefined;

if (!BOT_TOKEN || !API_KEY || !AXON_URL) {
  console.error('Missing required env vars: TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, AXON_URL');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeSessions = new Set<number>();
let pollOffset = 0;
const transport = createTelegramTransport(BOT_TOKEN);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || !msg.chat) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '/start') {
    await transport.sendMessage(chatId, [
      '⚕️ Welcome to CareAgent.',
      '',
      'Send /careagent\\_on to begin provider onboarding.',
      'Send /reset to clear a previous onboarding.',
    ].join('\n'));
    return;
  }

  if (text === '/careagent_on') {
    if (activeSessions.has(chatId)) {
      await transport.sendMessage(chatId, 'Onboarding is already in progress.');
      return;
    }
    if (existsSync(resolve(WORKSPACE, 'CANS.md'))) {
      await transport.sendMessage(chatId, 'Already onboarded. Send /reset to start over.');
      return;
    }
    startOnboarding(chatId);
    return;
  }

  if (text === '/reset') {
    const { rmSync } = await import('node:fs');
    for (const f of ['CANS.md', 'CANS.md.sha256']) {
      const p = resolve(WORKSPACE, f);
      if (existsSync(p)) try { rmSync(p); } catch { /* ignore */ }
    }
    activeSessions.delete(chatId);
    await transport.sendMessage(chatId, 'Reset complete. Send /careagent\\_on to onboard again.');
    return;
  }
}

function startOnboarding(chatId: number): void {
  activeSessions.add(chatId);
  if (!existsSync(WORKSPACE)) mkdirSync(WORKSPACE, { recursive: true });

  const llmClient = createLLMClient({ apiKey: API_KEY!, model: MODEL });
  const messageIO = createTelegramMessageIO({
    transport,
    chatId,
    initialOffset: pollOffset,
  });

  console.log(`[bot] Onboarding started for chat ${chatId}`);

  runProtocolOnboarding({
    llmClient,
    messageIO,
    axonUrl: AXON_URL!,
    workspacePath: WORKSPACE,
    respondent: String(chatId),
    audit: (event) => console.log(`[audit] ${event.event}`),
  }).then((result) => {
    activeSessions.delete(chatId);
    if (result.success) {
      console.log(`[bot] Onboarding completed for chat ${chatId}`);
    } else {
      console.error(`[bot] Onboarding failed: ${result.error}`);
    }
  }).catch((err) => {
    activeSessions.delete(chatId);
    console.error(`[bot] Onboarding error:`, err);
    transport.sendMessage(chatId, `Onboarding error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

async function pollLoop(): Promise<void> {
  console.log(`[bot] Polling Telegram... (workspace: ${WORKSPACE})`);

  while (true) {
    try {
      if (activeSessions.size > 0) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const updates = await transport.getUpdates(pollOffset, 10);
      for (const update of updates) {
        pollOffset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409')) {
        console.warn('[bot] 409 conflict — retrying in 5s');
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        console.error('[bot] Poll error:', msg);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
}

pollLoop().catch((err) => {
  console.error('[bot] Fatal:', err);
  process.exit(1);
});
