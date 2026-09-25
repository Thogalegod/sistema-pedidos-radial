import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { DateKey, Id, WriteResult } from './types';

export type TimelineEntry = {
  id: Id;
  orderId: Id | null;
  frontId: Id | null;
  taskId: Id | null;
  kind: 'manual' | 'system';
  text: string;
  authorId: Id | null;
  authorName: string;
  at: string;
  followUpDate: DateKey | null;
};

export type UpdateInput = {
  orderId: Id | null;
  frontId: Id | null;
  taskId: Id | null;
  text: string;
  followUpDate?: DateKey | null;
};

const rowSchema = z.array(z.object({
  id: z.string(), pedido_id: z.string().nullable(), frente_id: z.string().nullable(),
  tarefa_id: z.string().nullable(), tipo: z.enum(['manual', 'system']), descricao: z.string(),
  user_id: z.string().nullable(), usuario: z.string(), criado_em: z.string(),
  follow_up_date: z.string().nullable(),
}));

function failure(error: { code?: string; message: string }): WriteResult<never> {
  const code = error.code === '42501' ? 'forbidden'
    : ['22023', '22P02', '23514'].includes(error.code ?? '') ? 'invalid'
      : ['23503', '23505'].includes(error.code ?? '') ? 'conflict' : 'reload';
  return { ok: false, code, message: error.message };
}

export async function loadTimeline(
  client: SupabaseClient,
  org: Id,
  scope: { orderId: Id } | { taskId: Id },
): Promise<TimelineEntry[]> {
  const { data, error } = await client.rpc('list_pedido_timeline', {
    p_org: org,
    p_order: 'orderId' in scope ? scope.orderId : null,
    p_task: 'taskId' in scope ? scope.taskId : null,
  });
  if (error) throw new Error(`Não foi possível carregar as atualizações: ${error.message}`);
  return rowSchema.parse(data ?? []).map(row => ({
    id: row.id, orderId: row.pedido_id, frontId: row.frente_id, taskId: row.tarefa_id,
    kind: row.tipo, text: row.descricao, authorId: row.user_id, authorName: row.usuario,
    at: row.criado_em, followUpDate: row.follow_up_date,
  }));
}

export async function addUpdate(
  client: SupabaseClient,
  org: Id,
  input: UpdateInput,
): Promise<WriteResult<Id>> {
  const normalized = input.text.trim();
  if (!normalized) return { ok: false, code: 'invalid', message: 'A atualização não pode ficar vazia' };
  if (input.followUpDate !== undefined && input.taskId === null) {
    return { ok: false, code: 'invalid', message: 'Follow-up exige uma tarefa' };
  }
  const payload = { ...input, text: normalized };
  const { data, error } = await client.rpc('add_pedido_update', { p_org: org, p_input: payload });
  if (error) return failure(error);
  const parsed = z.string().min(1).safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data }
    : { ok: false, code: 'reload', message: 'Resposta inválida ao salvar atualização' };
}

export async function deleteUpdate(
  client: SupabaseClient,
  org: Id,
  id: Id,
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('delete_pedido_update', { p_org: org, p_id: id });
  return error ? failure(error) : { ok: true, value: undefined };
}
