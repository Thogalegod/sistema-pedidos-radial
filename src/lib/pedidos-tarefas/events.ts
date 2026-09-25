import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { DateKey, Id, WriteResult } from './types';

export type EventKind = 'meeting' | 'visit' | 'external_service' | 'other';
export type EventV1 = {
  id: Id; kind: EventKind; title: string; date: DateKey; time: string;
  assigneeId: Id; note: string | null; customerId: Id | null;
  orderId: Id | null; frontId: Id | null; taskId: Id | null;
};

const eventRow = z.object({
  id: z.string().min(1), tipo: z.enum(['meeting', 'visit', 'external_service', 'other']),
  titulo: z.string().min(1), data: z.string(), horario: z.string(),
  responsavel_user_id: z.string().min(1), observacao: z.string().nullable(),
  customer_id: z.string().nullable(), pedido_id: z.string().nullable(),
  frente_id: z.string().nullable(), tarefa_id: z.string().nullable(),
});

const columns = 'id,tipo,titulo,data,horario,responsavel_user_id,observacao,customer_id,pedido_id,frente_id,tarefa_id';

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
  const row = parsed.data;
  return { ok: true, value: { id: row.id, kind: row.tipo, title: row.titulo,
    date: row.data, time: row.horario.slice(0, 5), assigneeId: row.responsavel_user_id,
    note: row.observacao, customerId: row.customer_id, orderId: row.pedido_id,
    frontId: row.frente_id, taskId: row.tarefa_id } };
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
