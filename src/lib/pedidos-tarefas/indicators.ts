import type { DateKey, Dependency, Id, Subtask, TaskV1 } from './types';
import { compareCivilDateKeys, getTaskDueStatus } from './task-due';

export type TaskSummary = {
  total: number; completed: number; percent: number | null;
  overdue: number; today: number; waiting: number; followUps: number;
  blocked: number; readyToFinish: boolean;
};

export type NextAction = {
  taskId: Id; reason: 'overdue' | 'today' | 'follow_up' | 'next_due';
  date: DateKey; label: string;
};

const priorityRank: Record<TaskV1['priority'], number> = {
  Urgente: 0, Alta: 1, Normal: 2, Baixa: 3,
};

export function blockedCount(taskId: Id, tasks: TaskV1[], dependencies: Dependency[]): number {
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const target = taskById.get(taskId);
  if (!target || target.status === 'Concluída') return 0;
  return new Set(dependencies
    .filter(dependency => dependency.taskId === taskId)
    .map(dependency => dependency.predecessorId)
    .filter(predecessorId => taskById.get(predecessorId)?.status !== 'Concluída')).size;
}

export function subtaskProgress(subtasks: Subtask[]): { total: number; completed: number; ready: boolean } {
  const total = subtasks.length;
  const completed = subtasks.filter(subtask => subtask.completed).length;
  return { total, completed, ready: total > 0 && completed === total };
}

export function summarizeTasks(tasks: TaskV1[], dependencies: Dependency[], today: DateKey): TaskSummary {
  compareCivilDateKeys(today, today);
  const total = tasks.length;
  const completed = tasks.filter(task => task.status === 'Concluída').length;
  const active = tasks.filter(task => task.status !== 'Concluída');
  const overdue = new Set<Id>();
  const dueToday = new Set<Id>();
  const waiting = new Set<Id>();
  const followUps = new Set<Id>();
  const blocked = new Set<Id>();

  for (const task of active) {
    const dueStatus = getTaskDueStatus({ completed: false, dueDate: task.dueDate }, today);
    if (dueStatus === 'overdue') overdue.add(task.id);
    if (dueStatus === 'today') dueToday.add(task.id);
    if (task.status === 'Aguardando') waiting.add(task.id);
    if (task.followUpDate && compareCivilDateKeys(task.followUpDate, today) <= 0) {
      followUps.add(task.id);
    }
    if (blockedCount(task.id, tasks, dependencies) > 0) blocked.add(task.id);
  }

  return { total, completed, percent: total === 0 ? null : Math.round(completed * 100 / total),
    overdue: overdue.size, today: dueToday.size, waiting: waiting.size,
    followUps: followUps.size, blocked: blocked.size,
    readyToFinish: total > 0 && completed === total };
}

export function chooseNextAction(tasks: TaskV1[], today: DateKey): NextAction | null {
  compareCivilDateKeys(today, today);
  const candidates: { task: TaskV1; reason: NextAction['reason']; date: DateKey; rank: number }[] = [];
  for (const task of tasks) {
    if (task.status === 'Concluída') continue;
    if (task.dueDate) {
      const comparison = compareCivilDateKeys(task.dueDate, today);
      candidates.push({ task, reason: comparison < 0 ? 'overdue' : comparison === 0 ? 'today' : 'next_due',
        date: task.dueDate, rank: comparison < 0 ? 0 : comparison === 0 ? 1 : 3 });
    }
    if (task.followUpDate && compareCivilDateKeys(task.followUpDate, today) <= 0) {
      candidates.push({ task, reason: 'follow_up', date: task.followUpDate, rank: 2 });
    }
  }

  candidates.sort((left, right) => left.rank - right.rank
    || compareCivilDateKeys(left.date, right.date)
    || priorityRank[left.task.priority] - priorityRank[right.task.priority]
    || (left.task.id < right.task.id ? -1 : left.task.id > right.task.id ? 1 : 0));
  const next = candidates[0];
  if (!next) return null;
  const prefix = { overdue: 'Atrasada', today: 'Vence hoje', follow_up: 'Follow-up',
    next_due: 'Próximo prazo' }[next.reason];
  return { taskId: next.task.id, reason: next.reason, date: next.date,
    label: `${prefix} · ${next.task.title}` };
}
