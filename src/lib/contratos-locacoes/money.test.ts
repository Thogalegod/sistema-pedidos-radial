import { describe, expect, it } from 'vitest';
import { calculateBilling, formatBRL, parseBRL } from './money';

describe('money utility', () => {
  describe('calculateBilling', () => {
    it('calculates the total billing correctly', () => {
      expect(
        calculateBilling({
          base: 200000, // 2000.00
          discount: 10000, // 100.00
          surcharge: 5000, // 50.00
          exemption: 0,
        })
      ).toBe(195000); // 1950.00
    });

    it('returns zero if the discount and exemption exceed the base and surcharge', () => {
      expect(
        calculateBilling({
          base: 10000, // 100.00
          discount: 15000, // 150.00
          surcharge: 2000, // 20.00
          exemption: 5000, // 50.00
        })
      ).toBe(0);
    });

    it('handles exemption correctly', () => {
      expect(
        calculateBilling({
          base: 100000, // 1000.00
          discount: 0,
          surcharge: 0,
          exemption: 100000, // 1000.00 (fully exempt)
        })
      ).toBe(0);
    });
  });

  describe('formatBRL', () => {
    it('formats values in cents to BRL currency string', () => {
      expect(formatBRL(0)).toBe('R$ 0,00');
      expect(formatBRL(5)).toBe('R$ 0,05');
      expect(formatBRL(50)).toBe('R$ 0,50');
      expect(formatBRL(100)).toBe('R$ 1,00');
      expect(formatBRL(1250)).toBe('R$ 12,50');
      expect(formatBRL(100000)).toBe('R$ 1.000,00');
      expect(formatBRL(123456789)).toBe('R$ 1.234.567,89');
      expect(formatBRL('150000')).toBe('R$ 1.500,00');
    });

    it('formats negative values correctly', () => {
      expect(formatBRL(-100)).toBe('-R$ 1,00');
      expect(formatBRL(-125060)).toBe('-R$ 1.250,60');
    });
  });

  describe('formatBRLInWords', () => {
    it.each([
      [100, 'Um real'],
      [1000, 'Dez reais'],
      [40000, 'Quatrocentos reais'],
      [100000, 'Mil reais'],
      [300000, 'Três mil reais'],
      [500050, 'Cinco mil reais e cinquenta centavos'],
    ])('writes %i cents in Portuguese', async (amountInCents, expected) => {
      const moneyModule = await import('./money') as typeof import('./money') & {
        formatBRLInWords?: (value: number | string) => string;
      };

      expect(moneyModule.formatBRLInWords).toBeTypeOf('function');
      expect(moneyModule.formatBRLInWords?.(amountInCents)).toBe(expected);
    });
  });

  describe('parseBRL', () => {
    it('parses valid BRL strings to cents', () => {
      expect(parseBRL('R$ 1,00')).toBe(100);
      expect(parseBRL('R$ 12,50')).toBe(1250);
      expect(parseBRL('R$ 1.000,00')).toBe(100000);
      expect(parseBRL('1.250,60')).toBe(125060);
      expect(parseBRL('R$1.250,60')).toBe(125060);
    });

    it('parses plain digit values as reais', () => {
      expect(parseBRL('123')).toBe(12300);
      expect(parseBRL('1500')).toBe(150000);
      expect(parseBRL('150000')).toBe(15000000);
    });

    it('parses decimal BRL values without currency symbols', () => {
      expect(parseBRL('123,45')).toBe(12345);
      expect(parseBRL('0,50')).toBe(50);
      expect(parseBRL('1.500,50')).toBe(150050);
    });

    it('handles empty or invalid inputs', () => {
      expect(parseBRL('')).toBe(0);
      expect(parseBRL('abc')).toBe(0);
    });

    it('handles negative values', () => {
      expect(parseBRL('-R$ 1,00')).toBe(-100);
      expect(parseBRL('-12,50')).toBe(-1250);
    });

    it('avoids floating point rounding issues', () => {
      // 0.29 * 100 in Javascript floats can be 28.999999999999996
      expect(parseBRL('0,29')).toBe(29);
      expect(parseBRL('1234,57')).toBe(123457);
    });
  });
});
