'use server';

import { supabase } from '@/lib/supabase';
import { calcularCabine, CabineInput } from '@/lib/cabine-calc';
import { revalidatePath } from 'next/cache';

export async function criarRelatorioCabine(input: CabineInput, access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const valoresCalculados = calcularCabine(input);

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  
  const { count } = await supabase
    .from('relatorios_cabine')
    .select('*', { count: 'exact', head: true })
    .gte('criado_em', inicioMes);

  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const numeroRelatorio = `RC-${agora.getFullYear()}${mes}-${seq}`;

  const { data, error } = await supabase
    .from('relatorios_cabine')
    .insert({
      numero_relatorio: numeroRelatorio,
      criado_por: user.id,
      cliente_nome: input.clienteNome,
      cliente_endereco: input.clienteEndereco,
      cliente_cidade: input.clienteCidade,
      cliente_uf: input.clienteUf,
      cliente_cep: input.clienteCep,
      cliente_cnpj: input.clienteCnpj,
      cliente_ie: input.clienteIe,
      data_execucao: input.dataExecucao,
      objetivo: input.objetivo ?? 'Relatório de testes Cabine Primária',
      cabo_de: input.caboDe,
      cabo_para: input.caboPara,
      cabo_modelo: input.caboModelo ?? 'EPR 8,7/15kV',
      cabo_comprimento: input.caboComprimento,
      cabo_bitola: input.caboBitola,
      cabo_terminais: input.caboTerminais ?? 'Polimérica',
      cabo_isolacao: input.caboIsolacao ?? 'EPR',
      cabo_secao: input.caboSecao ?? '25mm²',
      cabo_emendas: input.caboEmendas ?? 'Não',
      cabo_instalacao: input.caboInstalacao ?? 'Subterrânea',
      cabo_blindagem: input.caboBlindagem ?? 'Fita de cobre',
      cabo_temperatura: input.caboTemperatura,
      cabo_umidade: input.caboUmidade,
      cabo_clima: input.caboClima ?? 'Bom',
      hipot_tensao_teste: input.hipotTensaoTeste ?? '35kV',
      hipot_duracao: input.hipotDuracao ?? '15 min',
      hipot_instrumento: input.hipotInstrumento,
      hipot_serie_instrumento: input.hipotSerieInstrumento,
      megger_tensao_teste: input.meggerTensaoTeste ?? '10kV',
      megger_duracao: input.meggerDuracao ?? '15 min',
      megger_instrumento: input.meggerInstrumento,
      megger_serie_instrumento: input.meggerSerieInstrumento,
      aterramento_qtde_hastes: input.aterramentoQtdeHastes,
      aterramento_tipo: input.aterramentoTipo ?? 'Cobre',
      aterramento_comprimento: input.aterramentoComprimento,
      aterramento_bitola: input.aterramentoBitola ?? '25mm²',
      aterramento_instrumento: input.aterramentoInstrumento,
      aterramento_serie_instrumento: input.aterramentoSerieInstrumento,
      aterramento_temperatura: input.aterramentoTemperatura,
      aterramento_umidade: input.aterramentoUmidade,
      aterramento_clima: input.aterramentoClima ?? 'Bom',
      responsavel_nome: input.responsavelNome ?? 'Roberto Fontes Lopes',
      responsavel_crea: input.responsavelCrea ?? 'CREA 060.104.922.9',
      trafo_potencia_kva: input.trafoPotenciaKva,
      trafo_tensao_bt: input.trafoTensaoBt,
      trafo_taps: input.trafoTaps,
      trafo_tap_despacho: input.trafoTapDespacho,
      trafo_numero_serie: input.trafoNumeroSerie,
      trafo_fabricante: input.trafoFabricante,
      art_numero: input.artNumero,
      art_arquivo_url: input.artArquivoUrl,
      revisao: input.revisao ?? 0,
      valores_calculados: valoresCalculados,
      status: 'gerado',
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar: ${error.message}`);
  revalidatePath('/cabine');
  return { numeroRelatorio, id: data.id };
}

export async function listarRelatoriosCabine() {
  const { data, error } = await supabase
    .from('relatorios_cabine')
    .select('id, numero_relatorio, cliente_nome, data_execucao, status, criado_em')
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function buscarRelatorioCabine(id: string) {
  const { data, error } = await supabase
    .from('relatorios_cabine')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function cancelarRelatorioCabine(id: string, access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
  const { error } = await supabase
    .from('relatorios_cabine')
    .update({ status: 'cancelado' })
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/cabine');
  revalidatePath(`/cabine/${id}`);
}

export async function deletarRelatorioCabine(id: string, access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  }
  const { error } = await supabase
    .from('relatorios_cabine')
    .delete()
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/cabine');
}
