import { toLocalDateKey } from '@/lib/contratos-locacoes/dates';

export type TaskDueStatus = 'overdue' | 'today' | 'upcoming' | 'undated' | 'completed';

export function getCurrentTaskDateKey(now = new Date()) {
  return toLocalDateKey(now);
}

export function getTaskDueStatus(
  task: { completed: boolean; dueDate?: string | null },
  today = getCurrentTaskDateKey()
): TaskDueStatus {
  if (task.completed) return 'completed';
  if (!task.dueDate) return 'undated';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}
