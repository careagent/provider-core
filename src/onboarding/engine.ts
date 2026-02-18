/**
 * Interview state machine orchestrator.
 * Runs all onboarding stages sequentially and returns a completed CANSDocument.
 */

import type { CANSDocument } from '../activation/cans-schema.js';
import type { InterviewIO } from '../cli/io.js';
import {
  welcomeStage,
  identityStage,
  credentialsStage,
  specialtyStage,
  scopeStage,
  philosophyStage,
  voiceStage,
  autonomyStage,
  consentStage,
} from './stages.js';

// ---------------------------------------------------------------------------
// Stage enum
// ---------------------------------------------------------------------------

export enum InterviewStage {
  WELCOME = 'WELCOME',
  IDENTITY = 'IDENTITY',
  CREDENTIALS = 'CREDENTIALS',
  SPECIALTY = 'SPECIALTY',
  SCOPE = 'SCOPE',
  PHILOSOPHY = 'PHILOSOPHY',
  VOICE = 'VOICE',
  AUTONOMY = 'AUTONOMY',
  CONSENT = 'CONSENT',
  COMPLETE = 'COMPLETE',
}

// ---------------------------------------------------------------------------
// State and result types
// ---------------------------------------------------------------------------

export interface InterviewState {
  stage: InterviewStage;
  data: Partial<CANSDocument>;
  philosophy: string;
}

export interface InterviewResult {
  data: CANSDocument;
  philosophy: string;
}

// ---------------------------------------------------------------------------
// Stage dispatch map
// ---------------------------------------------------------------------------

type StageHandler = (state: InterviewState, io: InterviewIO) => Promise<InterviewState>;

const STAGE_HANDLERS: Record<string, StageHandler> = {
  [InterviewStage.WELCOME]: welcomeStage,
  [InterviewStage.IDENTITY]: identityStage,
  [InterviewStage.CREDENTIALS]: credentialsStage,
  [InterviewStage.SPECIALTY]: specialtyStage,
  [InterviewStage.SCOPE]: scopeStage,
  [InterviewStage.PHILOSOPHY]: philosophyStage,
  [InterviewStage.VOICE]: voiceStage,
  [InterviewStage.AUTONOMY]: autonomyStage,
  [InterviewStage.CONSENT]: consentStage,
};

// ---------------------------------------------------------------------------
// runSingleStage — maps a stage to its handler and calls it
// ---------------------------------------------------------------------------

export async function runSingleStage(
  stage: InterviewStage,
  state: InterviewState,
  io: InterviewIO,
): Promise<InterviewState> {
  const handler = STAGE_HANDLERS[stage];
  if (!handler) {
    throw new Error(`No handler for stage: ${stage}`);
  }
  return handler(state, io);
}

// ---------------------------------------------------------------------------
// runInterview — orchestrates all stages in sequence
// ---------------------------------------------------------------------------

export async function runInterview(io: InterviewIO): Promise<InterviewResult> {
  const STAGE_SEQUENCE: InterviewStage[] = [
    InterviewStage.WELCOME,
    InterviewStage.IDENTITY,
    InterviewStage.CREDENTIALS,
    InterviewStage.SPECIALTY,
    InterviewStage.SCOPE,
    InterviewStage.PHILOSOPHY,
    InterviewStage.VOICE,
    InterviewStage.AUTONOMY,
    InterviewStage.CONSENT,
  ];

  let state: InterviewState = {
    stage: InterviewStage.WELCOME,
    data: { version: '1.0' },
    philosophy: '',
  };

  for (const stage of STAGE_SEQUENCE) {
    state = await runSingleStage(stage, state, io);
  }

  return {
    data: state.data as CANSDocument,
    philosophy: state.philosophy,
  };
}
