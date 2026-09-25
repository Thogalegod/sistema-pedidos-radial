import { describe, expect, it } from 'vitest';
import { taskFixture } from './test-fixtures';
import { buildTaskQueues, type DashboardTask } from './dashboard';

const TODAY = '2026-09-23';

function item(overrides: Partial<DashboardTask> = {}): DashboardTask {
  return {
    task: taskFixture({ id: 'task-a' }),
    order: null,
    lastUpdate: null,
    ...overrides,
  };
}

describe('buildTaskQueues', () => {
  it('keeps independent signals in overlapping queues', () => {
    const overlapping = item({ task: taskFixture({
      id: 'task-overlap',
      orderId: null,
      frontId: null,
      dueDate: '2026-09-20',
      followUpDate: TODAY,
      status: 'Aguardando',
      waiting: { type: 'customer', userId: null, note: null },
    }) });

    const queues = buildTaskQueues([overlapping], TODAY);

    expect(queues.overdue.map(entry => entry.task.id)).toEqual(['task-overlap']);
    expect(queues.today).toEqual([]);
    expect(queues.followUps.map(entry => entry.task.id)).toEqual(['task-overlap']);
    expect(queues.waiting.map(entry => entry.task.id)).toEqual(['task-overlap']);
  });

  it('excludes completed tasks from every active queue', () => {
    const completed = item({ task: taskFixture({
      status: 'Concluída', dueDate: TODAY, followUpDate: TODAY,
    }) });

    expect(buildTaskQueues([completed], TODAY)).toEqual({
      overdue: [], today: [], followUps: [], waiting: [],
    });
  });

  it('sorts each queue by its relevant civil date and keeps stable task ids', () => {
    const later = item({ task: taskFixture({ id: 'later', dueDate: '2026-09-22' }) });
    const earlier = item({ task: taskFixture({ id: 'earlier', dueDate: '2026-09-20' }) });

    expect(buildTaskQueues([later, earlier], TODAY).overdue.map(entry => entry.task.id))
      .toEqual(['earlier', 'later']);
  });
});
