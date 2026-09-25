import type { EventKind, EventV1 } from './events';
import { buildTaskHref } from './navigation';
import type { DateKey, Id, Subtask, TaskV1 } from './types';

export type CalendarScope = { orderId?: Id; from: DateKey; to: DateKey };
export type CalendarEntry = {
  key: string;
  kind: 'task_due' | 'subtask_due' | 'follow_up' | EventKind;
  sourceId: Id;
  taskId: Id | null;
  orderId: Id | null;
  date: DateKey;
  time: string | null;
  title: string;
  completed: boolean;
  href: string;
};

type CalendarSources = { tasks: TaskV1[]; subtasks: Subtask[]; events: EventV1[] };

export function projectCalendar(input: CalendarSources, scope: CalendarScope): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  const tasksById = new Map(input.tasks.map(task => [task.id, task]));

  input.tasks.forEach(task => {
    if (!matchesOrder(task.orderId, scope.orderId)) return;
    if (task.dueDate && inWindow(task.dueDate, scope)) {
      entries.push({ key: `task_due:${task.id}`, kind: 'task_due', sourceId: task.id,
        taskId: task.id, orderId: task.orderId, date: task.dueDate, time: null,
        title: task.title, completed: task.status === 'Concluída',
        href: buildTaskHref(task.id, task.orderId) });
    }
    if (task.status !== 'Concluída' && task.followUpDate && inWindow(task.followUpDate, scope)) {
      entries.push({ key: `follow_up:${task.id}`, kind: 'follow_up', sourceId: task.id,
        taskId: task.id, orderId: task.orderId, date: task.followUpDate, time: null,
        title: task.title, completed: false, href: buildTaskHref(task.id, task.orderId) });
    }
  });

  input.subtasks.forEach(subtask => {
    const parent = tasksById.get(subtask.taskId);
    if (!parent || !subtask.dueDate || !inWindow(subtask.dueDate, scope)
      || !matchesOrder(parent.orderId, scope.orderId)) return;
    entries.push({ key: `subtask_due:${subtask.id}`, kind: 'subtask_due', sourceId: subtask.id,
      taskId: parent.id, orderId: parent.orderId, date: subtask.dueDate, time: null,
      title: subtask.title, completed: subtask.completed,
      href: buildTaskHref(parent.id, parent.orderId) });
  });

  input.events.forEach(event => {
    if (!inWindow(event.date, scope) || !matchesOrder(event.orderId, scope.orderId)) return;
    entries.push({ key: `${event.kind}:${event.id}`, kind: event.kind, sourceId: event.id,
      taskId: event.taskId, orderId: event.orderId, date: event.date, time: event.time,
      title: event.title, completed: false,
      href: `/calendario?evento=${encodeURIComponent(event.id)}` });
  });

  return [...new Map(entries.map(entry => [entry.key, entry])).values()]
    .sort((left, right) => left.date.localeCompare(right.date)
      || (left.time ?? '').localeCompare(right.time ?? '')
      || left.key.localeCompare(right.key));
}

function inWindow(date: DateKey, scope: CalendarScope) {
  return date >= scope.from && date <= scope.to;
}

function matchesOrder(orderId: Id | null, expected: Id | undefined) {
  return expected === undefined || orderId === expected;
}
