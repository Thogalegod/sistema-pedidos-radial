import type { SupabaseClient } from '@supabase/supabase-js';
import type { Front, Id, WriteResult } from './types';

export function chooseInitialFront(fronts: Front[], explicitId: Id | null): Id | null {
  if (explicitId) return fronts.some(front => front.id === explicitId) ? explicitId : null;
  return fronts.length === 1 ? fronts[0].id : null;
}

function failure(error: { code?: string; message: string }): WriteResult<never> {
  const code = error.code === '42501' ? 'forbidden'
    : ['23503', '23505'].includes(error.code ?? '') ? 'conflict'
      : ['22023', '23514'].includes(error.code ?? '') ? 'invalid' : 'reload';
  return { ok: false, code, message: error.message };
}

export async function saveFront(client: SupabaseClient, org: Id, front: Front): Promise<WriteResult<Front>> {
  const name = front.name.trim();
  if (!org || !front.orderId || !name || !Number.isInteger(front.position)) {
    return { ok: false, code: 'invalid', message: 'Dados da Frente inválidos' };
  }
  const query = front.id
    ? client.from('pedido_frentes').update({ nome: name, ordem: front.position })
      .eq('organization_id', org).eq('pedido_id', front.orderId).eq('id', front.id)
    : client.from('pedido_frentes').insert({ organization_id: org, pedido_id: front.orderId,
      nome: name, ordem: front.position });
  const { data, error } = await query.select('id,pedido_id,nome,ordem').single();
  if (error) return failure(error);
  if (!data || data.pedido_id !== front.orderId || !data.id) {
    return { ok: false, code: 'reload', message: 'Resposta inválida ao salvar Frente' };
  }
  return { ok: true, value: { id: data.id, orderId: data.pedido_id,
    name: data.nome, position: data.ordem } };
}

export async function removeFront(client: SupabaseClient, org: Id, id: Id,
  destinationId: Id | null): Promise<WriteResult<void>> {
  if (destinationId === id) {
    return { ok: false, code: 'invalid', message: 'Escolha outra Frente de destino' };
  }
  const { error } = await client.rpc('remove_pedido_front', {
    p_org: org, p_front: id, p_destination: destinationId,
  });
  return error ? failure(error) : { ok: true, value: undefined };
}
