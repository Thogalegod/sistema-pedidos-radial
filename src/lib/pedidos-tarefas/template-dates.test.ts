import { describe, expect, it } from 'vitest';
import { addCalendarDays } from './template-dates';

describe('addCalendarDays', () => {
  it.each([
    ['2026-09-23', 0, '2026-09-23'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 1, '2028-03-01'],
  ])('adds calendar days to %s', (date, days, expected) => {
    expect(addCalendarDays(date, days)).toBe(expected);
  });

  it('rejects invalid civil dates and non-integer negative offsets', () => {
    expect(() => addCalendarDays('2026-02-30', 1)).toThrow('Data civil inválida');
    expect(() => addCalendarDays('2026-09-23', -1)).toThrow('Offset inválido');
    expect(() => addCalendarDays('2026-09-23', 1.5)).toThrow('Offset inválido');
  });
});
