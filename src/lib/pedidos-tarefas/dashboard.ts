import type { DateKey, Id, TaskV1, WaitingType } from './types';

export type TaskFilter = { assigneeId?: Id; waitingType?: WaitingType };

export type DashboardTask = {
  task: TaskV1;
  order: { number: string; client: string } | null;
  lastUpdate: { text: string; at: string } | null;
};

export type TaskQueues = {
  overdue: DashboardTask[];
  today: DashboardTask[];
  followUps: DashboardTask[];
  waiting: DashboardTask[];
};

export function buildTaskQueues(tasks: DashboardTask[], today: DateKey): TaskQueues {
  const active = tasks.filter(({ task }) => task.status !== 'Concluída');
  return {
    overdue: active
      .filter(({ task }) => task.dueDate !== null && task.dueDate < today)
      .sort(byDate(task => task.dueDate)),
    today: active
      .filter(({ task }) => task.dueDate === today)
      .sort(byTaskId),
    followUps: active
      .filter(({ task }) => task.followUpDate !== null && task.followUpDate <= today)
      .sort(byDate(task => task.followUpDate)),
    waiting: active
      .filter(({ task }) => task.status === 'Aguardando')
      .sort(byDate(task => task.dueDate ?? task.followUpDate)),
  };
}

function byDate(value: (task: TaskV1) => DateKey | null) {
  return (left: DashboardTask, right: DashboardTask) => {
    const leftDate = value(left.task) ?? '9999-12-31';
    const rightDate = value(right.task) ?? '9999-12-31';
    return leftDate.localeCompare(rightDate) || left.task.id.localeCompare(right.task.id);
  };
}

function byTaskId(left: DashboardTask, right: DashboardTask) {
  return left.task.id.localeCompare(right.task.id);
}
