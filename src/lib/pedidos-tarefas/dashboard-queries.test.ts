import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseDashboardReadClient, loadDashboardTasks,
  type DashboardReadClient } from './dashboard-queries';
import type { TaskRow } from './mappers';

const taskRow: TaskRow = {
  id: 'task-1', organization_id: 'org-1', pedido_id: 'order-1', frente_id: 'front-1',
  descricao: 'Revisar projeto', descricao_detalhada: null, status: 'Aberta', prioridade: 'Normal',
  responsavel_user_id: 'user-1', responsavel: null, vencimento: '2026-09-23',
  follow_up_date: null, waiting_type: null, waiting_user_id: null, waiting_note: null,
  concluido: false, updated_at: '2026-09-20T10:00:00Z', concluida_em: null,
};

describe('loadDashboardTasks', () => {
  it('loads active candidates and batches orders plus manual updates without null ids', async () => {
    const client = makeClient();
    vi.mocked(client.listRelevantTasks).mockResolvedValue([
      taskRow,
      { ...taskRow, id: 'quick-1', pedido_id: null, frente_id: null, descricao: 'Ligar para cliente' },
    ]);

    const result = await loadDashboardTasks(client, 'org-1', '2026-09-23', {
      assigneeId: 'user-1', waitingType: 'customer',
    });

    expect(client.listRelevantTasks).toHaveBeenCalledWith('org-1', '2026-09-23', {
      assigneeId: 'user-1', waitingType: 'customer',
    });
    expect(client.listOrdersByIds).toHaveBeenCalledWith('org-1', ['order-1']);
    expect(client.listManualTaskNotes).toHaveBeenCalledWith('org-1', ['task-1', 'quick-1']);
    expect(client.listManualOrderActivities).toHaveBeenCalledWith('org-1', ['order-1']);
    expect(result.find(entry => entry.task.id === 'quick-1')).toMatchObject({ order: null });
  });

  it('chooses the latest manual update and falls back to no update without inventing text', async () => {
    const client = makeClient();
    vi.mocked(client.listManualTaskNotes).mockResolvedValue([
      { tarefa_id: 'task-1', texto: 'Nota antiga', criado_em: '2026-09-21T10:00:00Z' },
    ]);
    vi.mocked(client.listManualOrderActivities).mockResolvedValue([
      { pedido_id: 'order-1', descricao: 'Cliente respondeu', criado_em: '2026-09-22T10:00:00Z' },
    ]);

    const [result] = await loadDashboardTasks(client, 'org-1', '2026-09-23', {});

    expect(result.lastUpdate).toEqual({ text: 'Cliente respondeu', at: '2026-09-22T10:00:00Z' });
  });

  it('sends real assignee/waiting filters and excludes system updates in scoped queries', async () => {
    const urls: URL[] = [];
    const client = createClient('https://example.test', 'test-public-key', {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'dashboard-query-filter' },
      global: { fetch: async input => {
        urls.push(new URL(String(input)));
        return Response.json([]);
      } },
    });
    const adapter = createSupabaseDashboardReadClient(client);

    await adapter.listRelevantTasks('org-1', '2026-09-23', {
      assigneeId: 'user-1', waitingType: 'supplier',
    });
    await adapter.listManualTaskNotes('org-1', ['task-1']);
    await adapter.listManualOrderActivities('org-1', ['order-1']);

    const taskUrl = urls.find(url => url.pathname.endsWith('/tarefas'))!;
    expect(taskUrl.searchParams.get('organization_id')).toBe('eq.org-1');
    expect(taskUrl.searchParams.get('responsavel_user_id')).toBe('eq.user-1');
    expect(taskUrl.searchParams.get('waiting_type')).toBe('eq.supplier');
    expect(taskUrl.searchParams.get('or')).toContain('status.eq.Aguardando');
    expect(urls.find(url => url.pathname.endsWith('/comentarios_tarefa'))?.searchParams.get('event_type'))
      .toBe('is.null');
    expect(urls.find(url => url.pathname.endsWith('/atividades'))?.searchParams.get('or'))
      .toContain('migration_key.is.null');
    expect(urls.find(url => url.pathname.endsWith('/atividades'))?.searchParams.get('select')).toBe('*');
  });
});

function makeClient(): DashboardReadClient & Record<string, ReturnType<typeof vi.fn>> {
  return {
    listRelevantTasks: vi.fn().mockResolvedValue([taskRow]),
    listOrdersByIds: vi.fn().mockResolvedValue([
      { id: 'order-1', numero_pedido: '42', cliente: 'Cliente Um' },
    ]),
    listManualTaskNotes: vi.fn().mockResolvedValue([]),
    listManualOrderActivities: vi.fn().mockResolvedValue([]),
  };
}
