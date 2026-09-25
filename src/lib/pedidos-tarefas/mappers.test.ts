import { describe, expect, it } from 'vitest';
import { encodeOrderStatus, mapTask, normalizeOrderStatus, mapOrder, mapLegacyTask } from './mappers';

const row = {
  id: 'task-a', organization_id: 'org-a', pedido_id: 'order-a', descricao: 'Título',
  concluido: false, responsavel: 'Nome legado', responsavel_user_id: null,
  vencimento: null, concluida_em: null,
};

describe('transition readers', () => {
  it('keeps a nullable historical subtask completion unchecked without dropping the row', () => {
    const task = mapLegacyTask({ ...row, subtarefas: [{ id: 's', tarefa_id: row.id,
      descricao: 'Sub antiga', concluida: null, criado_em: '2026-09-23T12:00:00Z' }] }, 'legacy');
    expect(task.subtarefas?.[0]).toMatchObject({ id: 's', descricao: 'Sub antiga', concluida: false });
  });
  it.each([
    ['Ação Pendente', 'Em andamento'], ['Aguardando Cliente', 'Em andamento'],
    ['Prazo Concessionária', 'Em andamento'], ['Concluído', 'Finalizado'],
    ['Em andamento', 'Em andamento'], ['Finalizado', 'Finalizado'], ['Cancelado', 'Cancelado'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeOrderStatus(raw)).toBe(expected);
  });
  it('rejects unknown order and task states', () => {
    expect(() => normalizeOrderStatus('desconhecido')).toThrow();
    expect(() => mapTask({ ...row, status: 'desconhecido' }, 'legacy')).toThrow();
  });
  it('uses the legacy boolean until activation, preserving unresolved identity and unknown dates', () => {
    expect(mapTask({ ...row, status: 'Concluída' }, 'legacy')).toMatchObject({
      status: 'Aberta', priority: 'Normal', assigneeId: null, legacyAssignee: 'Nome legado',
      updatedAt: null, completedAt: null, dueDate: null, waiting: null,
    });
    expect(mapTask({ ...row, concluido: true, status: null }, 'legacy').status).toBe('Concluída');
  });
  it('reads canonical status and internal identity only after activation', () => {
    expect(mapTask({ ...row, status: 'Aguardando', waiting_type: 'internal_user',
      waiting_user_id: 'member-a', waiting_note: 'Retorno', responsavel_user_id: 'member-b',
      follow_up_date: '2026-10-01', prioridade: 'Alta' }, 'v1')).toMatchObject({
      status: 'Aguardando', assigneeId: 'member-b', priority: 'Alta', followUpDate: '2026-10-01',
      waiting: { type: 'internal_user', userId: 'member-a', note: 'Retorno' },
    });
    expect(() => mapTask(row, 'v1')).toThrow();
  });
  it('keeps legacy assignee text and unknown dates readable under v1 constraints', () => {
    expect(mapTask({ ...row, status: 'Aberta', prioridade: null, updated_at: null }, 'v1'))
      .toMatchObject({
        status: 'Aberta', priority: 'Normal', assigneeId: null,
        legacyAssignee: 'Nome legado', updatedAt: null, completedAt: null,
      });
  });
  it('rejects invalid civil dates instead of normalizing them across time zones', () => {
    expect(() => mapTask({ ...row, vencimento: '2026-02-30' }, 'legacy')).toThrow();
    expect(mapTask({ ...row, vencimento: '2028-02-29' }, 'legacy').dueDate).toBe('2028-02-29');
  });
  it('encodes writes according to capability without activating new workflow', () => {
    expect(encodeOrderStatus('Em andamento', 'legacy')).toBe('Ação Pendente');
    expect(encodeOrderStatus('Finalizado', 'legacy')).toBe('Concluído');
    expect(encodeOrderStatus('Finalizado', 'v1')).toBe('Finalizado');
    expect(() => encodeOrderStatus('Cancelado', 'legacy')).toThrow();
  });
  it('adapts nested historical orders without losing notes, files or member IDs', () => {
    const order = mapOrder({ id: 'order-a', organization_id: 'org-a', numero_pedido: '123',
      projeto: 'Projeto', cliente: 'Cliente', endereco: 'Rua', prioridade: 'Normal',
      status: 'Concluído', data_criacao: '2026-09-23T12:00:00Z', prazo_concessionaria: null,
      tarefas: [{ ...row, responsavel_user_id: 'member-a', concluido: true,
        subtarefas: [{ id: 's', tarefa_id: row.id, descricao: 'Sub', concluida: false, criado_em: '2026-09-23T12:00:00Z' }],
        comentarios_tarefa: [{ id: 'c', tarefa_id: row.id, texto: 'Nota', usuario: 'Legado', criado_em: '2026-09-23T12:00:00Z' }] }],
      atividades: [], anexos: [],
    }, 'legacy');
    expect(order.status).toBe('Finalizado');
    expect(order.tasks[0]).toMatchObject({ completed: true, assignee: 'Nome legado', assigneeUserId: 'member-a' });
    expect(order.tasks[0].subtarefas).toHaveLength(1);
    expect(order.tasks[0].comentarios?.[0].texto).toBe('Nota');
  });
});
