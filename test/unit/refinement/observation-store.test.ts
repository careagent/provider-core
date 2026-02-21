import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ObservationStore } from '../../../src/refinement/observation-store.js';
import type { Observation } from '../../../src/refinement/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObservation(overrides?: Partial<Observation>): Observation {
  return {
    timestamp: new Date().toISOString(),
    session_id: 'test-session-001',
    category: 'voice',
    field_path: 'voice.chart',
    declared_value: 'formal',
    observed_value: 'conversational',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ObservationStore', () => {
  let workspacePath: string;
  let store: ObservationStore;

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'careagent-obs-test-'));
    store = new ObservationStore(workspacePath);
  });

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true });
  });

  it('creates .careagent directory automatically on first append', () => {
    const careagentDir = join(workspacePath, '.careagent');
    expect(existsSync(careagentDir)).toBe(false);

    store.append(makeObservation());

    expect(existsSync(careagentDir)).toBe(true);
  });

  it('appends observations in JSONL format with newline separator', () => {
    const obs1 = makeObservation({ field_path: 'voice.chart' });
    const obs2 = makeObservation({ field_path: 'voice.order' });

    store.append(obs1);
    store.append(obs2);

    const filePath = join(workspacePath, '.careagent', 'observations.jsonl');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(obs1);
    expect(JSON.parse(lines[1])).toEqual(obs2);
  });

  it('queries all observations correctly', () => {
    const obs1 = makeObservation({ field_path: 'voice.chart' });
    const obs2 = makeObservation({ field_path: 'autonomy.chart', category: 'autonomy' });

    store.append(obs1);
    store.append(obs2);

    const result = store.query();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(obs1);
    expect(result[1]).toEqual(obs2);
  });

  it('queries with filter by category', () => {
    store.append(makeObservation({ category: 'voice', field_path: 'voice.chart' }));
    store.append(makeObservation({ category: 'autonomy', field_path: 'autonomy.chart' }));
    store.append(makeObservation({ category: 'voice', field_path: 'voice.educate' }));

    const voiceObs = store.query({ category: 'voice' });
    expect(voiceObs).toHaveLength(2);
    expect(voiceObs.every((o) => o.category === 'voice')).toBe(true);

    const autonomyObs = store.query({ category: 'autonomy' });
    expect(autonomyObs).toHaveLength(1);
    expect(autonomyObs[0].field_path).toBe('autonomy.chart');
  });

  it('queries with filter by field_path', () => {
    store.append(makeObservation({ field_path: 'voice.chart' }));
    store.append(makeObservation({ field_path: 'voice.chart' }));
    store.append(makeObservation({ field_path: 'autonomy.chart', category: 'autonomy' }));

    const toneObs = store.query({ field_path: 'voice.chart' });
    expect(toneObs).toHaveLength(2);
    expect(toneObs.every((o) => o.field_path === 'voice.chart')).toBe(true);
  });

  it('returns empty array when file does not exist', () => {
    const result = store.query();
    expect(result).toEqual([]);
  });

  it('clear removes the observations file', () => {
    store.append(makeObservation());
    const filePath = join(workspacePath, '.careagent', 'observations.jsonl');
    expect(existsSync(filePath)).toBe(true);

    store.clear();
    expect(existsSync(filePath)).toBe(false);
  });

  it('query returns empty array after clear', () => {
    store.append(makeObservation());
    store.clear();
    expect(store.query()).toEqual([]);
  });
});
