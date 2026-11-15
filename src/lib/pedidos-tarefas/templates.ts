import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OrderInput } from './commands';
import {
  templateDefinitionSchema,
  type DateRule,
  type TemplateDefinition,
} from './template-schema';
import type { Id, WriteResult } from './types';

export type TemplateRecord = {
  id: Id;
  name: string;
  version: number;
  definition: TemplateDefinition;
};

export type SaveTemplateInput = {
  id: Id | null;
  name: string;
  expectedVersion: number | null;
  definition: TemplateDefinition;
};

export type InstantiateTemplateInput = {
  templateId: Id;
  expectedVersion: number;
  requestId: Id;
  order: OrderInput;
  timeZone: string;
};

type CommandError = { code?: string; message: string };

const templateRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  version: z.number().int().positive(),
  definition: templateDefinitionSchema,
}).strict();

const templateRowSchema = z.object({
  id: z.string().min(1),
  nome: z.string().trim().min(1),
  version: z.number().int().positive(),
  definition: templateDefinitionSchema,
}).strict();

function failure(error: CommandError): WriteResult<never> {
  const code = error.code === '42501'
    ? 'forbidden'
    : ['22023', '22P02', '23514'].includes(error.code ?? '')
      ? 'invalid'
      : ['23503', '23505'].includes(error.code ?? '')
        ? 'conflict'
        : 'reload';
  return { ok: false, code, message: error.message };
}

function invalid(message: string): WriteResult<never> {
  return { ok: false, code: 'invalid', message };
}

function malformedResult(command: string): WriteResult<never> {
  return { ok: false, code: 'reload', message: `Resposta inválida do comando ${command}` };
}

function usesCompletionRule(definition: TemplateDefinition) {
  const isCompletion = (rule: DateRule | null) => rule?.kind === 'completion';
  return definition.tasks.some(task => isCompletion(task.dueRule) || isCompletion(task.followUpRule))
    || definition.subtasks.some(subtask => isCompletion(subtask.dueRule));
}

function validateWritableDefinition(definition: TemplateDefinition): WriteResult<TemplateDefinition> {
  const parsed = templateDefinitionSchema.safeParse(definition);
  if (!parsed.success) return invalid('O blueprint do template é inválido');
  if (usesCompletionRule(parsed.data)) {
    return invalid('Regras após concluir outra tarefa serão liberadas no próximo gate');
  }
  return { ok: true, value: parsed.data };
}

export async function listTemplates(client: SupabaseClient, org: Id): Promise<TemplateRecord[]> {
  const { data, error } = await client
    .from('pedido_templates')
    .select('id,nome,version,definition')
    .eq('organization_id', org)
    .order('nome', { ascending: true })
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return z.array(templateRowSchema).parse(data).map(row => ({
    id: row.id,
    name: row.nome,
    version: row.version,
    definition: row.definition,
  }));
}

export async function saveTemplate(
  client: SupabaseClient,
  org: Id,
  input: SaveTemplateInput,
): Promise<WriteResult<TemplateRecord>> {
  const checked = validateWritableDefinition(input.definition);
  if (!checked.ok) return checked;
  const name = input.name.trim();
  if (!name) return invalid('Nome do template é obrigatório');

  const payload = { ...input, name, definition: checked.value };
  const { data, error } = await client.rpc('save_pedido_template', { p_org: org, p_input: payload });
  if (error) return failure(error);
  const parsed = templateRecordSchema.safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : malformedResult('save_pedido_template');
}

export async function duplicateTemplate(
  client: SupabaseClient,
  org: Id,
  id: Id,
  name: string,
): Promise<WriteResult<TemplateRecord>> {
  const duplicateName = name.trim();
  if (!duplicateName) return invalid('Nome da cópia é obrigatório');
  const { data, error } = await client.rpc('duplicate_pedido_template', {
    p_org: org,
    p_id: id,
    p_name: duplicateName,
  });
  if (error) return failure(error);
  const parsed = templateRecordSchema.safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : malformedResult('duplicate_pedido_template');
}

export async function instantiateTemplate(
  client: SupabaseClient,
  org: Id,
  input: InstantiateTemplateInput,
): Promise<WriteResult<Id>> {
  if (!input.timeZone.trim()) return invalid('Fuso horário é obrigatório');
  const { data, error } = await client.rpc('instantiate_pedido_template', {
    p_org: org,
    p_input: input,
  });
  if (error) return failure(error);
  const parsed = z.string().min(1).safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : malformedResult('instantiate_pedido_template');
}
