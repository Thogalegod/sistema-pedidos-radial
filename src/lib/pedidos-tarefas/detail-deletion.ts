import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderDetailTable = 'subtarefas' | 'comentarios_tarefa';

export async function deleteOrderDetail(
  client: Pick<SupabaseClient, 'from'>,
  table: OrderDetailTable,
  organizationId: string,
  detailId: string
) {
  const { data, error } = await client
    .from(table)
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', detailId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.id !== detailId) {
    throw new Error(
      'O registro não foi excluído; ele pode não existir ou você pode não ter permissão.'
    );
  }
}
