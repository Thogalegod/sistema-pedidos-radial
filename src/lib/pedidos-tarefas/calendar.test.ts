import { describe, expect, it } from 'vitest';
import { taskFixture } from './test-fixtures';
import type { EventV1 } from './events';
import { projectCalendar } from './calendar';

const scope = { from: '2026-09-01', to: '2026-09-30' };

function event(patch: Partial<EventV1> = {}): EventV1 {
  return {
    id: 'event-a', kind: 'meeting', title: 'Reunião', date: '2026-09-15', time: '09:30',
    assigneeId: 'user-a', note: null, customerId: null, orderId: null, frontId: null,
    taskId: null, ...patch,
  };
}

describe('calendar projection', () => {
  it('keeps task due dates and follow-ups as distinct source entries', () => {
    const task = taskFixture({ id: 'task-a', orderId: 'order-a', dueDate: '2026-09-23',
      followUpDate: '2026-09-23', title: 'Vistoria' });

    expect(projectCalendar({ tasks: [task], subtasks: [], events: [] }, scope))
      .toEqual([
        { key: 'follow_up:task-a', kind: 'follow_up', sourceId: 'task-a', taskId: 'task-a',
          orderId: 'order-a', date: '2026-09-23', time: null, title: 'Vistoria',
          completed: false, href: '/?pedido=order-a&tarefa=task-a' },
        { key: 'task_due:task-a', kind: 'task_due', sourceId: 'task-a', taskId: 'task-a',
          orderId: 'order-a', date: '2026-09-23', time: null, title: 'Vistoria',
          completed: false, href: '/?pedido=order-a&tarefa=task-a' },
      ]);
  });

  it('projects a subtask due date using its parent even when the parent due date is outside the window', () => {
    const parent = taskFixture({ id: 'task-parent', orderId: 'order-a',
      dueDate: '2026-10-10', title: 'Tarefa pai' });
    const entries = projectCalendar({ tasks: [parent], subtasks: [{ id: 'sub-a',
      taskId: 'task-parent', title: 'Medição', completed: false, dueDate: '2026-09-20',
      priority: null }], events: [] }, scope);

    expect(entries).toEqual([{ key: 'subtask_due:sub-a', kind: 'subtask_due', sourceId: 'sub-a',
      taskId: 'task-parent', orderId: 'order-a', date: '2026-09-20', time: null,
      title: 'Medição', completed: false, href: '/?pedido=order-a&tarefa=task-parent' }]);
  });

  it('uses inclusive civil-date boundaries and filters the same sources by order', () => {
    const standaloneTask = taskFixture({ id: 'standalone-task', orderId: null, frontId: null,
      dueDate: '2026-09-15', title: 'Tarefa avulsa' });
    const global = projectCalendar({ tasks: [standaloneTask], subtasks: [], events: [
      event({ id: 'start', date: '2026-09-01' }),
      event({ id: 'end', kind: 'visit', date: '2026-09-30', orderId: 'order-a' }),
      event({ id: 'other-order', kind: 'other', date: '2026-09-15', orderId: 'order-b' }),
      event({ id: 'outside', date: '2026-10-01' }),
    ] }, scope);
    expect(global.map(entry => entry.key)).toEqual([
      'meeting:start', 'task_due:standalone-task', 'other:other-order', 'visit:end',
    ]);

    const order = projectCalendar({ tasks: [standaloneTask], subtasks: [], events: [
      event({ id: 'standalone' }), event({ id: 'inside', kind: 'visit', orderId: 'order-a' }),
      event({ id: 'other', kind: 'other', orderId: 'order-b' }),
    ] }, { ...scope, orderId: 'order-a' });
    expect(order.map(entry => entry.key)).toEqual(['visit:inside']);
  });

  it('keeps completed due dates, omits completed follow-ups and deduplicates by source kind', () => {
    const completed = taskFixture({ id: 'done', status: 'Concluída', dueDate: '2026-09-10',
      followUpDate: '2026-09-11' });
    const entries = projectCalendar({ tasks: [completed, completed], subtasks: [],
      events: [event(), event()] }, scope);

    expect(entries.map(entry => [entry.key, entry.completed])).toEqual([
      ['task_due:done', true], ['meeting:event-a', false],
    ]);
  });
});
