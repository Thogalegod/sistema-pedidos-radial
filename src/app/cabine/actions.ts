'use server';

import { supabase } from '@/lib/supabase';
import { calcularCabine, CabineInput } from '@/lib/cabine-calc';
import {
  CABINE_DOCUMENT_BUCKET,
  assertCabineDocumentRemoved,
  buildCabineDocumentPath,
  deleteCabineReportThenDocument,
} from '@/lib/cabine/documents';
import { getCurrentOrganizationId } from '@/lib/pedidos-tarefas/organization';
import { revalidatePath } from 'next/cache';

async function setSession(access_token?: string, refresh_token?: string) {
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(`Não foi possível autenticar a sessão: ${error.message}`);
  }
}

async function getCabineContext(access_token?: string, refresh_token?: string) {
  await setSession(access_token, refresh_token);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const organizationId = await getCurrentOrganizationId(supabase);
  return { user, organizationId };
}

export async function criarRelatorioCabine(input: CabineInput, access_token?: string, refresh_token?: string) {
  const { user, organizationId } = await getCabineContext(access_token, refresh_token);

  const valoresCalculados = calcularCabine(input);

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  
  const { count } = await supabase
    .from('relatorios_cabine')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('criado_em', inicioMes);

  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const numeroRelatorio = `RC-${agora.getFullYear()}${mes}-${seq}`;

  const { data, error } = await supabase
    .from('relatorios_cabine')
    .insert({
      organization_id: organizationId,
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
      art_storage_path: null,
      revisao: input.revisao ?? 0,
      valores_calculados: valoresCalculados,
      status: 'gerado',
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar: ${error.message}`);
  revalidatePath('/cabine');
  return { numeroRelatorio, id: data.id, organizationId };
}

export async function listarRelatoriosCabine() {
  const organizationId = await getCurrentOrganizationId(supabase);
  const { data, error } = await supabase
    .from('relatorios_cabine')
    .select('id, numero_relatorio, cliente_nome, data_execucao, status, criado_em')
    .eq('organization_id', organizationId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function buscarRelatorioCabine(id: string) {
  const organizationId = await getCurrentOrganizationId(supabase);
  const { data, error } = await supabase
    .from('relatorios_cabine')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function cancelarRelatorioCabine(id: string, access_token?: string, refresh_token?: string) {
  const { organizationId } = await getCabineContext(access_token, refresh_token);
  const { data, error } = await supabase
    .from('relatorios_cabine')
    .update({ status: 'cancelado' })
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('id, status')
    .single();
  if (error || !data) {
    throw new Error(
      `Não foi possível cancelar o relatório: ${error?.message ?? 'não encontrado na organização'}`
    );
  }
  revalidatePath('/cabine');
  revalidatePath(`/cabine/${id}`);
  return { id: data.id, status: data.status };
}

export async function vincularArtCabine(
  id: string,
  expectedOrganizationId: string,
  storagePath: string,
  access_token?: string,
  refresh_token?: string
) {
  const { organizationId } = await getCabineContext(access_token, refresh_token);
  if (organizationId !== expectedOrganizationId) {
    throw new Error('A organização do relatório não corresponde à sessão autenticada');
  }

  const fileName = storagePath.split('/')[2] ?? '';
  if (storagePath !== buildCabineDocumentPath(organizationId, id, fileName)) {
    throw new Error('Path inválido para a ART do relatório');
  }

  const { data, error } = await supabase
    .from('relatorios_cabine')
    .update({ art_storage_path: storagePath })
    .eq('organization_id', organizationId)
    .eq('id', id)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível vincular a ART: ${error?.message ?? 'relatório não encontrado'}`);
  }

  revalidatePath(`/cabine/${id}`);
}

export async function deletarRelatorioCabine(id: string, access_token?: string, refresh_token?: string) {
  const { organizationId } = await getCabineContext(access_token, refresh_token);
  const { data: report, error: readError } = await supabase
    .from('relatorios_cabine')
    .select('art_storage_path')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .single();

  if (readError || !report) {
    throw new Error(`Não foi possível localizar o relatório: ${readError?.message ?? 'não encontrado'}`);
  }

  let reportDeleted = false;

  try {
    await deleteCabineReportThenDocument({
      artStoragePath: report.art_storage_path,
      deleteReport: async () => {
        const { data, error } = await supabase
          .from('relatorios_cabine')
          .delete()
          .eq('organization_id', organizationId)
          .eq('id', id)
          .select('id')
          .single();
        if (error || !data) {
          throw new Error(
            `Falha ao excluir o relatório: ${error?.message ?? 'não encontrado na organização'}`
          );
        }
        reportDeleted = true;
      },
      removeDocument: async (storagePath) => {
        const result = await supabase.storage.from(CABINE_DOCUMENT_BUCKET).remove([storagePath]);
        assertCabineDocumentRemoved(storagePath, result);
      },
    });
    return { reportDeleted: true, storageDeleted: true } as const;
  } catch (error) {
    if (reportDeleted) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      return {
        reportDeleted: true,
        storageDeleted: false,
        error: message.includes('objeto órfão')
          ? message
          : `Relatório excluído, mas pode ter restado um objeto órfão no Storage: ${message}`,
      } as const;
    }
    throw error;
  } finally {
    revalidatePath('/cabine');
    revalidatePath(`/cabine/${id}`);
  }
}
