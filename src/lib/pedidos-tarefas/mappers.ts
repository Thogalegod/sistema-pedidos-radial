import { z } from 'zod';
import type { Order, Task } from '@/types';
import type { Capabilities, OrderStatusV1, TaskStatus, TaskV1 } from './types';

const dateKey = z.iso.date();
const taskStatus = z.enum(['Aberta', 'Em andamento', 'Aguardando', 'Concluída']);
const taskPriority = z.enum(['Urgente', 'Alta', 'Normal', 'Baixa']);
const waitingType = z.enum(['customer', 'utility', 'supplier', 'internal_user', 'other']);

export const taskRowSchema = z.object({
  id: z.string(), organization_id: z.string(), pedido_id: z.string().nullable(),
  descricao: z.string(), concluido: z.boolean(), responsavel: z.string().nullable(),
  responsavel_user_id: z.string().nullable(), vencimento: dateKey.nullable(),
  concluida_em: z.string().nullable(),
  // Additive fields may be absent in historical fixtures. Null never invents history.
  frente_id: z.string().nullish(), descricao_detalhada: z.string().nullish(),
  status: taskStatus.nullish(), prioridade: taskPriority.nullish(),
  follow_up_date: dateKey.nullish(), waiting_type: waitingType.nullish(),
  waiting_user_id: z.string().nullish(), waiting_note: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type TaskRow = Omit<z.input<typeof taskRowSchema>, 'status'> & { status?: string | null };

export function normalizeOrderStatus(raw: string): OrderStatusV1 {
  if (raw === 'Concluído' || raw === 'Finalizado') return 'Finalizado';
  if (raw === 'Cancelado') return 'Cancelado';
  if (['Ação Pendente', 'Aguardando Cliente', 'Prazo Concessionária', 'Em andamento'].includes(raw)) return 'Em andamento';
  throw new Error('Status de Pedido não reconhecido');
}

export function encodeOrderStatus(status: OrderStatusV1, mode: Capabilities['statusMode']): string {
  if (mode === 'v1') return status;
  if (status === 'Finalizado') return 'Concluído';
  if (status === 'Em andamento') return 'Ação Pendente';
  throw new Error('Cancelamento requer a ativação do novo fluxo');
}

export function resolveTaskStatus(
  row: { concluido: boolean; status?: string | null }, mode: Capabilities['statusMode'],
): TaskStatus {
  const status = taskStatus.nullish().parse(row.status);
  if (mode === 'legacy') return row.concluido ? 'Concluída' : 'Aberta';
  if (!status) throw new Error('Status canônico da tarefa ausente');
  return status;
}

export function mapTask(row: TaskRow, mode: Capabilities['statusMode']): TaskV1 {
  const data = taskRowSchema.parse(row);
  const status = resolveTaskStatus(data, mode);
  if (mode === 'v1' && status === 'Aguardando' && (!data.waiting_type ||
    (data.waiting_type === 'internal_user' && !data.waiting_user_id))) {
    throw new Error('Espera da tarefa incompleta');
  }
  return {
    id: data.id, organizationId: data.organization_id, orderId: data.pedido_id,
    frontId: data.frente_id ?? null, title: data.descricao, description: data.descricao_detalhada ?? null,
    status, priority: data.prioridade ?? 'Normal', assigneeId: data.responsavel_user_id,
    legacyAssignee: data.responsavel, dueDate: data.vencimento,
    followUpDate: data.follow_up_date ?? null,
    waiting: mode === 'v1' && status === 'Aguardando' && data.waiting_type
      ? { type: data.waiting_type, userId: data.waiting_user_id ?? null, note: data.waiting_note ?? null } : null,
    updatedAt: data.updated_at ?? null, completedAt: data.concluida_em,
  };
}

const subtaskSchema = z.object({
  id: z.string(), tarefa_id: z.string(), descricao: z.string(),
  concluida: z.boolean().nullable().transform(value => value ?? false), criado_em: z.string(),
  vencimento: dateKey.nullish(), prioridade: taskPriority.nullish(),
});
const commentSchema = z.object({
  id: z.string(), tarefa_id: z.string(), texto: z.string(), usuario: z.string(), criado_em: z.string(),
  event_type: z.string().nullable().optional(),
});
const nestedTaskSchema = taskRowSchema.extend({
  subtarefas: z.array(subtaskSchema).default([]), comentarios_tarefa: z.array(commentSchema).default([]),
});
const orderRowSchema = z.object({
  id: z.string(), organization_id: z.string(), numero_pedido: z.string(), projeto: z.string(),
  cliente: z.string(), endereco: z.string(), prioridade: z.enum(['Baixa', 'Normal', 'Alta']),
  status: z.string(), data_criacao: z.string(), prazo_concessionaria: dateKey.nullable(),
  tarefas: z.array(nestedTaskSchema).default([]),
  atividades: z.array(z.object({ id: z.string(), descricao: z.string(), usuario: z.string(), criado_em: z.string() })).default([]),
  anexos: z.array(z.object({ id: z.string(), pedido_id: z.string(), nome_arquivo: z.string(),
    legenda: z.string().nullish(), storage_path: z.string(), tipo: z.string(), criado_em: z.string() })).default([]),
});

export function mapLegacyTask(row: z.input<typeof nestedTaskSchema>, mode: Capabilities['statusMode']): Task {
  const data = nestedTaskSchema.parse(row);
  const task = mapTask(data, mode);
  return {
    id: task.id, title: task.title, completed: task.status === 'Concluída',
    assignee: task.legacyAssignee ?? undefined, assigneeUserId: task.assigneeId,
    dueDate: task.dueDate ?? undefined, completedAt: task.completedAt ?? undefined,
    subtarefas: data.subtarefas.sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    comentarios: data.comentarios_tarefa.sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
  };
}

export function mapOrder(row: unknown, mode: Capabilities['statusMode']): Order {
  const data = orderRowSchema.parse(row);
  return {
    id: data.id, orderNumber: data.numero_pedido, title: data.projeto, client: data.cliente,
    address: data.endereco, priority: data.prioridade, status: normalizeOrderStatus(data.status),
    createdAt: data.data_criacao, dueDate: data.prazo_concessionaria ?? undefined,
    tasks: data.tarefas.map(task => mapLegacyTask(task, mode)), atividades: data.atividades,
    anexos: data.anexos.map(file => ({ ...file, legenda: file.legenda ?? undefined })),
  };
}
