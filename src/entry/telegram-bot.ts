/**
 * Standalone Telegram bot entry point for CareAgent protocol onboarding.
 *
 * Polls Telegram directly (no OpenClaw involvement). Handles:
 * - /start and /careagent_on → starts protocol onboarding
 * - All subsequent messages → routed to protocol engine
 *
 * Run: node dist/entry/telegram-bot.js
 *
 * Required env vars:
 * - TELEGRAM_BOT_TOKEN
 * - ANTHROPIC_API_KEY
 * - AXON_URL
 * - WORKSPACE_PATH (optional, defaults to ./workspace-clinical)
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTelegramTransport } from '../bot/telegram-client.js';
import { createTelegramMessageIO } from '../protocol/message-io.js';
import { createLLMClient } from '../protocol/llm-client.js';
import { runProtocolOnboarding } from '../onboarding/protocol-onboarding.js';
import type { TelegramUpdate } from '../bot/telegram-client.js';

// ---------------------------------------------------------------------------
// Config from env
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

const activeSessions = new Map<number, { abort: AbortController }>();
let pollOffset = 0;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const transport = createTelegramTransport(BOT_TOKEN);

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text || !msg.chat) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Handle /start or /careagent_on
  if (text === '/start' || text === '/careagent_on') {
    // Check if already onboarding
    if (activeSessions.has(chatId)) {
      await transport.sendMessage(chatId, 'Onboarding is already in progress. Please continue answering the questions.');
      return;
    }

    // Check if CANS.md already exists
    const cansPath = resolve(WORKSPACE, 'CANS.md');
    if (existsSync(cansPath)) {
      await transport.sendMessage(chatId, 'You are already onboarded. CANS.md exists in the workspace. Send /reset to start over.');
      return;
    }

    // Send HIPAA disclosure as first response
    await transport.sendMessage(chatId, [
      '⚕️ *HIPAA & Synthetic Data Disclosure*',
      '',
      'CareAgent operates on _synthetic data only_.',
      'Never input real patient information.',
      'All interactions are logged to an append-only, hash-chained audit trail.',
      'By proceeding, you acknowledge these terms.',
      '',
      'Starting onboarding...',
    ].join('\n'));

    // Start onboarding
    startOnboarding(chatId);
    return;
  }

  // Handle /reset
  if (text === '/reset') {
    const { rmSync } = await import('node:fs');
    const cansPath = resolve(WORKSPACE, 'CANS.md');
    const shaPath = `${cansPath}.sha256`;
    try {
      if (existsSync(cansPath)) rmSync(cansPath);
      if (existsSync(shaPath)) rmSync(shaPath);
      activeSessions.get(chatId)?.abort.abort();
      activeSessions.delete(chatId);
      await transport.sendMessage(chatId, 'Reset complete. Send /careagent_on to start onboarding again.');
    } catch (err) {
      await transport.sendMessage(chatId, `Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // If there's an active session, the protocol engine's MessageIO will
  // pick up the message via its own getUpdates call. Since WE are the
  // only poller, there's no conflict. The protocol engine polls inline.
}

function startOnboarding(chatId: number): void {
  const abort = new AbortController();
  activeSessions.set(chatId, { abort });

  // Ensure workspace exists
  if (!existsSync(WORKSPACE)) {
    mkdirSync(WORKSPACE, { recursive: true });
  }

  const llmClient = createLLMClient({ apiKey: API_KEY!, model: MODEL });

  // Create a MessageIO that uses our shared transport
  // The protocol engine will poll for messages using this transport.
  // Since we pause our own polling while onboarding is active,
  // there's no conflict.
  const messageIO = createTelegramMessageIO({ transport, chatId });

  console.log(`[telegram-bot] Starting onboarding for chat ${chatId}`);

  runProtocolOnboarding({
    llmClient,
    messageIO,
    axonUrl: AXON_URL!,
    workspacePath: WORKSPACE,
    respondent: String(chatId),
    audit: (event) => {
      console.log(`[audit] ${event.event}`, JSON.stringify(event));
    },
  }).then((result) => {
    activeSessions.delete(chatId);
    if (result.success) {
      console.log(`[telegram-bot] Onboarding completed for chat ${chatId}`);
    } else {
      console.error(`[telegram-bot] Onboarding failed for chat ${chatId}: ${result.error}`);
    }
  }).catch((err) => {
    activeSessions.delete(chatId);
    console.error(`[telegram-bot] Onboarding error for chat ${chatId}:`, err);
    transport.sendMessage(chatId, `Onboarding error: ${err instanceof Error ? err.message : String(err)}`).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Main poll loop
// ---------------------------------------------------------------------------

async function pollLoop(): Promise<void> {
  console.log('[telegram-bot] Starting Telegram poll loop...');
  console.log(`[telegram-bot] Workspace: ${WORKSPACE}`);
  console.log(`[telegram-bot] Axon URL: ${AXON_URL}`);

  while (true) {
    try {
      // If there's an active onboarding session, skip our polling
      // to let the protocol engine's MessageIO poll without conflict.
      if (activeSessions.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
        console.warn('[telegram-bot] 409 conflict — another poller is active. Retrying in 5s...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        console.error('[telegram-bot] Poll error:', msg);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

pollLoop().catch((err) => {
  console.error('[telegram-bot] Fatal error:', err);
  process.exit(1);
});
