import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { loadCalendar } from './calendar-queries';

const parent = { id: 'task-parent', organization_id: 'org-a', pedido_id: 'order-a',
  frente_id: 'front-a', descricao: 'Tarefa pai', descricao_detalhada: null, status: 'Aberta',
  prioridade: 'Normal', responsavel_user_id: 'user-a', responsavel: null,
  vencimento: '2026-10-10', follow_up_date: null, waiting_type: null, waiting_user_id: null,
  waiting_note: null, concluido: false, updated_at: null, concluida_em: null };

function calendarClient() {
  const requests: Array<{ url: URL; method: string }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, method: init?.method ?? 'GET' });
      const table = url.pathname.split('/').pop();
      if (table === 'subtarefas') return Response.json([{ id: 'sub-a', tarefa_id: 'task-parent',
        descricao: 'Medição', concluida: false, vencimento: '2026-09-20', prioridade: null,
        tarefas: parent }]);
      if (table === 'pedido_eventos') return Response.json([{ id: 'event-a', tipo: 'meeting',
        titulo: 'Reunião', data: '2026-09-21', horario: '09:30:00',
        responsavel_user_id: 'user-a', observacao: null, customer_id: null,
        pedido_id: 'order-a', frente_id: null, tarefa_id: null }]);
      return Response.json([]);
    } },
  });
  return { client, requests };
}

describe('calendar queries', () => {
  it('loads four read-only sources scoped by organization, window and optional order', async () => {
    const { client, requests } = calendarClient();
    const result = await loadCalendar(client, 'org-a', {
      orderId: 'order-a', from: '2026-09-01', to: '2026-09-30',
    });

    expect(result.map(entry => entry.key)).toEqual(['subtask_due:sub-a', 'meeting:event-a']);
    expect(requests).toHaveLength(4);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(requests.every(request => request.url.searchParams.get('organization_id') === 'eq.org-a'))
      .toBe(true);
    const tasks = requests.filter(request => request.url.pathname.endsWith('/tarefas'));
    expect(tasks).toHaveLength(2);
    expect(tasks.every(request => request.url.searchParams.get('pedido_id') === 'eq.order-a')).toBe(true);
    expect(tasks.some(request => request.url.searchParams.getAll('vencimento').length === 2)).toBe(true);
    expect(tasks.some(request => request.url.searchParams.getAll('follow_up_date').length === 2)).toBe(true);
    const subtasks = requests.find(request => request.url.pathname.endsWith('/subtarefas'))!;
    expect(subtasks.url.searchParams.get('tarefas.pedido_id')).toBe('eq.order-a');
    expect(subtasks.url.searchParams.getAll('vencimento')).toHaveLength(2);
    const events = requests.find(request => request.url.pathname.endsWith('/pedido_eventos'))!;
    expect(events.url.searchParams.get('pedido_id')).toBe('eq.order-a');
    expect(events.url.searchParams.getAll('data')).toHaveLength(2);
    expect(requests.map(request => request.url.href).join(' ')).not.toMatch(/storage|anexos|signed/i);
  });
});
