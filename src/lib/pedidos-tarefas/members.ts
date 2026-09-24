import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Capabilities, Id, Member } from './types';

const directorySchema = z.array(z.object({ user_id: z.string().min(1), display_name: z.string().nullable() }));
const capabilitiesSchema = z.object({
  statusMode: z.enum(['legacy', 'v1']), timelineMode: z.enum(['legacy', 'copying', 'v1']),
});

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

export async function readCapabilities(client: SupabaseClient, org: Id): Promise<Capabilities> {
  const { data, error } = await client.rpc('pedidos_v1_capabilities', { p_org: org });
  if (error) throw new Error(`Não foi possível carregar o modo de transição: ${error.message}`);
  return capabilitiesSchema.parse(data);
}
