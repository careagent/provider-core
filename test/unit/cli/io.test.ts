/**
 * Tests for InterviewIO abstraction — createMockIO behaviour.
 */

import { describe, it, expect } from 'vitest';
import { createMockIO } from '../../../src/cli/io.js';

describe('createMockIO', () => {
  describe('question', () => {
    it('returns responses sequentially', async () => {
      const io = createMockIO(['first', 'second', 'third']);
      expect(await io.question('q1')).toBe('first');
      expect(await io.question('q2')).toBe('second');
      expect(await io.question('q3')).toBe('third');
    });

    it('returns empty string when responses are exhausted', async () => {
      const io = createMockIO(['only']);
      await io.question('q1'); // consume
      expect(await io.question('q2')).toBe('');
    });
  });

  describe('select', () => {
    const options = ['apple', 'banana', 'cherry'];

    it('returns parsed integer index from responses', async () => {
      const io = createMockIO(['2']);
      expect(await io.select('pick', options)).toBe(2);
    });

    it('returns 0 when response is "0"', async () => {
      const io = createMockIO(['0']);
      expect(await io.select('pick', options)).toBe(0);
    });

    it('clamps to options.length - 1 when response exceeds bounds', async () => {
      const io = createMockIO(['99']);
      expect(await io.select('pick', options)).toBe(options.length - 1);
    });

    it('returns 0 when responses are exhausted (defaults to "0")', async () => {
      const io = createMockIO([]);
      expect(await io.select('pick', options)).toBe(0);
    });
  });

  describe('confirm', () => {
    it('returns true when response starts with "y"', async () => {
      const io = createMockIO(['yes']);
      expect(await io.confirm('continue?')).toBe(true);
    });

    it('returns true when response is "y"', async () => {
      const io = createMockIO(['y']);
      expect(await io.confirm('continue?')).toBe(true);
    });

    it('returns false when response starts with "n"', async () => {
      const io = createMockIO(['no']);
      expect(await io.confirm('continue?')).toBe(false);
    });

    it('returns false when response is "n"', async () => {
      const io = createMockIO(['n']);
      expect(await io.confirm('continue?')).toBe(false);
    });

    it('returns false when responses are exhausted (defaults to "n")', async () => {
      const io = createMockIO([]);
      expect(await io.confirm('continue?')).toBe(false);
    });
  });

  describe('display', () => {
    it('captures displayed text in order', () => {
      const io = createMockIO([]);
      io.display('line one');
      io.display('line two');
      expect(io.getOutput()).toEqual(['line one', 'line two']);
    });

    it('returns empty array when nothing has been displayed', () => {
      const io = createMockIO([]);
      expect(io.getOutput()).toEqual([]);
    });
  });

  describe('close', () => {
    it('does not throw', () => {
      const io = createMockIO([]);
      expect(() => io.close()).not.toThrow();
    });
  });

  describe('getOutput', () => {
    it('reflects all display calls', () => {
      const io = createMockIO([]);
      io.display('alpha');
      io.display('beta');
      io.display('gamma');
      expect(io.getOutput()).toHaveLength(3);
      expect(io.getOutput()[0]).toBe('alpha');
      expect(io.getOutput()[2]).toBe('gamma');
    });
  });
});
