import { describe, expect, it } from 'vitest';
import {
  alertLevel,
  buildBillingMonthHref,
  formatBillingMonthLabel,
  isDateInBillingMonth,
  nextPeriod,
  resolveBillingMonth,
  shiftBillingMonth,
  toLocalDateKey,
} from './dates';

describe('dates utility', () => {
  describe('nextPeriod', () => {
    it('calculates 30 days cycle correctly including start, end and due date', () => {
      expect(nextPeriod('2026-01-21', 30)).toEqual({
        start: '2026-01-21',
        end: '2026-02-19',
        due: '2026-02-20',
      });
    });

    it('calculates custom cycle correctly (e.g. 15 days)', () => {
      expect(nextPeriod('2026-01-01', 15)).toEqual({
        start: '2026-01-01',
        end: '2026-01-15',
        due: '2026-01-16',
      });
    });

    it('calculates custom cycle of 1 day correctly', () => {
      expect(nextPeriod('2026-01-01', 1)).toEqual({
        start: '2026-01-01',
        end: '2026-01-01',
        due: '2026-01-02',
      });
    });
  });

  describe('alertLevel', () => {
    it('returns overdue when today is after the due date', () => {
      expect(alertLevel('2026-02-21', '2026-02-20')).toBe('overdue');
    });

    it('returns due_today when today is the due date', () => {
      expect(alertLevel('2026-02-20', '2026-02-20')).toBe('due_today');
    });

    it('returns due_soon when today is exactly 7 days before the due date', () => {
      expect(alertLevel('2026-02-13', '2026-02-20')).toBe('due_soon');
    });

    it('returns due_soon when today is 1 day before the due date', () => {
      expect(alertLevel('2026-02-19', '2026-02-20')).toBe('due_soon');
    });

    it('returns ok when today is 8 days before the due date', () => {
      expect(alertLevel('2026-02-12', '2026-02-20')).toBe('ok');
    });

    it('returns ok when today is far in the past compared to the due date', () => {
      expect(alertLevel('2026-01-01', '2026-02-20')).toBe('ok');
    });
  });

  it('formats the calendar day from local date parts without converting through UTC', () => {
    expect(toLocalDateKey(new Date(2026, 7, 30, 23, 59, 59))).toBe('2026-08-30');
  });

  describe('billing month navigation', () => {
    it('defaults to the current local calendar month', () => {
      expect(resolveBillingMonth(null, new Date(2026, 7, 30, 23, 59, 59))).toBe('2026-08');
      expect(resolveBillingMonth('invalid', new Date(2026, 7, 30))).toBe('2026-08');
    });

    it('moves across previous and next months including year boundaries', () => {
      expect(shiftBillingMonth('2026-01', -1)).toBe('2025-12');
      expect(shiftBillingMonth('2026-12', 1)).toBe('2027-01');
    });

    it('formats Portuguese labels and matches dates by their due month', () => {
      expect(formatBillingMonthLabel('2026-08')).toBe('AGO/2026');
      expect(isDateInBillingMonth('2026-08-31', '2026-08')).toBe(true);
      expect(isDateInBillingMonth('2026-09-01', '2026-08')).toBe(false);
    });

    it('builds the selected-month URL while preserving the other filters', () => {
      expect(buildBillingMonthHref(
        '/contratos-locacoes/cobrancas',
        'month=2026-08&status=paid',
        '2026-07'
      )).toBe('/contratos-locacoes/cobrancas?month=2026-07&status=paid');
    });
  });
});
