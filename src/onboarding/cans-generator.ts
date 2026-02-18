/**
 * CANS.md content generator.
 * Transforms a completed CANSDocument and clinical philosophy into CANS.md file content.
 */

import { stringifyYAML } from '../vendor/yaml/index.js';
import { Value } from '@sinclair/typebox/value';
import { CANSSchema } from '../activation/cans-schema.js';
import type { CANSDocument } from '../activation/cans-schema.js';

// ---------------------------------------------------------------------------
// GenerationResult
// ---------------------------------------------------------------------------

export interface GenerationResult {
  success: boolean;
  content?: string;       // Full CANS.md file content (frontmatter + body)
  document?: CANSDocument;
  errors?: Array<{ path: string; message: string }>;
}

// ---------------------------------------------------------------------------
// generateCANSContent
// ---------------------------------------------------------------------------

export function generateCANSContent(data: CANSDocument, philosophy: string): GenerationResult {
  // Step 1: Validate before YAML stringify
  if (!Value.Check(CANSSchema, data)) {
    const errors = [...Value.Errors(CANSSchema, data)].map((e) => ({
      path: e.path,
      message: e.message,
    }));
    return { success: false, errors };
  }

  // Step 2: Stringify to YAML
  const yaml = stringifyYAML(data);

  // Step 3: Generate markdown body
  const provider = data.provider;
  const autonomy = data.autonomy;
  const hardening = data.hardening;

  const subspecialtyLine = provider.subspecialty
    ? `Subspecialty: ${provider.subspecialty}\n`
    : '';
  const institutionLine = provider.institution
    ? `Institution: ${provider.institution}\n`
    : '';

  const hardeningLines = Object.entries(hardening)
    .map(([flag, value]) => `- ${flag}: ${value ? 'enabled' : 'disabled'}`)
    .join('\n');

  const body = `# Care Agent Nervous System

## Provider Summary

${provider.name} (${provider.license.type})
Specialty: ${provider.specialty}
${subspecialtyLine}${institutionLine}
## Clinical Philosophy

${philosophy}

## Autonomy Configuration

| Action | Tier |
|--------|------|
| Chart | ${autonomy.chart} |
| Order | ${autonomy.order} |
| Charge | ${autonomy.charge} |
| Perform | ${autonomy.perform} |

## Hardening Configuration

All hardening layers are enabled by default for maximum safety.
${hardeningLines}`;

  // Step 4: Assemble full content
  const content = `---\n${yaml}---\n\n${body}`;

  // Step 5: Return success
  return { success: true, content, document: data };
}

// ---------------------------------------------------------------------------
// generatePreview
// ---------------------------------------------------------------------------

export function generatePreview(data: CANSDocument, philosophy: string): string {
  const provider = data.provider;
  const autonomy = data.autonomy;
  const hardening = data.hardening;
  const consent = data.consent;

  const lines: string[] = [];

  lines.push('================================================================================');
  lines.push('  CANS.md Preview');
  lines.push('================================================================================');
  lines.push('');
  lines.push('Provider');
  lines.push(`  Name:     ${provider.name}`);
  lines.push(`  License:  ${provider.license.type} — ${provider.license.state} #${provider.license.number}`);
  lines.push(`  Specialty: ${provider.specialty}`);
  if (provider.subspecialty) {
    lines.push(`  Subspecialty: ${provider.subspecialty}`);
  }
  if (provider.institution) {
    lines.push(`  Institution: ${provider.institution}`);
  }

  lines.push('');
  lines.push('Clinical Philosophy');
  lines.push(`  ${philosophy.slice(0, 120)}${philosophy.length > 120 ? '...' : ''}`);

  lines.push('');
  lines.push('Autonomy Tiers');
  lines.push(`  Chart:   ${autonomy.chart}`);
  lines.push(`  Order:   ${autonomy.order}`);
  lines.push(`  Charge:  ${autonomy.charge}`);
  lines.push(`  Perform: ${autonomy.perform}`);

  lines.push('');
  lines.push('Hardening Flags');
  for (const [flag, value] of Object.entries(hardening)) {
    lines.push(`  ${flag}: ${value ? 'ON' : 'OFF'}`);
  }

  lines.push('');
  lines.push('Consent');
  lines.push(`  HIPAA warning acknowledged: ${consent.hipaa_warning_acknowledged ? 'yes' : 'no'}`);
  lines.push(`  Synthetic data only:        ${consent.synthetic_data_only ? 'yes' : 'no'}`);
  lines.push(`  Audit consent:              ${consent.audit_consent ? 'yes' : 'no'}`);

  lines.push('');
  lines.push('================================================================================');

  return lines.join('\n');
}
