import { describe, expect, it } from 'vitest';
import { formatTermografiaReportNumber } from './numbering';

describe('formatTermografiaReportNumber', () => {
  it('formats the report number with year and zero-padded sequence', () => {
    const result = formatTermografiaReportNumber(new Date('2026-07-24T10:15:00-03:00'), 4);

    expect(result).toBe('RT-2026-004');
  });

  it('keeps three digits as the minimum, not the maximum', () => {
    const result = formatTermografiaReportNumber(new Date('2026-07-24T10:15:00-03:00'), 1000);

    expect(result).toBe('RT-2026-1000');
  });
});
