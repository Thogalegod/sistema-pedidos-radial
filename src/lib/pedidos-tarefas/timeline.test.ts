import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { addUpdate, deleteUpdate, loadTimeline } from './timeline';

let sequence = 0;
function rpcClient(responses: Response[]) {
  const requests: Array<{ url: string; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `timeline-${++sequence}` },
    global: { fetch: async (input, init) => {
      requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return responses.shift() ?? Response.json({ message: 'unexpected' }, { status: 500 });
    } },
  });
  return { client, requests };
}

describe('canonical Pedido timeline', () => {
  it('loads an order scope through the canonical RPC and maps provenance', async () => {
    const row = { id: 'a1', pedido_id: 'p1', frente_id: 'f1', tarefa_id: 't1', tipo: 'manual',
      descricao: 'Cliente respondeu', user_id: 'u1', usuario: 'Ana',
      criado_em: '2026-09-25T10:00:00Z', follow_up_date: '2026-09-30' };
    const { client, requests } = rpcClient([Response.json([row])]);

    await expect(loadTimeline(client, 'o1', { orderId: 'p1' })).resolves.toEqual([{
      id: 'a1', orderId: 'p1', frontId: 'f1', taskId: 't1', kind: 'manual',
      text: 'Cliente respondeu', authorId: 'u1', authorName: 'Ana',
      at: '2026-09-25T10:00:00Z', followUpDate: '2026-09-30',
    }]);
    expect(requests[0]).toMatchObject({ body: { p_org: 'o1', p_order: 'p1', p_task: null } });
  });

  it('writes a task update and follow-up atomically without accepting follow-up outside a task', async () => {
    const invalid = rpcClient([]);
    await expect(addUpdate(invalid.client, 'o1', {
      orderId: 'p1', frontId: null, taskId: null, text: 'Retorno', followUpDate: '2026-10-01',
    })).resolves.toMatchObject({ ok: false, code: 'invalid' });
    expect(invalid.requests).toEqual([]);

    const { client, requests } = rpcClient([Response.json('a1')]);
    await expect(addUpdate(client, 'o1', {
      orderId: 'p1', frontId: 'f1', taskId: 't1', text: '  Retorno  ', followUpDate: '2026-10-01',
    })).resolves.toEqual({ ok: true, value: 'a1' });
    expect(requests[0].body).toEqual({ p_org: 'o1', p_input: {
      orderId: 'p1', frontId: 'f1', taskId: 't1', text: 'Retorno', followUpDate: '2026-10-01',
    } });
  });

  it('deletes only through the scoped command and surfaces authorization failure', async () => {
    const denied = rpcClient([Response.json({ code: '42501', message: 'denied' }, { status: 403 })]);
    await expect(deleteUpdate(denied.client, 'o1', 'a1'))
      .resolves.toEqual({ ok: false, code: 'forbidden', message: 'denied' });
    expect(denied.requests[0].body).toEqual({ p_org: 'o1', p_id: 'a1' });
  });
});
