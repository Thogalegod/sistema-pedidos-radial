import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { deleteEvent, saveEvent, type EventV1 } from './events';

function clientFor(response: unknown, status = 200) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json(response, { status });
    } },
  });
  return { client, requests };
}

const standalone: EventV1 = {
  id: '', kind: 'meeting', title: 'Reunião', date: '2026-10-15', time: '09:30',
  assigneeId: 'user-a', note: null, customerId: null, orderId: null, frontId: null, taskId: null,
};

describe('Eventos do Pedido', () => {
  it('saves a standalone event with civil date/time and no invented associations', async () => {
    const { client, requests } = clientFor({ id: 'event-a', tipo: 'meeting', titulo: 'Reunião',
      data: '2026-10-15', horario: '09:30:00', responsavel_user_id: 'user-a',
      observacao: null, customer_id: null, pedido_id: null, frente_id: null, tarefa_id: null });
    await expect(saveEvent(client, 'org-a', standalone)).resolves.toEqual({ ok: true,
      value: { ...standalone, id: 'event-a', time: '09:30' } });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toContain('/rest/v1/pedido_eventos');
    expect(requests[0].body).toMatchObject({ organization_id: 'org-a', tipo: 'meeting',
      titulo: 'Reunião', data: '2026-10-15', horario: '09:30',
      pedido_id: null, frente_id: null, tarefa_id: null, customer_id: null });
  });

  it('rejects a Front without an order before sending a write', async () => {
    const { client, requests } = clientFor(null);
    await expect(saveEvent(client, 'org-a', { ...standalone, frontId: 'front-a' }))
      .resolves.toMatchObject({ ok: false, code: 'invalid' });
    expect(requests).toHaveLength(0);
  });

  it('scopes edits and deletions to the organization and event identity', async () => {
    const edited = clientFor({ id: 'event-a', tipo: 'visit', titulo: 'Visita',
      data: '2026-10-16', horario: '10:00:00', responsavel_user_id: 'user-a',
      observacao: 'Local', customer_id: null, pedido_id: 'order-a',
      frente_id: 'front-a', tarefa_id: null });
    await expect(saveEvent(edited.client, 'org-a', { ...standalone, id: 'event-a',
      kind: 'visit', title: 'Visita', date: '2026-10-16', time: '10:00',
      note: 'Local', orderId: 'order-a', frontId: 'front-a' }))
      .resolves.toMatchObject({ ok: true, value: { id: 'event-a', orderId: 'order-a' } });
    expect(edited.requests[0].method).toBe('PATCH');
    expect(edited.requests[0].url).toContain('organization_id=eq.org-a');
    expect(edited.requests[0].url).toContain('id=eq.event-a');

    const removed = clientFor([{ id: 'event-a' }]);
    await expect(deleteEvent(removed.client, 'org-a', 'event-a'))
      .resolves.toEqual({ ok: true, value: undefined });
    expect(removed.requests[0].method).toBe('DELETE');
    expect(removed.requests[0].url).toContain('organization_id=eq.org-a');
    expect(removed.requests[0].url).toContain('id=eq.event-a');
  });

  it('never reports success when RLS, a conflict or a missing row rejects the write', async () => {
    const denied = clientFor({ code: '42501', message: 'permission denied' }, 403);
    await expect(saveEvent(denied.client, 'org-a', standalone))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' });
    const conflict = clientFor({ code: '23514', message: 'context mismatch' }, 400);
    await expect(saveEvent(conflict.client, 'org-a', standalone))
      .resolves.toMatchObject({ ok: false, code: 'conflict' });
    const absent = clientFor([]);
    await expect(deleteEvent(absent.client, 'org-a', 'event-a'))
      .resolves.toMatchObject({ ok: false, code: 'reload' });
  });
});
