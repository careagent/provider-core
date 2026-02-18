/**
 * Reusable prompt utilities built on InterviewIO.
 * All functions take io: InterviewIO as the first parameter.
 */

import type { InterviewIO } from './io.js';

export async function askText(
  io: InterviewIO,
  prompt: string,
  opts?: { required?: boolean; minLength?: number; maxLength?: number },
): Promise<string> {
  const answer = await io.question(prompt);
  const trimmed = answer.trim();

  if (opts?.required && trimmed.length === 0) {
    io.display('This field is required.');
    return askText(io, prompt, opts);
  }

  if (opts?.minLength !== undefined && trimmed.length < opts.minLength) {
    io.display(`Minimum length is ${opts.minLength} characters.`);
    return askText(io, prompt, opts);
  }

  if (opts?.maxLength !== undefined && trimmed.length > opts.maxLength) {
    io.display(`Maximum length is ${opts.maxLength} characters.`);
    return askText(io, prompt, opts);
  }

  return trimmed;
}

export async function askOptionalText(
  io: InterviewIO,
  prompt: string,
): Promise<string | undefined> {
  const answer = await io.question(prompt + ' (press Enter to skip) ');
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function askSelect(
  io: InterviewIO,
  prompt: string,
  options: string[],
): Promise<number> {
  return io.select(prompt, options);
}

export async function askConfirm(
  io: InterviewIO,
  prompt: string,
): Promise<boolean> {
  return io.confirm(prompt);
}

const LICENSE_TYPES = ['MD', 'DO', 'NP', 'PA', 'CRNA', 'CNM', 'PhD', 'PsyD'] as const;

export async function askLicenseType(
  io: InterviewIO,
): Promise<typeof LICENSE_TYPES[number]> {
  const index = await io.select('License type:', [...LICENSE_TYPES]);
  return LICENSE_TYPES[index];
}

const AUTONOMY_OPTIONS = [
  'autonomous - AI acts independently with post-hoc review',
  'supervised - AI drafts, provider approves before execution',
  'manual - Provider acts, AI assists on request',
] as const;

export async function askAutonomyTier(
  io: InterviewIO,
  actionName: string,
): Promise<'autonomous' | 'supervised' | 'manual'> {
  const index = await io.select(`Autonomy tier for ${actionName}:`, [...AUTONOMY_OPTIONS]);
  const tiers = ['autonomous', 'supervised', 'manual'] as const;
  return tiers[index];
}
