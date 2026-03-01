/**
 * Tests for the onboarding BOOTSTRAP.md and CANS-SCHEMA.md generators.
 */

import { describe, it, expect } from 'vitest';
import {
  generateOnboardingBootstrap,
  generateCansSchemaReference,
} from '../../../src/onboarding/onboarding-bootstrap.js';

describe('generateOnboardingBootstrap', () => {
  it('contains all interview stage sections', () => {
    const content = generateOnboardingBootstrap();
    expect(content).toContain('Stage 1: HIPAA');
    expect(content).toContain('Stage 2: Provider Identity');
    expect(content).toContain('Stage 3: Credentials');
    expect(content).toContain('Stage 4: Specialty');
    expect(content).toContain('Stage 5: Scope of Practice');
    expect(content).toContain('Stage 6: Clinical Philosophy');
    expect(content).toContain('Stage 7: Voice Preferences');
    expect(content).toContain('Stage 8: Autonomy Tiers');
  });

  it('contains HIPAA warning text', () => {
    const content = generateOnboardingBootstrap();
    expect(content).toContain('HIPAA');
    expect(content).toContain('synthetic data only');
    expect(content).toContain('audit');
  });

  it('contains the CANS.md output format example', () => {
    const content = generateOnboardingBootstrap();
    expect(content).toContain('version: "2.0"');
    expect(content).toContain('provider:');
    expect(content).toContain('scope:');
    expect(content).toContain('autonomy:');
    expect(content).toContain('consent:');
    expect(content).toContain('skills:');
  });

  it('contains validation rules', () => {
    const content = generateOnboardingBootstrap();
    expect(content).toContain('Validation Rules');
    expect(content).toContain('10 digits');
    expect(content).toContain('at least 1');
    expect(content).toContain('autonomous');
    expect(content).toContain('supervised');
    expect(content).toContain('manual');
  });

  it('contains all 7 autonomy actions', () => {
    const content = generateOnboardingBootstrap();
    for (const action of ['chart', 'order', 'charge', 'perform', 'interpret', 'educate', 'coordinate']) {
      expect(content).toContain(action);
    }
  });

  it('tells provider to send /careagent_on after writing CANS.md', () => {
    const content = generateOnboardingBootstrap();
    expect(content).toContain('/careagent_on');
    expect(content).toContain('After Writing CANS.md');
  });

  it('includes Axon URL when provided', () => {
    const content = generateOnboardingBootstrap({ axonUrl: 'http://147.93.114.93:9999' });
    expect(content).toContain('http://147.93.114.93:9999');
    expect(content).toContain('questionnaires/physician');
  });

  it('does not include Axon URL when not provided', () => {
    const content = generateOnboardingBootstrap();
    expect(content).not.toContain('questionnaires/physician');
  });

  it('instructs one section at a time conversation style', () => {
    const content = generateOnboardingBootstrap();
    expect(content).toContain('one section at a time');
    expect(content).toContain('Do not dump all questions at once');
  });
});

describe('generateCansSchemaReference', () => {
  it('contains all top-level fields', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('version');
    expect(content).toContain('provider');
    expect(content).toContain('scope');
    expect(content).toContain('autonomy');
    expect(content).toContain('voice');
    expect(content).toContain('consent');
    expect(content).toContain('skills');
    expect(content).toContain('cross_installation');
  });

  it('contains provider sub-fields', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('name');
    expect(content).toContain('npi');
    expect(content).toContain('types');
    expect(content).toContain('degrees');
    expect(content).toContain('licenses');
    expect(content).toContain('certifications');
    expect(content).toContain('dea_number');
    expect(content).toContain('specialty');
    expect(content).toContain('subspecialty');
    expect(content).toContain('organizations');
    expect(content).toContain('credential_status');
  });

  it('contains organization sub-fields', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('department');
    expect(content).toContain('privileges');
    expect(content).toContain('neuron_endpoint');
    expect(content).toContain('neuron_registration_id');
    expect(content).toContain('primary');
  });

  it('contains consent fields', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('hipaa_warning_acknowledged');
    expect(content).toContain('synthetic_data_only');
    expect(content).toContain('audit_consent');
    expect(content).toContain('acknowledged_at');
  });

  it('contains a complete valid example', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('Complete Valid Example');
    expect(content).toContain('Dr. Jane Smith');
    expect(content).toContain('Internal Medicine');
  });

  it('documents all autonomy tier values', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('autonomous');
    expect(content).toContain('supervised');
    expect(content).toContain('manual');
  });

  it('documents NPI pattern constraint', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('^[0-9]{10}$');
  });

  it('documents DEA number pattern constraint', () => {
    const content = generateCansSchemaReference();
    expect(content).toContain('^[A-Z]{2}\\d{7}$');
  });
});
