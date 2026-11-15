import type { SupabaseClient } from '@supabase/supabase-js';

export async function getCurrentOrganizationId(client: SupabaseClient) {
  const { data, error } = await client
    .from('organization_members')
    .select('organization_id')
    .limit(1)
    .single();

  const membership = data as { organization_id?: string } | null;

  if (error || !membership?.organization_id) {
    throw new Error(
      `Não foi possível identificar a organização atual${error?.message ? `: ${error.message}` : ''}`
    );
  }

  return membership.organization_id;
}
