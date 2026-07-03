import { describe, expect, it } from 'vitest';
import { nextPeriod, alertLevel } from './dates';

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
});
