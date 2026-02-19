/**
 * TypeBox schema for skill-manifest.json validation.
 *
 * Validates the structure of skill manifests including skill_id, semver
 * version, credential requirements, file checksums, and version pinning.
 *
 * Uses the same Value.Check/Value.Errors pattern as CANS schema validation.
 */

import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { SkillManifest } from './types.js';

// ---------------------------------------------------------------------------
// Skill Manifest Schema
// ---------------------------------------------------------------------------

export const SkillManifestSchema = Type.Object({
  skill_id: Type.String({ minLength: 1 }),
  version: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+$' }),
  requires: Type.Object({
    license: Type.Optional(Type.Array(Type.String())),
    specialty: Type.Optional(Type.Array(Type.String())),
    privilege: Type.Optional(Type.Array(Type.String())),
  }),
  files: Type.Record(Type.String(), Type.String()),
  pinned: Type.Boolean(),
  approved_version: Type.String(),
});

export type SkillManifestData = Static<typeof SkillManifestSchema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ManifestValidationResult =
  | { valid: true; manifest: SkillManifest }
  | { valid: false; errors: string[] };

export function validateManifest(data: unknown): ManifestValidationResult {
  if (Value.Check(SkillManifestSchema, data)) {
    return { valid: true, manifest: data as SkillManifest };
  }

  const errors = [...Value.Errors(SkillManifestSchema, data)].map(
    (e) => `${e.path}: ${e.message}`,
  );

  return { valid: false, errors };
}
