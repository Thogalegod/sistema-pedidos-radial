import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { DateKey, Id, WriteResult } from './types';

export type EventKind = 'meeting' | 'visit' | 'external_service' | 'other';
export type EventV1 = {
  id: Id; kind: EventKind; title: string; date: DateKey; time: string;
  assigneeId: Id; note: string | null; customerId: Id | null;
  orderId: Id | null; frontId: Id | null; taskId: Id | null;
};
export type EventEditorOptions = {
  orders: Array<{ id: Id; label: string }>;
  fronts: Array<{ id: Id; orderId: Id; label: string }>;
  tasks: Array<{ id: Id; orderId: Id | null; frontId: Id | null; label: string }>;
  customers: Array<{ id: Id; label: string }>;
};

const eventRow = z.object({
  id: z.string().min(1), tipo: z.enum(['meeting', 'visit', 'external_service', 'other']),
  titulo: z.string().min(1), data: z.string(), horario: z.string(),
  responsavel_user_id: z.string().min(1), observacao: z.string().nullable(),
  customer_id: z.string().nullable(), pedido_id: z.string().nullable(),
  frente_id: z.string().nullable(), tarefa_id: z.string().nullable(),
});

const columns = 'id,tipo,titulo,data,horario,responsavel_user_id,observacao,customer_id,pedido_id,frente_id,tarefa_id';

function mapEvent(row: z.infer<typeof eventRow>): EventV1 {
  return { id: row.id, kind: row.tipo, title: row.titulo,
    date: row.data, time: row.horario.slice(0, 5), assigneeId: row.responsavel_user_id,
    note: row.observacao, customerId: row.customer_id, orderId: row.pedido_id,
    frontId: row.frente_id, taskId: row.tarefa_id };
}

export async function loadEvent(client: SupabaseClient, org: Id, id: Id): Promise<EventV1 | null> {
  if (!org || !id) return null;
  const { data, error } = await client.from('pedido_eventos').select(columns)
    .eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o evento: ${error.message}`);
  if (!data) return null;
  return mapEvent(eventRow.parse(data));
}

export async function loadEventEditorOptions(client: SupabaseClient, org: Id): Promise<EventEditorOptions> {
  const [orders, fronts, tasks, customers] = await Promise.all([
    client.from('pedidos').select('id,numero_pedido,projeto').eq('organization_id', org).order('numero_pedido'),
    client.from('pedido_frentes').select('id,pedido_id,nome').eq('organization_id', org).order('ordem'),
    client.from('tarefas').select('id,pedido_id,frente_id,descricao').eq('organization_id', org).order('descricao'),
    client.from('customers').select('id,trade_name,legal_name').eq('organization_id', org).order('trade_name'),
  ]);
  const failed = [orders, fronts, tasks, customers].find(result => result.error);
  if (failed?.error) throw new Error(`Não foi possível carregar as associações do evento: ${failed.error.message}`);
  const orderRows = z.array(z.object({ id: z.string(), numero_pedido: z.string(), projeto: z.string() })).parse(orders.data ?? []);
  const frontRows = z.array(z.object({ id: z.string(), pedido_id: z.string(), nome: z.string() })).parse(fronts.data ?? []);
  const taskRows = z.array(z.object({ id: z.string(), pedido_id: z.string().nullable(),
    frente_id: z.string().nullable(), descricao: z.string() })).parse(tasks.data ?? []);
  const customerRows = z.array(z.object({ id: z.string(), trade_name: z.string(), legal_name: z.string() })).parse(customers.data ?? []);
  return {
    orders: orderRows.map(row => ({ id: row.id, label: `#${row.numero_pedido} · ${row.projeto}` })),
    fronts: frontRows.map(row => ({ id: row.id, orderId: row.pedido_id, label: row.nome })),
    tasks: taskRows.map(row => ({ id: row.id, orderId: row.pedido_id, frontId: row.frente_id, label: row.descricao })),
    customers: customerRows.map(row => ({ id: row.id, label: row.trade_name || row.legal_name })),
  };
}

function failure(error: { code?: string; message: string }): WriteResult<never> {
  const code = error.code === '42501' ? 'forbidden'
    : ['23503', '23505', '23514'].includes(error.code ?? '') ? 'conflict'
      : ['22007', '22023'].includes(error.code ?? '') ? 'invalid' : 'reload';
  return { ok: false, code, message: error.message };
}

export async function saveEvent(client: SupabaseClient, org: Id, input: EventV1): Promise<WriteResult<EventV1>> {
  if (!org || !input.title.trim() || !input.assigneeId
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)
    || (input.frontId !== null && input.orderId === null && input.taskId === null)) {
    return { ok: false, code: 'invalid', message: 'Dados do evento inválidos' };
  }
  const payload = {
    tipo: input.kind, titulo: input.title.trim(), data: input.date, horario: input.time,
    responsavel_user_id: input.assigneeId, observacao: input.note,
    customer_id: input.customerId, pedido_id: input.orderId,
    frente_id: input.frontId, tarefa_id: input.taskId,
  };
  const query = input.id
    ? client.from('pedido_eventos').update(payload).eq('organization_id', org).eq('id', input.id)
    : client.from('pedido_eventos').insert({ organization_id: org, ...payload });
  const { data, error } = await query.select(columns).single();
  if (error) return failure(error);
  const parsed = eventRow.safeParse(data);
  if (!parsed.success) return { ok: false, code: 'reload', message: 'Resposta inválida ao salvar evento' };
  return { ok: true, value: mapEvent(parsed.data) };
}

export async function deleteEvent(client: SupabaseClient, org: Id, id: Id): Promise<WriteResult<void>> {
  if (!org || !id) return { ok: false, code: 'invalid', message: 'Evento inválido' };
  const { data, error } = await client.from('pedido_eventos').delete()
    .eq('organization_id', org).eq('id', id).select('id');
  if (error) return failure(error);
  return Array.isArray(data) && data.length === 1 && data[0]?.id === id
    ? { ok: true, value: undefined }
    : { ok: false, code: 'reload', message: 'Evento não encontrado; recarregue os dados' };
}
