import { compareCivilDateKeys } from './task-due';
import type { DateKey } from './types';

export function addCalendarDays(date: DateKey, days: number): DateKey {
  compareCivilDateKeys(date, date);
  if (!Number.isInteger(days) || days < 0) throw new Error(`Offset inválido: ${days}`);
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  const key = result.toISOString().slice(0, 10);
  compareCivilDateKeys(key, key);
  return key;
}
