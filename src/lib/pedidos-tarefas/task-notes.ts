import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ComentarioTarefa } from '@/types';
import type { Id, WriteResult } from './types';
import type { Capabilities } from './types';
import { addUpdate, deleteUpdate, loadTimeline } from './timeline';

const noteSchema = z.object({
  id: z.string(),
  tarefa_id: z.string(),
  texto: z.string(),
  usuario: z.string(),
  criado_em: z.string(),
  event_type: z.string().nullable().optional(),
});

type CommandError = { code?: string; message: string };

function failure(error: CommandError): WriteResult<never> {
  const code = error.code === '42501' ? 'forbidden'
    : ['22023', '22P02', '23514'].includes(error.code ?? '') ? 'invalid'
      : ['23503', '23505'].includes(error.code ?? '') ? 'conflict' : 'reload';
  return { ok: false, code, message: error.message };
}

export async function listTaskNotes(
  client: SupabaseClient,
  org: Id,
  taskId: Id,
  timelineMode: Capabilities['timelineMode'] = 'legacy',
): Promise<ComentarioTarefa[]> {
  if (timelineMode === 'v1') {
    return (await loadTimeline(client, org, { taskId })).map(entry => ({
      id: entry.id, tarefa_id: taskId, texto: entry.text, usuario: entry.authorName,
      criado_em: entry.at, event_type: entry.kind === 'system' ? 'system' : null,
    }));
  }
  const { data, error } = await client.from('comentarios_tarefa')
    .select('id,tarefa_id,texto,usuario,criado_em,event_type')
    .eq('organization_id', org)
    .eq('tarefa_id', taskId)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar as notas da tarefa: ${error.message}`);
  return z.array(noteSchema).parse(data ?? []);
}

export async function addTaskNote(
  client: SupabaseClient,
  org: Id,
  taskId: Id,
  text: string,
  timelineMode: Capabilities['timelineMode'] = 'legacy',
): Promise<WriteResult<Id>> {
  const normalized = text.trim();
  if (!normalized) return { ok: false, code: 'invalid', message: 'A nota não pode ficar vazia' };
  if (timelineMode === 'v1') {
    return addUpdate(client, org, { orderId: null, frontId: null, taskId, text: normalized });
  }
  const { data, error } = await client.from('comentarios_tarefa').insert({
    organization_id: org,
    tarefa_id: taskId,
    texto: normalized,
    event_type: null,
  }).select('id').single();
  if (error) return failure(error);
  const parsed = z.object({ id: z.string().min(1) }).safeParse(data);
  return parsed.success
    ? { ok: true, value: parsed.data.id }
    : { ok: false, code: 'reload', message: 'Resposta inválida ao salvar nota' };
}

export async function deleteTaskNote(
  client: SupabaseClient,
  org: Id,
  noteId: Id,
  timelineMode: Capabilities['timelineMode'] = 'legacy',
): Promise<WriteResult<void>> {
  if (timelineMode === 'v1') return deleteUpdate(client, org, noteId);
  const { data, error } = await client.from('comentarios_tarefa')
    .delete()
    .eq('organization_id', org)
    .eq('id', noteId)
    .is('event_type', null)
    .select('id')
    .maybeSingle();
  if (error) return failure(error);
  if (!data) return { ok: false, code: 'conflict', message: 'Nota não encontrada ou protegida' };
  return { ok: true, value: undefined };
}
