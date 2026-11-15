import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { addTaskNote, deleteTaskNote, listTaskNotes } from './task-notes';

let clientNumber = 0;

function noteClient(responses: Response[]) {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `task-notes-${++clientNumber}` },
    global: { fetch: async (url, init) => {
      requests.push({ method: init?.method ?? 'GET', url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null });
      return responses.shift() ?? Response.json({ message: 'Unexpected request' }, { status: 500 });
    } },
  });
  return { client, requests };
}

describe('task notes', () => {
  it('lists notes by organization and task without needing an order', async () => {
    const note = { id: 'note-1', tarefa_id: 'task-1', texto: 'Nota', usuario: 'Ana',
      criado_em: '2026-09-25T10:00:00Z', event_type: null };
    const { client, requests } = noteClient([Response.json([note])]);

    await expect(listTaskNotes(client, 'org-1', 'task-1')).resolves.toEqual([note]);
    expect(requests[0].url).toContain('organization_id=eq.org-1');
    expect(requests[0].url).toContain('tarefa_id=eq.task-1');
  });

  it('adds a human note with event_type null and returns its id', async () => {
    const { client, requests } = noteClient([Response.json({ id: 'note-1' })]);

    await expect(addTaskNote(client, 'org-1', 'task-1', '  Retorno do cliente  '))
      .resolves.toEqual({ ok: true, value: 'note-1' });
    expect(requests[0].body).toEqual({ organization_id: 'org-1', tarefa_id: 'task-1',
      texto: 'Retorno do cliente', event_type: null });
  });

  it('uses only canonical timeline RPCs after the v1 cutover', async () => {
    const row = { id: 'activity-1', pedido_id: null, frente_id: null, tarefa_id: 'task-1',
      tipo: 'manual', descricao: 'Nota avulsa', usuario: 'Ana', user_id: 'user-1',
      criado_em: '2026-09-25T10:00:00Z', follow_up_date: null };
    const canonical = noteClient([
      Response.json([row]), Response.json('activity-2'), Response.json(null),
    ]);

    await expect(listTaskNotes(canonical.client, 'org-1', 'task-1', 'v1'))
      .resolves.toMatchObject([{ id: 'activity-1', tarefa_id: 'task-1', texto: 'Nota avulsa' }]);
    await expect(addTaskNote(canonical.client, 'org-1', 'task-1', 'Nova', 'v1'))
      .resolves.toEqual({ ok: true, value: 'activity-2' });
    await expect(deleteTaskNote(canonical.client, 'org-1', 'activity-1', 'v1'))
      .resolves.toEqual({ ok: true, value: undefined });

    expect(canonical.requests.map(request => request.url)).toEqual([
      'https://example.test/rest/v1/rpc/list_pedido_timeline',
      'https://example.test/rest/v1/rpc/add_pedido_update',
      'https://example.test/rest/v1/rpc/delete_pedido_update',
    ]);
  });

  it('rejects an empty note locally and reports failed deletion', async () => {
    const empty = noteClient([]);
    await expect(addTaskNote(empty.client, 'org-1', 'task-1', '  '))
      .resolves.toMatchObject({ ok: false, code: 'invalid' });
    expect(empty.requests).toEqual([]);

    const denied = noteClient([Response.json({ code: '42501', message: 'denied' }, { status: 403 })]);
    await expect(deleteTaskNote(denied.client, 'org-1', 'note-1'))
      .resolves.toEqual({ ok: false, code: 'forbidden', message: 'denied' });
  });
});
