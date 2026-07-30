'use server';

import { supabase } from '@/lib/supabase';
import { TransformerInput } from '@/lib/transformer-calc';
import { getCurrentOrganizationId } from '@/lib/pedidos-tarefas/organization';
import {
  buildTransformadorInsert,
  buildTransformadorRevisionInput,
} from '@/lib/transformador/report-actions';
import { revalidatePath } from 'next/cache';

async function setSession(access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(`Não foi possível autenticar a sessão: ${error.message}`);
  }
}

async function getTransformadorContext(access_token?: string, refresh_token?: string) {
  await setSession(access_token, refresh_token);

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    throw new Error(`Não autenticado${userError?.message ? `: ${userError.message}` : ''}`);
  }

  const organizationId = await getCurrentOrganizationId(supabase);
  return { user, organizationId };
}

async function insertRelatorioTransformador(
  input: TransformerInput,
  context: { organizationId: string; userId: string; revisedFromId?: string }
) {
  const payload = buildTransformadorInsert(input, context);

  const { data, error } = await supabase
    .from('relatorios_transformador')
    .insert(payload)
    .select('id, numero_relatorio')
    .single();

  if (error) {
    throw new Error(`Erro ao salvar relatório: ${error.message}`);
  }

  return data;
}

export async function criarRelatorioTransformador(input: TransformerInput, access_token?: string, refresh_token?: string) {
  const { user, organizationId } = await getTransformadorContext(access_token, refresh_token);
  const data = await insertRelatorioTransformador(input, {
    organizationId,
    userId: user.id,
  });

  revalidatePath('/inspecoes');
  return { numeroRelatorio: data.numero_relatorio, id: data.id, organizationId };
}

export async function listarRelatorios() {
  const organizationId = await getCurrentOrganizationId(supabase);
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .select('id, numero_relatorio, cliente_nome, potencia_kva, tensao_bt_label, data_relatorio, status, criado_em')
    .eq('organization_id', organizationId)
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function buscarRelatorio(id: string) {
  const organizationId = await getCurrentOrganizationId(supabase);
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function cancelarRelatorio(id: string, access_token?: string, refresh_token?: string) {
  const { organizationId } = await getTransformadorContext(access_token, refresh_token);
  
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .update({ status: 'cancelado' })
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('id, status')
    .single();
  if (error || !data) {
    throw new Error(`Erro ao cancelar: ${error?.message ?? 'relatório não encontrado na organização'}`);
  }
  
  revalidatePath('/inspecoes');
  revalidatePath(`/inspecoes/${id}`);
  return { id: data.id, status: data.status };
}

export async function deletarRelatorio(id: string, access_token?: string, refresh_token?: string) {
  const { organizationId } = await getTransformadorContext(access_token, refresh_token);

  const { data: report, error: readError } = await supabase
    .from('relatorios_transformador')
    .select('id, status, revised_from_id, superseded_by_id')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .single();

  if (readError || !report) {
    throw new Error(`Erro ao localizar relatório: ${readError?.message ?? 'não encontrado na organização'}`);
  }

  if (report.status !== 'cancelado') {
    throw new Error('Somente relatórios cancelados podem ser excluídos');
  }

  if (report.status === 'revisado' || report.revised_from_id || report.superseded_by_id) {
    throw new Error('Relatórios vinculados ao histórico de revisão não podem ser excluídos');
  }

  const { data, error } = await supabase
    .from('relatorios_transformador')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Erro ao deletar: ${error?.message ?? 'relatório não encontrado na organização'}`);
  }
  
  revalidatePath('/inspecoes');
  return { id: data.id };
}

export async function criarRevisao(idOrigem: string, input: TransformerInput, access_token?: string, refresh_token?: string) {
  const { user, organizationId } = await getTransformadorContext(access_token, refresh_token);
  
  const { data: relAntigo, error: errAntigo } = await supabase
    .from('relatorios_transformador')
    .select('id, numero_relatorio, observacoes, status')
    .eq('organization_id', organizationId)
    .eq('id', idOrigem)
    .single();
    
  if (errAntigo || !relAntigo) throw new Error('Relatório antigo não encontrado');
  if (relAntigo.status === 'revisado') throw new Error('Este relatório já possui revisão');
  
  const revision = buildTransformadorRevisionInput(input, {
    originalId: idOrigem,
    originalNumber: relAntigo.numero_relatorio,
  });

  const payload = buildTransformadorInsert(revision.input, {
    organizationId,
    userId: user.id,
    revisedFromId: revision.revisedFromId,
  });

  const { data: revisionData, error: revisionError } = await supabase
    .rpc('create_transformador_revision', {
      p_organization_id: organizationId,
      p_original_id: idOrigem,
      p_report: payload,
    })
    .single();

  const novoRelatorio = revisionData as { id: string; numero_relatorio: string } | null;

  if (revisionError || !novoRelatorio) {
    throw new Error(`Erro ao criar revisão: ${revisionError?.message ?? 'relatório revisado não retornado'}`);
  }
  
  revalidatePath('/inspecoes');
  revalidatePath(`/inspecoes/${idOrigem}`);
  
  return {
    numeroRelatorio: novoRelatorio.numero_relatorio,
    id: novoRelatorio.id,
    organizationId,
  };
}
