import { describe, expect, it } from 'vitest';
import { taskFixture } from './test-fixtures';
import { blockedCount, chooseNextAction, subtaskProgress, summarizeTasks } from './indicators';
import type { Subtask } from './types';

const today = '2026-09-23';

function subtask(id: string, completed: boolean): Subtask {
  return { id, taskId: 'task-a', title: id, completed, dueDate: null, priority: null };
}

describe('Pedido task indicators', () => {
  it('keeps an empty Pedido without a fabricated 100% progress or action', () => {
    expect(summarizeTasks([], [], today)).toEqual({
      total: 0, completed: 0, percent: null, overdue: 0, today: 0,
      waiting: 0, followUps: 0, blocked: 0, readyToFinish: false,
    });
    expect(chooseNextAction([], today)).toBeNull();
  });

  it('counts overlapping alerts independently and excludes completed tasks from active alerts', () => {
    const tasks = [
      taskFixture({ id: 'a', dueDate: '2026-09-22', followUpDate: today,
        status: 'Aguardando', waiting: { type: 'customer', userId: null, note: null } }),
      taskFixture({ id: 'b', dueDate: today }),
      taskFixture({ id: 'c', dueDate: '2026-09-20', followUpDate: today,
        status: 'Concluída' }),
    ];
    expect(summarizeTasks(tasks, [], today)).toEqual({
      total: 3, completed: 1, percent: 33, overdue: 1, today: 1,
      waiting: 1, followUps: 1, blocked: 0, readyToFinish: false,
    });
  });

  it('counts distinct blocked tasks, releases completed predecessors, and never changes status', () => {
    const tasks = [
      taskFixture({ id: 'a', status: 'Aberta' }),
      taskFixture({ id: 'b', status: 'Concluída' }),
      taskFixture({ id: 'c', status: 'Em andamento' }),
    ];
    const dependencies = [
      { taskId: 'a', predecessorId: 'b' },
      { taskId: 'a', predecessorId: 'c' },
      { taskId: 'a', predecessorId: 'c' },
      { taskId: 'c', predecessorId: 'a' },
    ];
    expect(blockedCount('a', tasks, dependencies)).toBe(1);
    expect(blockedCount('c', tasks, dependencies)).toBe(1);
    expect(summarizeTasks(tasks, dependencies, today).blocked).toBe(2);
    expect(tasks[0].status).toBe('Aberta');
  });

  it('suggests manual Pedido finalization only when at least one task exists and all are complete', () => {
    expect(summarizeTasks([taskFixture({ status: 'Concluída' })], [], today))
      .toMatchObject({ total: 1, completed: 1, percent: 100, readyToFinish: true });
  });
});

describe('next action', () => {
  it('ranks overdue before today regardless of manual priority and does not mutate it', () => {
    const tasks = [
      taskFixture({ id: 'a', title: 'Atrasada', dueDate: '2026-09-22', priority: 'Baixa' }),
      taskFixture({ id: 'b', dueDate: today, priority: 'Urgente' }),
    ];
    expect(chooseNextAction(tasks, today)).toMatchObject({
      taskId: 'a', reason: 'overdue', date: '2026-09-22',
      label: expect.stringContaining('Atrasada'),
    });
    expect(tasks[0].priority).toBe('Baixa');
  });

  it('ranks today before due follow-ups and follow-ups before upcoming dates', () => {
    const todayTask = taskFixture({ id: 'today', dueDate: today });
    const followUp = taskFixture({ id: 'follow', followUpDate: '2026-09-22' });
    const upcoming = taskFixture({ id: 'upcoming', dueDate: '2026-09-24' });
    expect(chooseNextAction([upcoming, followUp, todayTask], today)?.taskId).toBe('today');
    expect(chooseNextAction([upcoming, followUp], today)).toMatchObject({
      taskId: 'follow', reason: 'follow_up', date: '2026-09-22',
    });
    expect(chooseNextAction([upcoming], today)).toMatchObject({
      taskId: 'upcoming', reason: 'next_due', date: '2026-09-24',
    });
  });

  it('sorts within a rank by civil date, then priority, then stable ID', () => {
    const tasks = [
      taskFixture({ id: 'z', dueDate: '2026-09-22', priority: 'Urgente' }),
      taskFixture({ id: 'b', dueDate: '2026-09-21', priority: 'Alta' }),
      taskFixture({ id: 'c', dueDate: '2026-09-21', priority: 'Urgente' }),
      taskFixture({ id: 'a', dueDate: '2026-09-21', priority: 'Urgente' }),
    ];
    expect(chooseNextAction(tasks, today)?.taskId).toBe('a');
  });

  it('does not invent actions for undated, future-only follow-ups, or completed tasks', () => {
    const tasks = [
      taskFixture({ id: 'undated' }),
      taskFixture({ id: 'future-follow', followUpDate: '2026-09-24' }),
      taskFixture({ id: 'done', status: 'Concluída', dueDate: '2026-09-20' }),
    ];
    expect(chooseNextAction(tasks, today)).toBeNull();
  });

  it('compares civil dates across year end and leap day', () => {
    expect(chooseNextAction([
      taskFixture({ id: 'jan', dueDate: '2027-01-01' }),
      taskFixture({ id: 'dec', dueDate: '2026-12-31' }),
    ], '2027-01-01')?.taskId).toBe('dec');
    expect(chooseNextAction([
      taskFixture({ id: 'leap', dueDate: '2028-02-29' }),
      taskFixture({ id: 'march', dueDate: '2028-03-01' }),
    ], '2028-02-28')?.taskId).toBe('leap');
  });
});

describe('subtask progress', () => {
  it('keeps empty and partially complete subtasks unready', () => {
    expect(subtaskProgress([])).toEqual({ total: 0, completed: 0, ready: false });
    expect(subtaskProgress([subtask('a', true), subtask('b', false)]))
      .toEqual({ total: 2, completed: 1, ready: false });
  });

  it('suggests completion without changing any parent task', () => {
    const subtasks = [subtask('a', true), subtask('b', true)];
    expect(subtaskProgress(subtasks)).toEqual({ total: 2, completed: 2, ready: true });
    expect(subtasks).toEqual([subtask('a', true), subtask('b', true)]);
  });
});
