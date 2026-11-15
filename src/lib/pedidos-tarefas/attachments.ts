import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Anexo } from '@/types';
import type { Capabilities, Id, WriteResult } from './types';

export type AttachmentContext = {
  orderId: Id;
  frontId: Id | null;
  taskId: Id | null;
  updateId: Id | null;
};

export type AttachmentMetadata = {
  name: string;
  caption: string | null;
  path: string;
  type: string;
};

export type StagedAttachment = { file: File; caption: string };

const attachmentSchema = z.array(z.object({
  id: z.string(), pedido_id: z.string(), frente_id: z.string().nullable().optional(),
  tarefa_id: z.string().nullable().optional(), atividade_id: z.string().nullable().optional(),
  nome_arquivo: z.string(), legenda: z.string().nullable(), storage_path: z.string(),
  tipo: z.string(), criado_em: z.string(),
}));

export async function listOrderAttachments(
  client: SupabaseClient,
  org: Id,
  orderId: Id,
  timelineMode: Capabilities['timelineMode'] = 'v1',
): Promise<Anexo[]> {
  const { data, error } = await client.from('anexos')
    .select(timelineMode === 'v1'
      ? 'id,pedido_id,frente_id,tarefa_id,atividade_id,nome_arquivo,legenda,storage_path,tipo,criado_em'
      : 'id,pedido_id,nome_arquivo,legenda,storage_path,tipo,criado_em')
    .eq('organization_id', org).eq('pedido_id', orderId)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar os arquivos: ${error.message}`);
  return attachmentSchema.parse(data ?? []).map(row => ({ ...row, legenda: row.legenda ?? undefined }));
}

export async function saveAttachmentMetadata(
  client: SupabaseClient,
  org: Id,
  context: AttachmentContext,
  file: AttachmentMetadata,
): Promise<WriteResult<Id>> {
  const { data, error } = await client.from('anexos').insert({
    organization_id: org, pedido_id: context.orderId, frente_id: context.frontId,
    tarefa_id: context.taskId, atividade_id: context.updateId, nome_arquivo: file.name,
    legenda: file.caption, storage_path: file.path, tipo: file.type,
  }).select('id').single();
  if (error) return { ok: false, code: error.code === '42501' ? 'forbidden' : 'conflict', message: error.message };
  const parsed = z.object({ id: z.string().min(1) }).safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data.id }
    : { ok: false, code: 'reload', message: 'Resposta inválida ao salvar arquivo' };
}
