import { compareCivilDateKeys } from './task-due';
import type { DateKey, InstanceDateRule } from './types';

export function addCalendarDays(date: DateKey, days: number): DateKey {
  compareCivilDateKeys(date, date);
  if (!Number.isInteger(days) || days < 0) throw new Error(`Offset inválido: ${days}`);
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  const key = result.toISOString().slice(0, 10);
  compareCivilDateKeys(key, key);
  return key;
}

export function pendingRuleLabel(rule: InstanceDateRule, sourceTitle: string): string {
  if (rule.state !== 'pending') throw new Error('Regra não está pendente');
  const amount = rule.offsetDays === 1 ? '1 dia' : `${rule.offsetDays} dias`;
  return `${amount} após concluir ${sourceTitle}`;
}
