'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  buildFichaDisjuntorSearchParams,
  fichaDisjuntorSnapshotToJson,
  isValidFichaDisjuntorId,
  normalizeFichaDisjuntorSnapshot,
  type FichaDisjuntorSnapshot,
  type InspectionStatus,
} from '@/lib/manutencao-preventiva/ficha-disjuntor';
import {
  createSupabaseManutencaoPreventivaClient,
  getFichaDisjuntor,
  getFichaDisjuntorById,
  saveFichaDisjuntor,
} from '@/lib/manutencao-preventiva/queries-mutations';

type FichaContextIds = {
  manutencaoId: string;
  equipamentoId: string;
  fichaId?: string;
};

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const sectionClass = 'bg-white border border-gray-200 rounded-xl shadow-sm p-5';
const statusClass: Record<InspectionStatus, string> = {
  C: 'bg-green-100 text-green-700 border-green-300 focus:border-green-500 focus:ring-green-500',
  'N/A': 'bg-yellow-100 text-yellow-800 border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500',
  'N/C': 'bg-red-100 text-red-700 border-red-300 focus:border-red-500 focus:ring-red-500',
};

const identificationFields = [
  ['tag', 'TAG / identificação'],
  ['fabricante', 'Fabricante'],
  ['modelo', 'Modelo'],
  ['serie', 'Nº série'],
  ['tensaoNominal', 'Tensão nominal'],
  ['correnteNominal', 'Corrente nominal'],
  ['capacidadeInterrupcao', 'Capacidade de interrupção'],
  ['anoFabricacao', 'Ano de fabricação'],
  ['meioExtincao', 'Meio de extinção'],
  ['tipoAcionamento', 'Tipo de acionamento'],
] as const;

const inspectionItems = [
  ['estadoGeral', 'Estado geral'],
  ['limpeza', 'Limpeza'],
  ['aquecimento', 'Sinais de aquecimento'],
  ['corrosao', 'Oxidação / corrosão'],
  ['contatos', 'Condição dos contatos'],
  ['conexoes', 'Condição das conexões'],
  ['operacaoManual', 'Operação manual'],
  ['operacaoEletrica', 'Operação elétrica'],
  ['mecanismo', 'Mecanismo de abertura e fechamento'],
  ['bobinaAbertura', 'Bobina de abertura'],
  ['bobinaFechamento', 'Bobina de fechamento'],
  ['motorCarregamento', 'Motor de carregamento'],
  ['intertravamentos', 'Intertravamentos'],
  ['indicadorPosicao', 'Indicador de posição'],
  ['contadorOperacoes', 'Contador de operações'],
] as const;

const measurementFields = [
  ['resistenciaIsolamento', 'Resistência de isolamento'],
  ['resistenciaContatoA', 'Resistência de contato fase A'],
  ['resistenciaContatoB', 'Resistência de contato fase B'],
  ['resistenciaContatoC', 'Resistência de contato fase C'],
  ['tensaoComando', 'Tensão de comando'],
  ['tempoAbertura', 'Tempo de abertura'],
  ['tempoFechamento', 'Tempo de fechamento'],
] as const;

const conclusionFields = [
  ['situacaoFinal', 'Situação final'],
  ['servicosExecutados', 'Serviços executados'],
  ['irregularidades', 'Irregularidades encontradas'],
  ['recomendacoes', 'Recomendações'],
  ['observacoes', 'Observações'],
] as const;

export default function FichaDisjuntorManutencaoPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const savingFichaRef = useRef(false);
  const [contextIds, setContextIds] = useState<FichaContextIds | null>(null);
  const [fichaId, setFichaId] = useState('');
  const [snapshot, setSnapshot] = useState<FichaDisjuntorSnapshot>({ data: {}, inspectionStatus: {} });
  const [formVersion, setFormVersion] = useState(0);
  const [loadingFicha, setLoadingFicha] = useState(true);
  const [savingFicha, setSavingFicha] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const setLoadError = (message: string) => {
      setContextIds(null);
      setLoadingFicha(false);
      toast.error(message);
    };

    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      const fichaId = params.get('fichaId') ?? '';
      const manutencaoId = params.get('manutencaoId') ?? '';
      const equipamentoId = params.get('equipamentoId') ?? '';
      const hasPairParam = Boolean(manutencaoId || equipamentoId);

      if (!fichaId && !hasPairParam) {
        setLoadError('Abra a ficha a partir de uma manutenção e um disjuntor selecionados.');
        return;
      }

      if (hasPairParam && (!manutencaoId || !equipamentoId)) {
        setLoadError('Informe manutenção e disjuntor juntos para abrir a ficha.');
        return;
      }

      const invalidIds = [
        fichaId && ['fichaId', fichaId],
        manutencaoId && ['manutencaoId', manutencaoId],
        equipamentoId && ['equipamentoId', equipamentoId],
      ].filter((entry): entry is [string, string] => Boolean(entry))
        .filter(([, value]) => !isValidFichaDisjuntorId(value));

      if (invalidIds.length > 0) {
        setLoadError(`Identificador inválido: ${invalidIds[0][0]}.`);
        return;
      }

      setLoadingFicha(true);

      try {
        const client = createSupabaseManutencaoPreventivaClient(supabase);
        const persisted = fichaId
          ? await getFichaDisjuntorById(client, fichaId)
          : await getFichaDisjuntor(client, manutencaoId, equipamentoId);

        if (cancelled) return;

        if (!persisted) {
          if (fichaId) {
            setLoadError('Ficha do disjuntor não encontrada.');
            return;
          }

          setContextIds({ manutencaoId, equipamentoId });
          return;
        }

        if (
          hasPairParam
          && (
            persisted.manutencao_id !== manutencaoId
            || persisted.equipamento_id !== equipamentoId
          )
        ) {
          setLoadError('Os IDs da URL não correspondem à ficha persistida.');
          return;
        }

        setFichaId(persisted.id);
        setContextIds({
          manutencaoId: persisted.manutencao_id,
          equipamentoId: persisted.equipamento_id,
          fichaId: persisted.id,
        });
        setSnapshot(normalizeFichaDisjuntorSnapshot(persisted.dados_ficha));
        setFormVersion((version) => version + 1);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a ficha do disjuntor.');
        }
      } finally {
        if (!cancelled) {
          setLoadingFicha(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const buildSnapshot = (): FichaDisjuntorSnapshot | null => {
    if (!formRef.current) return null;

    const entries = Object.entries(Object.fromEntries(new FormData(formRef.current).entries()));
    const data = Object.fromEntries(
      entries
        .filter(([key]) => !key.startsWith('status-'))
        .map(([key, value]) => [key, String(value)])
    );
    const inspectionStatus = Object.fromEntries(
      entries
        .filter(([key]) => key.startsWith('status-'))
        .map(([key, value]) => [key.replace(/^status-/, ''), String(value) as InspectionStatus])
    );

    return { data, inspectionStatus };
  };

  const handleSave = async (navigateToPreview: boolean) => {
    if (savingFichaRef.current) return;

    if (!contextIds) {
      toast.error('Abra a ficha a partir da Manutenção Preventiva para salvar.');
      return;
    }

    const snapshot = buildSnapshot();
    if (!snapshot) return;

    savingFichaRef.current = true;
    setSavingFicha(true);
    try {
      const client = createSupabaseManutencaoPreventivaClient(supabase);
      const saved = await saveFichaDisjuntor(client, {
        manutencao_id: contextIds.manutencaoId,
        equipamento_id: contextIds.equipamentoId,
        dados_ficha: fichaDisjuntorSnapshotToJson(snapshot),
      });

      setFichaId(saved.id);
      setContextIds({
        manutencaoId: saved.manutencao_id,
        equipamentoId: saved.equipamento_id,
        fichaId: saved.id,
      });
      toast.success('Ficha do disjuntor salva.');

      if (navigateToPreview) {
        router.push(`/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-disjuntor/visualizar?${buildFichaDisjuntorSearchParams({
          manutencaoId: contextIds.manutencaoId,
          equipamentoId: contextIds.equipamentoId,
          fichaId: saved.id,
        })}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a ficha do disjuntor.');
    } finally {
      savingFichaRef.current = false;
      setSavingFicha(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link href="/relatorios-tecnicos/cabine-primaria/manutencao-preventiva" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
            <ArrowLeft size={16} />
            Voltar à Manutenção Preventiva
          </Link>
          <div className="mt-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Ficha de Disjuntor 15 kV</h1>
            <p className="text-gray-500 mt-1">Registro mínimo persistido para inspeção e manutenção preventiva do disjuntor.</p>
            <p className="text-xs text-gray-500 mt-2 break-all">
              {contextIds
                ? `manutencao_id: ${contextIds.manutencaoId} | equipamento_id: ${contextIds.equipamentoId}${fichaId ? ` | ficha_id: ${fichaId}` : ''}`
                : 'Selecione uma manutenção e um disjuntor antes de salvar.'}
            </p>
          </div>
        </div>

        {loadingFicha && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Carregando ficha persistida...
          </div>
        )}

        <form ref={formRef} key={formVersion} className="space-y-5">
          <section className={sectionClass}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Identificação</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {identificationFields.map(([key, label]) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input name={key} defaultValue={snapshot.data[key]} className={inputClass} />
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Inspeção e manutenção</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {inspectionItems.map(([key, label]) => {
                const value = snapshot.inspectionStatus[key] ?? 'C';

                return (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">{label}</span>
                    <select name={`status-${key}`} defaultValue={value} className={`rounded-md border p-1.5 text-sm font-semibold ${statusClass[value]}`}>
                      <option value="C">C</option>
                      <option value="N/C">N/C</option>
                      <option value="N/A">N/A</option>
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-3">C: Conforme | N/C: Não conforme | N/A: Não se aplica</p>
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Ensaios e medições</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {measurementFields.map(([key, label]) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input name={key} defaultValue={snapshot.data[key]} className={inputClass} />
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Conclusão</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {conclusionFields.map(([key, label]) => (
                <div key={key} className={key === 'observacoes' ? 'md:col-span-2' : ''}>
                  <label className={labelClass}>{label}</label>
                  <textarea name={key} defaultValue={snapshot.data[key]} className={`${inputClass} min-h-24`} />
                </div>
              ))}
            </div>
          </section>

          <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <button type="button" onClick={() => handleSave(false)} disabled={savingFicha || !contextIds} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
              <Save size={17} />
              Salvar ficha
            </button>
            <button type="button" onClick={() => handleSave(true)} disabled={savingFicha || !contextIds} className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
              <Eye size={17} />
              Salvar e visualizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
