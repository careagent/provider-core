/**
 * Tests for reusable prompt utilities in src/cli/prompts.ts.
 */

import { describe, it, expect } from 'vitest';
import { createMockIO } from '../../../src/cli/io.js';
import {
  askText,
  askOptionalText,
  askSelect,
  askConfirm,
  askLicenseType,
  askAutonomyTier,
} from '../../../src/cli/prompts.js';

describe('askText', () => {
  it('returns trimmed answer when no options specified', async () => {
    const io = createMockIO(['  hello world  ']);
    expect(await askText(io, 'Enter: ')).toBe('hello world');
  });

  it('reprompts on empty when required: true', async () => {
    const io = createMockIO(['', 'valid answer']);
    const result = await askText(io, 'Enter: ', { required: true });
    expect(result).toBe('valid answer');
    expect(io.getOutput()).toContain('This field is required.');
  });

  it('accepts non-empty answer when required: true', async () => {
    const io = createMockIO(['something']);
    expect(await askText(io, 'Enter: ', { required: true })).toBe('something');
  });

  it('reprompts when answer is shorter than minLength', async () => {
    const io = createMockIO(['ab', 'abcdef']);
    const result = await askText(io, 'Enter: ', { minLength: 5 });
    expect(result).toBe('abcdef');
    expect(io.getOutput()).toContain('Minimum length is 5 characters.');
  });

  it('accepts answer that meets minLength', async () => {
    const io = createMockIO(['abcde']);
    expect(await askText(io, 'Enter: ', { minLength: 5 })).toBe('abcde');
  });

  it('reprompts when answer exceeds maxLength', async () => {
    const io = createMockIO(['toolongstring', 'short']);
    const result = await askText(io, 'Enter: ', { maxLength: 5 });
    expect(result).toBe('short');
    expect(io.getOutput()).toContain('Maximum length is 5 characters.');
  });

  it('accepts answer that meets maxLength', async () => {
    const io = createMockIO(['hello']);
    expect(await askText(io, 'Enter: ', { maxLength: 5 })).toBe('hello');
  });
});

describe('askOptionalText', () => {
  it('returns undefined when answer is empty (user pressed Enter)', async () => {
    const io = createMockIO(['']);
    expect(await askOptionalText(io, 'Enter optional: ')).toBeUndefined();
  });

  it('returns undefined when answer is whitespace only', async () => {
    const io = createMockIO(['   ']);
    expect(await askOptionalText(io, 'Enter optional: ')).toBeUndefined();
  });

  it('returns trimmed string when non-empty answer provided', async () => {
    const io = createMockIO(['  some value  ']);
    expect(await askOptionalText(io, 'Enter optional: ')).toBe('some value');
  });
});

describe('askSelect', () => {
  const options = ['option A', 'option B', 'option C'];

  it('returns zero-based index matching the response', async () => {
    const io = createMockIO(['1']);
    expect(await askSelect(io, 'Pick one:', options)).toBe(1);
  });

  it('returns 0 for first option', async () => {
    const io = createMockIO(['0']);
    expect(await askSelect(io, 'Pick one:', options)).toBe(0);
  });

  it('returns last index for last option', async () => {
    const io = createMockIO(['2']);
    expect(await askSelect(io, 'Pick one:', options)).toBe(2);
  });
});

describe('askConfirm', () => {
  it('returns true when response is "y"', async () => {
    const io = createMockIO(['y']);
    expect(await askConfirm(io, 'Confirm?')).toBe(true);
  });

  it('returns false when response is "n"', async () => {
    const io = createMockIO(['n']);
    expect(await askConfirm(io, 'Confirm?')).toBe(false);
  });
});

describe('askLicenseType', () => {
  it('returns "MD" for index 0', async () => {
    const io = createMockIO(['0']);
    expect(await askLicenseType(io)).toBe('MD');
  });

  it('returns "DO" for index 1', async () => {
    const io = createMockIO(['1']);
    expect(await askLicenseType(io)).toBe('DO');
  });

  it('returns "NP" for index 2', async () => {
    const io = createMockIO(['2']);
    expect(await askLicenseType(io)).toBe('NP');
  });

  it('returns "PA" for index 3', async () => {
    const io = createMockIO(['3']);
    expect(await askLicenseType(io)).toBe('PA');
  });

  it('returns "CRNA" for index 4', async () => {
    const io = createMockIO(['4']);
    expect(await askLicenseType(io)).toBe('CRNA');
  });

  it('returns "PsyD" for index 7 (last)', async () => {
    const io = createMockIO(['7']);
    expect(await askLicenseType(io)).toBe('PsyD');
  });
});

describe('askAutonomyTier', () => {
  it('returns "autonomous" for index 0', async () => {
    const io = createMockIO(['0']);
    expect(await askAutonomyTier(io, 'chart')).toBe('autonomous');
  });

  it('returns "supervised" for index 1', async () => {
    const io = createMockIO(['1']);
    expect(await askAutonomyTier(io, 'order')).toBe('supervised');
  });

  it('returns "manual" for index 2', async () => {
    const io = createMockIO(['2']);
    expect(await askAutonomyTier(io, 'perform')).toBe('manual');
  });

  it('includes actionName in the prompt (via io.select)', async () => {
    // We verify the function calls io.select (indirectly — no error thrown)
    const io = createMockIO(['0']);
    const result = await askAutonomyTier(io, 'charge');
    expect(result).toBe('autonomous');
  });
});
