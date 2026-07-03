import { describe, expect, it } from 'vitest';
import { receiptNumber, isValidReceiptNumber } from './numbering';

describe('numbering utility', () => {
  describe('receiptNumber', () => {
    it('generates the receipt number format correctly', () => {
      expect(receiptNumber('260121', 1)).toBe('R260121001');
      expect(receiptNumber('260121', 999)).toBe('R260121999');
    });

    it('throws error for sequence out of bounds (1000)', () => {
      expect(() => receiptNumber('260121', 1000)).toThrow(/999/);
    });

    it('throws error for sequence out of bounds (0 or negative)', () => {
      expect(() => receiptNumber('260121', 0)).toThrow(/1 and 999/);
      expect(() => receiptNumber('260121', -5)).toThrow(/1 and 999/);
    });

    it('throws error for non-integer sequences', () => {
      expect(() => receiptNumber('260121', 1.5)).toThrow(/integer/);
    });

    it('throws error for invalid reference lengths', () => {
      expect(() => receiptNumber('26012', 1)).toThrow(/6/);
      expect(() => receiptNumber('2601212', 1)).toThrow(/6/);
    });

    it('throws error for invalid reference characters', () => {
      expect(() => receiptNumber('26-121', 1)).toThrow(/alphanumeric/);
    });
  });

  describe('isValidReceiptNumber', () => {
    it('returns true for correct formats', () => {
      expect(isValidReceiptNumber('R260121001')).toBe(true);
      expect(isValidReceiptNumber('RABCDEF999')).toBe(true);
    });

    it('returns false for incorrect formats', () => {
      expect(isValidReceiptNumber('r260121001')).toBe(false); // lower case r
      expect(isValidReceiptNumber('R26012100')).toBe(false); // too short
      expect(isValidReceiptNumber('R2601210001')).toBe(false); // too long
      expect(isValidReceiptNumber('NFE1234567')).toBe(false); // wrong prefix
      expect(isValidReceiptNumber('R26-121001')).toBe(false); // special char
    });
  });
});
