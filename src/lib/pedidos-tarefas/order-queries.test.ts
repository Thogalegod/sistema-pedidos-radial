import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { loadOrder, loadOrderTasks, loadOrderRecentActivity, loadLegacyOrderDetail,
  loadOrderUpdates, loadOrderAttachments } from './order-queries';

let sequence = 0;
function queryClient(rows: Record<string, unknown>) {
  const urls: URL[] = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `queries-${++sequence}` },
    global: { fetch: async input => {
      const url = new URL(String(input));
      urls.push(url);
      return Response.json(rows[url.pathname.split('/').pop() ?? ''] ?? []);
    } },
  });
  return { client, urls };
}

const order = { id: 'p1', organization_id: 'org1', numero_pedido: '123', projeto: 'Obra',
  cliente: 'Cliente', endereco: 'Rua', status: 'Em andamento', prioridade: 'Normal',
  data_criacao: '2026-09-25T10:00:00Z', prazo_concessionaria: null };
const task = { id: 't1', organization_id: 'org1', pedido_id: 'p1', frente_id: 'f1',
  descricao: 'Conferir', descricao_detalhada: null, status: 'Aberta', prioridade: 'Normal',
  responsavel_user_id: null, responsavel: null, vencimento: null, follow_up_date: null,
  waiting_type: null, waiting_user_id: null, waiting_note: null, updated_at: null,
  concluida_em: null, concluido: false,
  vencimento_rule: { sourceTaskId: 'source-1', offsetDays: 2, timeZone: 'America/Sao_Paulo',
    state: 'pending', materializedAt: null }, follow_up_rule: null };

describe('focused Pedido queries', () => {
  it('loads only the requested organization/order and returns null when absent', async () => {
    const { client, urls } = queryClient({ pedidos: [order] });
    await expect(loadOrder(client, 'org1', 'p1')).resolves.toMatchObject({ id: 'p1', organizationId: 'org1' });
    expect(urls[0].searchParams.get('organization_id')).toBe('eq.org1');
    expect(urls[0].searchParams.get('id')).toBe('eq.p1');
    expect(urls[0].searchParams.get('select')).not.toMatch(/anexos|tarefas|atividades/i);
    await expect(loadOrder(queryClient({ pedidos: [] }).client, 'org1', 'missing')).resolves.toBeNull();
  });

  it('loads scoped fronts, tasks, subtasks and dependencies without attachments or signed URLs', async () => {
    const { client, urls } = queryClient({
      pedido_frentes: [{ id: 'f1', pedido_id: 'p1', nome: 'Geral', ordem: 0 }],
      tarefas: [task],
      subtarefas: [{ id: 's1', tarefa_id: 't1', descricao: 'Etapa', concluida: false, vencimento: null,
        prioridade: null, vencimento_rule: null }],
      tarefa_dependencias: [{ tarefa_id: 't1', predecessora_id: 't2' }],
    });
    const result = await loadOrderTasks(client, 'org1', 'p1');
    expect(result).toMatchObject({ fronts: [{ id: 'f1', name: 'Geral' }],
      tasks: [{ id: 't1', title: 'Conferir', dueRule: { sourceTaskId: 'source-1', state: 'pending' } }],
      subtasks: [{ id: 's1', taskId: 't1', dueRule: null }],
      dependencies: [{ taskId: 't1', predecessorId: 't2' }] });
    expect(urls.every(url => url.searchParams.get('organization_id') === 'eq.org1')).toBe(true);
    expect(urls.filter(url => url.pathname.endsWith('/tarefas'))[0].searchParams.get('pedido_id')).toBe('eq.p1');
    expect(urls.filter(url => url.pathname.endsWith('/tarefas'))[0].searchParams.get('select'))
      .toMatch(/vencimento_rule.*follow_up_rule/);
    expect(urls.filter(url => url.pathname.endsWith('/subtarefas'))[0].searchParams.get('select'))
      .toContain('vencimento_rule');
    expect(urls.map(url => url.href).join(' ')).not.toMatch(/anexos|storage|signed/i);
  });

  it('reads the latest scoped activity without loading the full history', async () => {
    const { client, urls } = queryClient({ atividades: [{ descricao: 'Atualizado', criado_em: '2026-09-25T11:00:00Z', usuario: 'Ana' }] });
    await expect(loadOrderRecentActivity(client, 'org1', 'p1')).resolves.toEqual({
      text: 'Atualizado', at: '2026-09-25T11:00:00Z', author: 'Ana',
    });
    expect(urls[0].searchParams.get('limit')).toBe('1');
    expect(urls[0].searchParams.get('pedido_id')).toBe('eq.p1');
  });

  it('keeps legacy task details scoped and loads history/files only when separately requested', async () => {
    const { client, urls } = queryClient({ pedidos: [{ ...order, tarefas: [{ ...task,
      subtarefas: [], comentarios_tarefa: [] }] }],
      atividades: [{ id: 'a1', descricao: 'Nota', usuario: 'Ana', criado_em: '2026-09-25T11:00:00Z' }],
      anexos: [{ id: 'x1', pedido_id: 'p1', nome_arquivo: 'a.pdf', legenda: null,
        storage_path: 'org1/p1/a.pdf', tipo: 'application/pdf', criado_em: '2026-09-25T11:00:00Z' }],
    });
    await expect(loadLegacyOrderDetail(client, 'org1', 'p1', 'v1')).resolves.toMatchObject({
      id: 'p1', tasks: [{ id: 't1' }], anexos: [], atividades: [],
    });
    expect(urls).toHaveLength(1);
    expect(urls[0].searchParams.get('select')).not.toContain('anexos');
    await expect(loadOrderUpdates(client, 'org1', 'p1')).resolves.toHaveLength(1);
    await expect(loadOrderAttachments(client, 'org1', 'p1')).resolves.toMatchObject([{ id: 'x1' }]);
    expect(urls.every(url => url.searchParams.get('organization_id') === 'eq.org1')).toBe(true);
    expect(urls.every(url => url.searchParams.get('pedido_id') === 'eq.p1' || url.searchParams.get('id') === 'eq.p1')).toBe(true);
  });

  it('keeps legacy SQL free of the new column and hides copied notes client-side', async () => {
    const { client, urls } = queryClient({ atividades: [
      { id: 'a1', descricao: 'Manual', usuario: 'Ana', criado_em: '2026-09-25T11:00:00Z' },
      { id: 'a2', descricao: 'Cópia', usuario: 'Ana', criado_em: '2026-09-25T10:00:00Z', source_comment_id: 'c1' },
    ] });
    await expect(loadOrderUpdates(client, 'org1', 'p1', 'legacy')).resolves.toHaveLength(1);
    expect(urls[0].searchParams.get('select')).toBe('*');
    expect(urls[0].searchParams.has('source_comment_id')).toBe(false);
  });

  it('filters projections in SQL after the copying capability is active', async () => {
    const { client, urls } = queryClient({ atividades: [] });
    await loadOrderUpdates(client, 'org1', 'p1', 'copying');
    expect(urls[0].searchParams.get('source_comment_id')).toBe('is.null');
  });
});
