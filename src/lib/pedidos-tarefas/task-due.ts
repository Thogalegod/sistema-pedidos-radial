import { toLocalDateKey } from '@/lib/contratos-locacoes/dates';

export type TaskDueStatus = 'overdue' | 'today' | 'upcoming' | 'undated' | 'completed';

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertCivilDateKey(value: string) {
  const match = CIVIL_DATE.exec(value);
  if (!match) throw new Error(`Data civil inválida: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new Error(`Data civil inválida: ${value}`);
  }
}

export function compareCivilDateKeys(left: string, right: string): -1 | 0 | 1 {
  assertCivilDateKey(left);
  assertCivilDateKey(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getCurrentTaskDateKey(now = new Date()) {
  return toLocalDateKey(now);
}

export function getTaskDueStatus(
  task: { completed: boolean; dueDate?: string | null },
  today = getCurrentTaskDateKey()
): TaskDueStatus {
  if (task.completed) return 'completed';
  if (!task.dueDate) return 'undated';
  const comparison = compareCivilDateKeys(task.dueDate, today);
  return comparison < 0 ? 'overdue' : comparison === 0 ? 'today' : 'upcoming';
}
