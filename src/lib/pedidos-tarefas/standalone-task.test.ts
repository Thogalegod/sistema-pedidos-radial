import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseStandaloneTaskReadClient, loadStandaloneTaskDetail,
  type StandaloneTaskReadClient } from './standalone-task';
import type { TaskRow } from './mappers';

const row: TaskRow = {
  id: 'quick-1', organization_id: 'org-1', pedido_id: null, frente_id: null,
  descricao: 'Telefonar', descricao_detalhada: null, status: 'Aberta', prioridade: 'Normal',
  responsavel_user_id: 'user-1', responsavel: null, vencimento: null, follow_up_date: null,
  waiting_type: null, waiting_user_id: null, waiting_note: null, concluido: false,
  updated_at: null, concluida_em: null,
};

describe('loadStandaloneTaskDetail', () => {
  it('loads a standalone task with its subtasks and notes without an order', async () => {
    const client = makeClient();

    await expect(loadStandaloneTaskDetail(client, 'org-1', 'quick-1')).resolves.toMatchObject({
      task: { id: 'quick-1', orderId: null, frontId: null },
      subtasks: [{ id: 'sub-1', taskId: 'quick-1', title: 'Confirmar horário' }],
      comments: [{ id: 'note-1', tarefa_id: 'quick-1', texto: 'Ligação feita' }],
    });
    expect(client.getTask).toHaveBeenCalledWith('org-1', 'quick-1');
    expect(client.listSubtasks).toHaveBeenCalledWith('org-1', 'quick-1');
    expect(client.listNotes).toHaveBeenCalledWith('org-1', 'quick-1');
  });

  it('does not treat a Pedido task as standalone', async () => {
    const client = makeClient();
    vi.mocked(client.getTask).mockResolvedValue({ ...row, pedido_id: 'order-1', frente_id: 'front-1' });

    await expect(loadStandaloneTaskDetail(client, 'org-1', 'quick-1')).resolves.toBeNull();
    expect(client.listSubtasks).not.toHaveBeenCalled();
  });

  it('loads standalone notes from the canonical timeline after cutover', async () => {
    const urls: URL[] = [];
    const client = createClient('https://example.test', 'test-public-key', {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'standalone-v1' },
      global: { fetch: async input => {
        const url = new URL(String(input)); urls.push(url);
        if (url.pathname.endsWith('/tarefas')) return Response.json([row]);
        if (url.pathname.endsWith('/subtarefas')) return Response.json([]);
        return Response.json([{ id: 'a1', pedido_id: null, frente_id: null, tarefa_id: 'quick-1',
          tipo: 'manual', descricao: 'Ligação feita', user_id: 'u1', usuario: 'Ana',
          criado_em: '2026-09-25T12:00:00Z', follow_up_date: null }]);
      } },
    });

    const adapter = createSupabaseStandaloneTaskReadClient(client, 'v1');
    await expect(loadStandaloneTaskDetail(adapter, 'org-1', 'quick-1')).resolves.toMatchObject({
      comments: [{ id: 'a1', texto: 'Ligação feita' }],
    });
    expect(urls.some(url => url.pathname.endsWith('/rpc/list_pedido_timeline'))).toBe(true);
    expect(urls.some(url => url.pathname.endsWith('/comentarios_tarefa'))).toBe(false);
  });
});

function makeClient(): StandaloneTaskReadClient & Record<string, ReturnType<typeof vi.fn>> {
  return {
    getTask: vi.fn().mockResolvedValue(row),
    listSubtasks: vi.fn().mockResolvedValue([{
      id: 'sub-1', tarefa_id: 'quick-1', descricao: 'Confirmar horário',
      concluida: false, vencimento: null, prioridade: null,
    }]),
    listNotes: vi.fn().mockResolvedValue([{
      id: 'note-1', tarefa_id: 'quick-1', texto: 'Ligação feita', usuario: 'Roberto',
      criado_em: '2026-09-25T12:00:00Z', event_type: null,
    }]),
  };
}
