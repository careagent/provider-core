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

  const primaryOrg = provider.organizations.find((o) => o.primary) ?? provider.organizations[0];

  const specialtyLine = provider.specialty
    ? `Specialty: ${provider.specialty}\n`
    : '';
  const subspecialtyLine = provider.subspecialty
    ? `Subspecialty: ${provider.subspecialty}\n`
    : '';
  const orgLine = primaryOrg
    ? `Organization: ${primaryOrg.name}\n`
    : '';

  const body = `# Care Agent Nervous System

## Provider Summary

${provider.name} (${provider.types.join(', ')})
${specialtyLine}${subspecialtyLine}${orgLine}
## Clinical Philosophy

${philosophy}

## Autonomy Configuration

| Action | Tier |
|--------|------|
| Chart | ${autonomy.chart} |
| Order | ${autonomy.order} |
| Charge | ${autonomy.charge} |
| Perform | ${autonomy.perform} |
| Interpret | ${autonomy.interpret} |
| Educate | ${autonomy.educate} |
| Coordinate | ${autonomy.coordinate} |`;

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
  const consent = data.consent;
  const primaryOrg = provider.organizations.find((o) => o.primary) ?? provider.organizations[0];

  const lines: string[] = [];

  lines.push('================================================================================');
  lines.push('  CANS.md Preview');
  lines.push('================================================================================');
  lines.push('');
  lines.push('Provider');
  lines.push(`  Name:           ${provider.name}`);
  lines.push(`  Types:          ${provider.types.join(', ')}`);
  if (provider.degrees.length > 0) {
    lines.push(`  Degrees:        ${provider.degrees.join(', ')}`);
  }
  if (provider.licenses.length > 0) {
    lines.push(`  Licenses:       ${provider.licenses.join(', ')}`);
  }
  if (provider.certifications.length > 0) {
    lines.push(`  Certifications: ${provider.certifications.join(', ')}`);
  }
  if (provider.specialty) {
    lines.push(`  Specialty:      ${provider.specialty}`);
  }
  if (provider.subspecialty) {
    lines.push(`  Subspecialty:   ${provider.subspecialty}`);
  }
  if (primaryOrg) {
    lines.push(`  Organization:   ${primaryOrg.name}`);
  }

  lines.push('');
  lines.push('Clinical Philosophy');
  lines.push(`  ${philosophy.slice(0, 120)}${philosophy.length > 120 ? '...' : ''}`);

  lines.push('');
  lines.push('Autonomy Tiers');
  lines.push(`  Chart:      ${autonomy.chart}`);
  lines.push(`  Order:      ${autonomy.order}`);
  lines.push(`  Charge:     ${autonomy.charge}`);
  lines.push(`  Perform:    ${autonomy.perform}`);
  lines.push(`  Interpret:  ${autonomy.interpret}`);
  lines.push(`  Educate:    ${autonomy.educate}`);
  lines.push(`  Coordinate: ${autonomy.coordinate}`);

  lines.push('');
  lines.push('Consent');
  lines.push(`  HIPAA warning acknowledged: ${consent.hipaa_warning_acknowledged ? 'yes' : 'no'}`);
  lines.push(`  Synthetic data only:        ${consent.synthetic_data_only ? 'yes' : 'no'}`);
  lines.push(`  Audit consent:              ${consent.audit_consent ? 'yes' : 'no'}`);
  lines.push(`  Acknowledged at:            ${consent.acknowledged_at}`);

  lines.push('');
  lines.push('================================================================================');

  return lines.join('\n');
}
