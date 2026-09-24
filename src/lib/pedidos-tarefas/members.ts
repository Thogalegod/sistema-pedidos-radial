import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Capabilities, Id, Member, WriteResult } from './types';

const directorySchema = z.array(z.object({ user_id: z.string().min(1), display_name: z.string().nullable() }));
const capabilitiesSchema = z.object({
  statusMode: z.enum(['legacy', 'v1']), timelineMode: z.enum(['legacy', 'copying', 'v1']),
});
const legacyTasksSchema = z.array(z.object({
  id: z.string().min(1),
  responsavel: z.string().min(1),
}));

export type UnassignedLegacyTask = { taskId: Id; label: string };
export type MembershipRole = 'admin' | 'member';

function writeFailure(error: { code?: string; message: string }): WriteResult<never> {
  const code = error.code === '42501'
    ? 'forbidden'
    : error.code === '22023'
      ? 'invalid'
      : error.code === '23503'
        ? 'conflict'
        : 'reload';
  return { ok: false, code, message: error.message };
}

export function resolveNamedMember(members: Member[], name: string): Id | null {
  const normalized = name.trim().normalize('NFC').toLocaleLowerCase('pt-BR');
  if (!normalized) return null;
  const matches = members.filter(member => member.displayName?.trim().normalize('NFC').toLocaleLowerCase('pt-BR') === normalized);
  return matches.length === 1 ? matches[0].userId : null;
}

export async function listMembers(client: SupabaseClient, org: Id): Promise<Member[]> {
  const { data, error } = await client.rpc('list_pedido_members', { p_org: org });
  if (error) throw new Error(`Não foi possível carregar os membros: ${error.message}`);
  return directorySchema.parse(data).map(row => ({ userId: row.user_id, displayName: row.display_name }));
}

export async function readCurrentMembershipRole(
  client: SupabaseClient,
  org: Id,
  userId: Id
): Promise<MembershipRole> {
  const { data, error } = await client
    .from('organization_members')
    .select('role')
    .eq('organization_id', org)
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`Não foi possível validar a permissão do membro: ${error.message}`);
  return z.object({ role: z.enum(['admin', 'member']) }).parse(data).role;
}

export function formatMemberLabel(member: Member): string {
  const name = member.displayName?.trim();
  return name || `Membro sem nome · ${member.userId.slice(0, 8)}`;
}

export async function listUnassignedLegacyTasks(
  client: SupabaseClient,
  org: Id
): Promise<UnassignedLegacyTask[]> {
  const { data, error } = await client
    .from('tarefas')
    .select('id,responsavel')
    .eq('organization_id', org)
    .is('responsavel_user_id', null)
    .not('responsavel', 'is', null)
    .order('responsavel', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw new Error(`Não foi possível carregar as tarefas sem identidade: ${error.message}`);
  return legacyTasksSchema.parse(data).map(row => ({ taskId: row.id, label: row.responsavel }));
}

export async function setMemberDisplayName(
  client: SupabaseClient,
  org: Id,
  userId: Id,
  name: string
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('set_pedido_member_display_name', {
    p_org: org,
    p_member: userId,
    p_name: name,
  });
  return error ? writeFailure(error) : { ok: true, value: undefined };
}

export async function assignLegacyTasks(
  client: SupabaseClient,
  org: Id,
  taskIds: Id[],
  userId: Id
): Promise<WriteResult<number>> {
  const { data, error } = await client.rpc('assign_legacy_pedido_tasks', {
    p_org: org,
    p_task_ids: taskIds,
    p_member: userId,
  });
  if (error) return writeFailure(error);
  return { ok: true, value: z.number().int().nonnegative().parse(data) };
}

export async function readCapabilities(client: SupabaseClient, org: Id): Promise<Capabilities> {
  const { data, error } = await client.rpc('pedidos_v1_capabilities', { p_org: org });
  if (error) throw new Error(`Não foi possível carregar o modo de transição: ${error.message}`);
  return capabilitiesSchema.parse(data);
}
