/**
 * ObservationStore — append-only JSONL storage for usage observations.
 *
 * Stores observations in `.careagent/observations.jsonl`, mirroring the
 * audit log's append-only pattern. Each line is a single JSON-serialized
 * Observation object.
 *
 * Zero external dependencies — uses only node:fs and node:path.
 */

import { appendFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Observation, ObservationCategory } from './types.js';

export class ObservationStore {
  private readonly storePath: string;

  constructor(workspacePath: string) {
    this.storePath = join(workspacePath, '.careagent', 'observations.jsonl');
  }

  /**
   * Append an observation as a single JSON line.
   * Creates the `.careagent/` directory if it does not exist.
   */
  append(obs: Observation): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    appendFileSync(this.storePath, JSON.stringify(obs) + '\n', { flag: 'a' });
  }

  /**
   * Read all observations, optionally filtered by category and/or field_path.
   * Returns an empty array if the observations file does not exist.
   */
  query(filter?: { category?: ObservationCategory; field_path?: string }): Observation[] {
    if (!existsSync(this.storePath)) {
      return [];
    }

    const content = readFileSync(this.storePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    let observations: Observation[] = lines.map((line) => JSON.parse(line) as Observation);

    if (filter?.category) {
      observations = observations.filter((obs) => obs.category === filter.category);
    }

    if (filter?.field_path) {
      observations = observations.filter((obs) => obs.field_path === filter.field_path);
    }

    return observations;
  }

  /**
   * Remove the observations file. Used for testing.
   */
  clear(): void {
    rmSync(this.storePath, { force: true });
  }
}
