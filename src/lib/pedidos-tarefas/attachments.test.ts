import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { listOrderAttachments, saveAttachmentMetadata } from './attachments';

let sequence = 0;
function attachmentClient(rows: unknown) {
  const requests: Array<{ method: string; url: URL; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `attachments-${++sequence}` },
    global: { fetch: async (input, init) => {
      requests.push({ method: init?.method ?? 'GET', url: new URL(String(input)),
        body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json(rows);
    } },
  });
  return { client, requests };
}

describe('contextual Pedido attachments', () => {
  it('lists only the order and preserves optional front, task and update context', async () => {
    const row = { id: 'x1', pedido_id: 'p1', frente_id: 'f1', tarefa_id: 't1', atividade_id: 'a1',
      nome_arquivo: 'foto.jpg', legenda: null, storage_path: 'o1/p1/foto.jpg',
      tipo: 'image/jpeg', criado_em: '2026-09-25T10:00:00Z' };
    const { client, requests } = attachmentClient([row]);
    await expect(listOrderAttachments(client, 'o1', 'p1')).resolves.toMatchObject([{
      id: 'x1', pedido_id: 'p1', frente_id: 'f1', tarefa_id: 't1', atividade_id: 'a1',
    }]);
    expect(requests[0].url.searchParams.get('organization_id')).toBe('eq.o1');
    expect(requests[0].url.searchParams.get('pedido_id')).toBe('eq.p1');
  });

  it('writes metadata with the complete context and keeps the order storage path', async () => {
    const { client, requests } = attachmentClient({ id: 'x1' });
    await expect(saveAttachmentMetadata(client, 'o1', {
      orderId: 'p1', frontId: 'f1', taskId: 't1', updateId: 'a1',
    }, { name: 'foto.jpg', caption: null, path: 'o1/p1/key.jpg', type: 'image/jpeg' }))
      .resolves.toEqual({ ok: true, value: 'x1' });
    expect(requests[0].body).toEqual({ organization_id: 'o1', pedido_id: 'p1', frente_id: 'f1',
      tarefa_id: 't1', atividade_id: 'a1', nome_arquivo: 'foto.jpg', legenda: null,
      storage_path: 'o1/p1/key.jpg', tipo: 'image/jpeg' });
  });
});
