'use server';

import { supabase } from '@/lib/supabase';
import { calcularRelatorio, formatarNumeroRelatorio, tensaoBtLabel, TransformerInput } from '@/lib/transformer-calc';
import { revalidatePath } from 'next/cache';

export async function criarRelatorioTransformador(input: TransformerInput, access_token?: string, refresh_token?: string) {
  console.log('[ACTION] criarRelatorioTransformador chamada com input:', input.potenciaKva, 'kVA');
  
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    console.error('[ACTION] Usuário não autenticado no servidor. Erro:', userError);
    throw new Error('Não autenticado. Sessão não encontrada no servidor.');
  }

  // 1. Gera os valores calculados AGORA e salva fixos
  const valoresCalculados = calcularRelatorio(input);

  // 2. Gera número sequencial do relatório
  // Conta os relatórios do mês atual para sequencial
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

  const { count } = await supabase
    .from('relatorios_transformador')
    .select('*', { count: 'exact', head: true })
    .gte('criado_em', inicioMes);

  const sequencial = (count ?? 0) + 1;
  const numeroRelatorio = formatarNumeroRelatorio(sequencial);

  // 3. Salva no banco — valores nunca serão recalculados automaticamente
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .insert({
      numero_relatorio: numeroRelatorio,
      criado_por: user.id,

      cliente_nome: input.clienteNome,
      cliente_endereco: input.clienteEndereco,
      cliente_cidade: input.clienteCidade,
      cliente_uf: input.clienteUf,
      cliente_cnpj: input.clienteCnpj,
      cliente_ie: input.clienteIe,
      observacoes: input.observacoes,

      fabricante: input.fabricante,
      numero_serie: input.numeroSerie,
      potencia_kva: input.potenciaKva,
      tensao_at_nominal: input.tensaoAtNominal,
      tensao_bt: input.tensaoBt,
      tensao_bt_label: tensaoBtLabel(input.tensaoBt),
      resfriamento: input.resfriamento ?? 'LN',
      grupo_ligacao: input.grupoLigacao ?? 'Subtrativa',
      tipo_oleo: input.tipoOleo ?? 'Mineral',
      procedencia_oleo: input.procedenciaOleo ?? 'BR',
      tap_despacho: input.tapDespacho,
      taps: input.taps,

      responsavel_nome: input.responsavelNome ?? 'Roberto Fontes Lopes',
      responsavel_crea: input.responsavelCrea ?? 'CREA 060.104.922.9',
      data_relatorio: input.dataRelatorio,
      temperatura_c: input.temperaturaC ?? 26,
      umidade_relativa: input.umidadeRelativa,

      valores_calculados: valoresCalculados, // FIXO — nunca se altera
      status: 'gerado',
    })
    .select()
    .single();

  if (error) {
    console.error('[ACTION ERROR] Erro detalhado do Supabase:', JSON.stringify(error, null, 2));
    throw new Error(`Erro ao salvar relatório: ${error.message}`);
  }

  revalidatePath('/inspecoes');
  return { numeroRelatorio, id: data.id };
}

export async function listarRelatorios() {
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .select('id, numero_relatorio, cliente_nome, potencia_kva, tensao_bt_label, data_relatorio, status, criado_em')
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function buscarRelatorio(id: string) {
  const { data, error } = await supabase
    .from('relatorios_transformador')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function cancelarRelatorio(id: string, access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
  
  const { error } = await supabase.from('relatorios_transformador').update({ status: 'cancelado' }).eq('id', id);
  if (error) throw new Error(`Erro ao cancelar: ${error.message}`);
  
  revalidatePath('/inspecoes');
  revalidatePath(`/inspecoes/${id}`);
}

export async function deletarRelatorio(id: string, access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
  
  const { error } = await supabase.from('relatorios_transformador').delete().eq('id', id);
  if (error) throw new Error(`Erro ao deletar: ${error.message}`);
  
  revalidatePath('/inspecoes');
}

export async function criarRevisao(idOrigem: string, input: TransformerInput, access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
  
  // Buscar relatório antigo
  const { data: relAntigo, error: errAntigo } = await supabase
    .from('relatorios_transformador')
    .select('numero_relatorio, observacoes')
    .eq('id', idOrigem)
    .single();
    
  if (errAntigo || !relAntigo) throw new Error('Relatório antigo não encontrado');
  
  // Adicionar anotação de revisão no NOVO
  const novaObs = input.observacoes 
    ? `${input.observacoes}\n(Revisão do relatório ${relAntigo.numero_relatorio})`
    : `Revisão do relatório ${relAntigo.numero_relatorio}`;
  
  const novoInput = { ...input, observacoes: novaObs };
  
  // Criar o NOVO
  const novoRelatorio = await criarRelatorioTransformador(novoInput, access_token, refresh_token);
  
  // Cancelar o ANTIGO e anotar a substituição
  const obsAntiga = relAntigo.observacoes 
    ? `${relAntigo.observacoes}\n(Substituído pelo relatório ${novoRelatorio.numeroRelatorio})`
    : `Substituído pelo relatório ${novoRelatorio.numeroRelatorio}`;
    
  await supabase.from('relatorios_transformador').update({
    status: 'cancelado',
    observacoes: obsAntiga
  }).eq('id', idOrigem);
  
  revalidatePath('/inspecoes');
  revalidatePath(`/inspecoes/${idOrigem}`);
  
  return novoRelatorio;
}
