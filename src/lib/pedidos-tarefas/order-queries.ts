import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mapOrder, mapTask, normalizeOrderStatus } from './mappers';
import type { Anexo, Atividade, Order } from '@/types';
import type { Capabilities, Dependency, Front, Id, OrderV1, Subtask, TaskV1 } from './types';
import { instanceDateRuleSchema } from './template-schema';

const orderSchema = z.object({
  id: z.string(), organization_id: z.string(), numero_pedido: z.string(), projeto: z.string(),
  cliente: z.string(), endereco: z.string(), status: z.string(),
  prioridade: z.enum(['Baixa', 'Normal', 'Alta']), data_criacao: z.string(),
  prazo_concessionaria: z.string().nullable(),
});
const frontSchema = z.array(z.object({
  id: z.string(), pedido_id: z.string(), nome: z.string(), ordem: z.number(),
}));
const subtaskSchema = z.array(z.object({
  id: z.string(), tarefa_id: z.string(), descricao: z.string(), concluida: z.boolean().nullable(),
  vencimento: z.string().nullable(), prioridade: z.enum(['Urgente', 'Alta', 'Normal', 'Baixa']).nullable(),
  vencimento_rule: instanceDateRuleSchema.nullish(),
}));
const dependencySchema = z.array(z.object({ tarefa_id: z.string(), predecessora_id: z.string() }));
const recentSchema = z.object({ descricao: z.string(), criado_em: z.string(), usuario: z.string() });
const updateSchema = z.array(recentSchema.extend({ id: z.string() }));
const attachmentSchema = z.array(z.object({ id: z.string(), pedido_id: z.string(),
  nome_arquivo: z.string(), legenda: z.string().nullable(), storage_path: z.string(),
  tipo: z.string(), criado_em: z.string() }));

export async function loadOrder(client: SupabaseClient, org: Id, orderId: Id): Promise<OrderV1 | null> {
  const { data, error } = await client.from('pedidos')
    .select('id,organization_id,numero_pedido,projeto,cliente,endereco,status,prioridade,data_criacao,prazo_concessionaria')
    .eq('organization_id', org).eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = orderSchema.parse(data);
  return { id: row.id, organizationId: row.organization_id, number: row.numero_pedido,
    title: row.projeto, client: row.cliente, address: row.endereco,
    status: normalizeOrderStatus(row.status), createdAt: row.data_criacao,
    legacyPriority: row.prioridade, utilityDueDate: row.prazo_concessionaria };
}

export async function loadOrderTasks(client: SupabaseClient, org: Id, orderId: Id): Promise<{
  fronts: Front[]; tasks: TaskV1[]; subtasks: Subtask[]; dependencies: Dependency[];
}> {
  const [frontResult, taskResult, dependencyResult] = await Promise.all([
    client.from('pedido_frentes').select('id,pedido_id,nome,ordem')
      .eq('organization_id', org).eq('pedido_id', orderId).order('ordem'),
    client.from('tarefas').select('id,organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,responsavel_user_id,responsavel,vencimento,vencimento_rule,follow_up_date,follow_up_rule,waiting_type,waiting_user_id,waiting_note,updated_at,concluida_em,concluido')
      .eq('organization_id', org).eq('pedido_id', orderId),
    client.from('tarefa_dependencias').select('tarefa_id,predecessora_id')
      .eq('organization_id', org).eq('pedido_id', orderId),
  ]);
  if (frontResult.error) throw frontResult.error;
  if (taskResult.error) throw taskResult.error;
  if (dependencyResult.error) throw dependencyResult.error;
  const tasks = (taskResult.data ?? []).map(row => mapTask(row, 'v1'));
  let subtasks: Subtask[] = [];
  if (tasks.length > 0) {
    const { data, error } = await client.from('subtarefas')
      .select('id,tarefa_id,descricao,concluida,vencimento,prioridade,vencimento_rule')
      .eq('organization_id', org).in('tarefa_id', tasks.map(task => task.id));
    if (error) throw error;
    subtasks = subtaskSchema.parse(data ?? []).map(row => ({ id: row.id, taskId: row.tarefa_id,
      title: row.descricao, completed: row.concluida ?? false, dueDate: row.vencimento,
      priority: row.prioridade, dueRule: row.vencimento_rule ?? null }));
  }
  return {
    fronts: frontSchema.parse(frontResult.data ?? []).map(row => ({ id: row.id, orderId: row.pedido_id,
      name: row.nome, position: row.ordem })),
    tasks,
    subtasks,
    dependencies: dependencySchema.parse(dependencyResult.data ?? [])
      .map(row => ({ taskId: row.tarefa_id, predecessorId: row.predecessora_id })),
  };
}

export async function loadOrderRecentActivity(client: SupabaseClient, org: Id, orderId: Id): Promise<{
  text: string; at: string; author: string;
} | null> {
  const { data, error } = await client.from('atividades')
    .select('descricao,criado_em,usuario').eq('organization_id', org).eq('pedido_id', orderId)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = recentSchema.parse(data);
  return { text: row.descricao, at: row.criado_em, author: row.usuario };
}

// Temporary legacy projection for the existing task editor; it never requests activity or files.
export async function loadLegacyOrderDetail(client: SupabaseClient, org: Id, orderId: Id,
  statusMode: Capabilities['statusMode']): Promise<Order | null> {
  const { data, error } = await client.from('pedidos')
    .select('id,organization_id,numero_pedido,projeto,cliente,endereco,status,prioridade,data_criacao,prazo_concessionaria,tarefas(*,subtarefas(*),comentarios_tarefa(*))')
    .eq('organization_id', org).eq('id', orderId).maybeSingle();
  if (error) throw error;
  return data ? mapOrder(data, statusMode) : null;
}

export async function loadOrderUpdates(client: SupabaseClient, org: Id, orderId: Id): Promise<Atividade[]> {
  const { data, error } = await client.from('atividades')
    .select('id,descricao,usuario,criado_em').eq('organization_id', org).eq('pedido_id', orderId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return updateSchema.parse(data ?? []);
}

export async function loadOrderAttachments(client: SupabaseClient, org: Id, orderId: Id): Promise<Anexo[]> {
  const { data, error } = await client.from('anexos')
    .select('id,pedido_id,nome_arquivo,legenda,storage_path,tipo,criado_em')
    .eq('organization_id', org).eq('pedido_id', orderId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return attachmentSchema.parse(data ?? []).map(row => ({ ...row, legenda: row.legenda ?? undefined }));
}
