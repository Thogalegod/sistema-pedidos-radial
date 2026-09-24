import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createOrder,
  createTask,
  removeTask,
  saveSubtask,
  setOrderStatus,
  updateOrder,
  updateTask,
} from './commands';

let clientNumber = 0;
function commandClient(responses: Record<string, { data?: unknown; status?: number }>) {
  const requests: Array<{ rpc: string; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `commands-test-${++clientNumber}`,
    },
    global: {
      fetch: async (url, init) => {
        const rpc = String(url).split('/rpc/')[1]?.split('?')[0] ?? '';
        requests.push({ rpc, body: init?.body ? JSON.parse(String(init.body)) : null });
        const response = responses[rpc] ?? { data: { message: `Unexpected RPC ${rpc}` }, status: 500 };
        return Response.json(response.data ?? null, { status: response.status ?? 200 });
      },
    },
  });
  return { client, requests };
}

const taskResult = {
  id: 'task-a', organizationId: 'org-a', orderId: 'order-a', frontId: 'front-a',
  title: 'Tarefa', description: null, status: 'Concluída', priority: 'Normal',
  assigneeId: null, legacyAssignee: null, dueDate: null, followUpDate: null,
  waiting: null, updatedAt: '2026-09-24T12:00:00Z', completedAt: '2026-09-24T12:00:00Z',
};

describe('pedido command RPC wrappers', () => {
  it('creates and updates an order using only the scoped command RPCs', async () => {
    const create = commandClient({ create_pedido: { data: 'order-a' } });
    const input = {
      number: 'PED-1', title: 'Projeto', client: 'Cliente', address: 'Rua A',
      legacyPriority: 'Normal' as const, utilityDueDate: null, cep: '12345-678',
    };
    await expect(createOrder(create.client, 'org-a', input))
      .resolves.toEqual({ ok: true, value: 'order-a' });
    expect(create.requests).toEqual([{
      rpc: 'create_pedido', body: { p_org: 'org-a', p_input: input },
    }]);

    const update = commandClient({ update_pedido: {} });
    await expect(updateOrder(update.client, 'org-a', 'order-a', { title: 'Novo título' }))
      .resolves.toEqual({ ok: true, value: undefined });
    expect(update.requests).toEqual([{
      rpc: 'update_pedido',
      body: { p_org: 'org-a', p_id: 'order-a', p_patch: { title: 'Novo título' } },
    }]);
  });

  it('updates task completion without issuing an order-status command', async () => {
    const { client, requests } = commandClient({ update_pedido_task: { data: taskResult } });

    await expect(updateTask(client, 'org-a', 'task-a', { status: 'Concluída' }))
      .resolves.toEqual({ ok: true, value: taskResult });
    expect(requests).toEqual([{
      rpc: 'update_pedido_task',
      body: { p_org: 'org-a', p_id: 'task-a', p_patch: { status: 'Concluída' } },
    }]);
  });

  it('creates tasks and keeps explicit order status as a separate command', async () => {
    const create = commandClient({ create_pedido_task: { data: 'task-a' } });
    await expect(createTask(create.client, 'org-a', {
      title: 'Tarefa', orderId: 'order-a', frontId: null, assigneeId: 'user-a',
      dueDate: null,
    })).resolves.toEqual({ ok: true, value: 'task-a' });
    expect(create.requests[0]).toEqual({
      rpc: 'create_pedido_task',
      body: {
        p_org: 'org-a',
        p_input: {
          title: 'Tarefa', orderId: 'order-a', frontId: null, assigneeId: 'user-a',
          dueDate: null,
        },
      },
    });

    const status = commandClient({ set_pedido_status: {} });
    await expect(setOrderStatus(status.client, 'org-a', 'order-a', 'Finalizado'))
      .resolves.toEqual({ ok: true, value: undefined });
    expect(status.requests[0]).toEqual({
      rpc: 'set_pedido_status',
      body: { p_org: 'org-a', p_id: 'order-a', p_status: 'Finalizado' },
    });
  });

  it('saves subtasks and removes tasks through scoped RPCs', async () => {
    const save = commandClient({ save_pedido_subtask: {} });
    await expect(saveSubtask(save.client, 'org-a', {
      id: null, taskId: 'task-a', patch: { title: 'Subtarefa' },
    })).resolves.toEqual({ ok: true, value: undefined });
    expect(save.requests[0]).toEqual({
      rpc: 'save_pedido_subtask',
      body: { p_org: 'org-a', p_input: { id: null, taskId: 'task-a', patch: { title: 'Subtarefa' } } },
    });

    const remove = commandClient({ remove_pedido_task: {} });
    await expect(removeTask(remove.client, 'org-a', 'task-a'))
      .resolves.toEqual({ ok: true, value: undefined });
    expect(remove.requests[0]).toEqual({
      rpc: 'remove_pedido_task', body: { p_org: 'org-a', p_id: 'task-a' },
    });
  });

  it.each([
    ['42501', 403, 'forbidden'],
    ['23514', 400, 'invalid'],
    ['23503', 409, 'conflict'],
    ['40001', 409, 'reload'],
  ] as const)('maps SQLSTATE %s to %s', async (sqlstate, status, expectedCode) => {
    const denied = commandClient({
      set_pedido_status: { data: { code: sqlstate, message: 'refused' }, status },
    });
    await expect(setOrderStatus(denied.client, 'org-a', 'order-a', 'Finalizado'))
      .resolves.toMatchObject({ ok: false, code: expectedCode, message: 'refused' });
  });
});
