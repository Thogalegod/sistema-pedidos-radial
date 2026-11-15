import type { OrderV1, TaskV1 } from './types';

export function taskFixture(patch: Partial<TaskV1> = {}): TaskV1 {
  return { id: 'task-a', organizationId: 'org-a', orderId: 'order-a', frontId: 'front-a',
    title: 'Tarefa', description: null, status: 'Aberta', priority: 'Normal', assigneeId: null,
    legacyAssignee: null, dueDate: null, followUpDate: null, waiting: null, updatedAt: null,
    completedAt: null, ...patch };
}

export function orderFixture(patch: Partial<OrderV1> = {}): OrderV1 {
  return { id: 'order-a', organizationId: 'org-a', number: '123', title: 'Pedido', client: 'Cliente',
    address: 'Rua', status: 'Em andamento', createdAt: '2026-09-23T12:00:00Z',
    legacyPriority: 'Normal', utilityDueDate: null, ...patch };
}
