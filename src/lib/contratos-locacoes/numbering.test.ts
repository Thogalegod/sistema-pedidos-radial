import { describe, expect, it } from 'vitest';
import {
  buildReceiptReferenceFromInternalNumber,
  isValidReceiptNumber,
  receiptNumber,
  receiptNumberFromInternalNumber,
} from './numbering';

describe('numbering utility', () => {
  describe('receiptNumber', () => {
    it('keeps the generic short receipt format helper', () => {
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
      expect(() => receiptNumber('26-121', 1)).toThrow(/digits/);
    });
  });

  describe('receiptNumberFromInternalNumber', () => {
    it('uses the contract internal number as the approved short financial reference', () => {
      expect(buildReceiptReferenceFromInternalNumber('23')).toBe('000023');
      expect(receiptNumberFromInternalNumber('23', 1)).toBe('R000023001');
      expect(receiptNumberFromInternalNumber(23, 12)).toBe('R000023012');
    });

    it('supports long-lived manual operation without depending on legacy import data', () => {
      expect(receiptNumberFromInternalNumber('999999', 999)).toBe('R999999999');
    });

    it('rejects internal numbers that do not fit the approved 6-digit short reference', () => {
      expect(() => buildReceiptReferenceFromInternalNumber('0')).toThrow(/1 e 999999/i);
      expect(() => buildReceiptReferenceFromInternalNumber('1000000')).toThrow(/1 e 999999/i);
      expect(() => buildReceiptReferenceFromInternalNumber('12A')).toThrow(/apenas dígitos/i);
    });
  });

  describe('isValidReceiptNumber', () => {
    it('returns true for correct formats', () => {
      expect(isValidReceiptNumber('R260121001')).toBe(true);
      expect(isValidReceiptNumber('R000023001')).toBe(true);
    });

    it('returns false for incorrect formats', () => {
      expect(isValidReceiptNumber('r260121001')).toBe(false); // lower case r
      expect(isValidReceiptNumber('R26012100')).toBe(false); // too short
      expect(isValidReceiptNumber('R2601210001')).toBe(false); // too long
      expect(isValidReceiptNumber('RABCDEF999')).toBe(false); // letters not allowed in approved rule
      expect(isValidReceiptNumber('NFE1234567')).toBe(false); // wrong prefix
      expect(isValidReceiptNumber('R26-121001')).toBe(false); // special char
    });
  });
});
