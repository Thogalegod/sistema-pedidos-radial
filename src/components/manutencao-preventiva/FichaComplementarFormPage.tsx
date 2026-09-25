'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Plus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  buildFichaComplementarSearchParams,
  calculateAterramentoMeasurementSummary,
  fichaComplementarSnapshotToJson,
  isValidFichaComplementarId,
  normalizeFichaComplementarSnapshot,
  type AterramentoMeasurement,
  type FichaComplementarDefinition,
  type FichaComplementarSnapshot,
  type InspectionStatus,
} from '@/lib/manutencao-preventiva/fichas-complementares';
import {
  createSupabaseManutencaoPreventivaClient,
  getFichaComplementar,
  getFichaComplementarById,
  saveFichaComplementar,
  validateFichaComplementarIds,
} from '@/lib/manutencao-preventiva/queries-mutations';

type FichaContextIds = {
  manutencaoId: string;
  equipamentoId: string;
  fichaId?: string;
};

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const sectionClass = 'bg-white border border-gray-200 rounded-lg shadow-sm p-5';
const statusClass: Record<InspectionStatus, string> = {
  C: 'bg-green-100 text-green-700 border-green-300 focus:border-green-500 focus:ring-green-500',
  'N/A': 'bg-yellow-100 text-yellow-800 border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500',
  'N/C': 'bg-red-100 text-red-700 border-red-300 focus:border-red-500 focus:ring-red-500',
};

function newMeasurement(): AterramentoMeasurement {
  return {
    id: `measurement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ponto: '',
    valorOhms: '',
    resultado: '',
    observacao: '',
  };
}

export function FichaComplementarFormPage({
  definition,
}: {
  definition: FichaComplementarDefinition;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const savingFichaRef = useRef(false);
  const [contextIds, setContextIds] = useState<FichaContextIds | null>(null);
  const [fichaId, setFichaId] = useState('');
  const [snapshot, setSnapshot] = useState<FichaComplementarSnapshot>({ data: {}, inspectionStatus: {}, measurements: [] });
  const [measurements, setMeasurements] = useState<AterramentoMeasurement[]>([]);
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

    const validateContext = async (client: ReturnType<typeof createSupabaseManutencaoPreventivaClient>, manutencaoId: string, equipamentoId: string) => {
      const valid = await validateFichaComplementarIds(client, definition.tipo, manutencaoId, equipamentoId);
      if (!valid) {
        setLoadError('Manutenção e equipamento não pertencem à mesma cabine ou o tipo do equipamento não corresponde à ficha.');
      }
      return valid;
    };

    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      const requestedFichaId = params.get('fichaId') ?? '';
      const manutencaoId = params.get('manutencaoId') ?? '';
      const equipamentoId = params.get('equipamentoId') ?? '';
      const hasPairParam = Boolean(manutencaoId || equipamentoId);

      if (!requestedFichaId && !hasPairParam) {
        setLoadError(`Abra a ficha a partir de uma manutenção e um equipamento do tipo ${definition.equipmentLabel}.`);
        return;
      }

      if (hasPairParam && (!manutencaoId || !equipamentoId)) {
        setLoadError('Informe manutenção e equipamento juntos para abrir a ficha.');
        return;
      }

      const invalidIds = [
        requestedFichaId && ['fichaId', requestedFichaId],
        manutencaoId && ['manutencaoId', manutencaoId],
        equipamentoId && ['equipamentoId', equipamentoId],
      ].filter((entry): entry is [string, string] => Boolean(entry))
        .filter(([, value]) => !isValidFichaComplementarId(value));

      if (invalidIds.length > 0) {
        setLoadError(`Identificador inválido: ${invalidIds[0][0]}.`);
        return;
      }

      setLoadingFicha(true);

      try {
        const client = createSupabaseManutencaoPreventivaClient(supabase);
        const persisted = requestedFichaId
          ? await getFichaComplementarById(client, definition.tableName, requestedFichaId)
          : await getFichaComplementar(client, definition.tableName, manutencaoId, equipamentoId);

        if (cancelled) return;

        if (!persisted) {
          if (requestedFichaId) {
            setLoadError('Ficha não encontrada.');
            return;
          }

          if (!(await validateContext(client, manutencaoId, equipamentoId)) || cancelled) return;
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

        if (!(await validateContext(client, persisted.manutencao_id, persisted.equipamento_id)) || cancelled) return;

        const normalized = normalizeFichaComplementarSnapshot(persisted.dados_ficha);
        setFichaId(persisted.id);
        setContextIds({
          manutencaoId: persisted.manutencao_id,
          equipamentoId: persisted.equipamento_id,
          fichaId: persisted.id,
        });
        setSnapshot(normalized);
        setMeasurements(normalized.measurements);
        setFormVersion((version) => version + 1);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a ficha.');
        }
      } finally {
        if (!cancelled) setLoadingFicha(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [definition]);

  const summary = calculateAterramentoMeasurementSummary(measurements);

  const buildSnapshot = (): FichaComplementarSnapshot | null => {
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

    if (definition.hasGroundingMeasurements) {
      data.menorValorMedido = summary.menorValorMedido;
      data.maiorValorMedido = summary.maiorValorMedido;
      data.valorMedio = summary.valorMedio;
    }

    return {
      data,
      inspectionStatus,
      measurements: definition.hasGroundingMeasurements ? measurements : [],
    };
  };

  const handleSave = async (navigateToPreview: boolean) => {
    if (savingFichaRef.current) return;

    if (!contextIds) {
      toast.error('Abra a ficha a partir da Manutenção Preventiva para salvar.');
      return;
    }

    const currentSnapshot = buildSnapshot();
    if (!currentSnapshot) return;

    savingFichaRef.current = true;
    setSavingFicha(true);
    try {
      const client = createSupabaseManutencaoPreventivaClient(supabase);
      const saved = await saveFichaComplementar(client, definition.tableName, {
        manutencao_id: contextIds.manutencaoId,
        equipamento_id: contextIds.equipamentoId,
        dados_ficha: fichaComplementarSnapshotToJson(currentSnapshot),
      });

      setFichaId(saved.id);
      setContextIds({
        manutencaoId: saved.manutencao_id,
        equipamentoId: saved.equipamento_id,
        fichaId: saved.id,
      });
      toast.success('Ficha salva.');

      if (navigateToPreview) {
        router.push(`/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/${definition.routeSegment}/visualizar?${buildFichaComplementarSearchParams({
          manutencaoId: contextIds.manutencaoId,
          equipamentoId: contextIds.equipamentoId,
          fichaId: saved.id,
        })}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a ficha.');
    } finally {
      savingFichaRef.current = false;
      setSavingFicha(false);
    }
  };

  const updateMeasurement = (id: string, patch: Partial<AterramentoMeasurement>) => {
    setMeasurements((current) => current.map((measurement) => (
      measurement.id === id ? { ...measurement, ...patch } : measurement
    )));
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
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{definition.title}</h1>
            <p className="text-gray-500 mt-1">Campos técnicos opcionais e persistência por manutenção e equipamento.</p>
            <p className="text-xs text-gray-500 mt-2 break-all">
              {contextIds
                ? `manutencao_id: ${contextIds.manutencaoId} | equipamento_id: ${contextIds.equipamentoId}${fichaId ? ` | ficha_id: ${fichaId}` : ''}`
                : 'Selecione manutenção e equipamento antes de salvar.'}
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
              {definition.identificationFields.map((field) => (
                <div key={field.key}>
                  <label className={labelClass}>{field.label}</label>
                  <input name={field.key} defaultValue={snapshot.data[field.key]} className={inputClass} />
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Inspeção e manutenção</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {definition.inspectionItems.map((field) => {
                const value = snapshot.inspectionStatus[field.key] ?? 'C';

                return (
                  <div key={field.key} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                    <span className="text-sm text-gray-700">{field.label}</span>
                    <select name={`status-${field.key}`} defaultValue={value} className={`rounded-md border p-1.5 text-sm font-semibold ${statusClass[value]}`}>
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
              {definition.measurementFields
                .filter((field) => !['menorValorMedido', 'maiorValorMedido', 'valorMedio'].includes(field.key))
                .map((field) => (
                  <div key={field.key}>
                    <label className={labelClass}>{field.label}</label>
                    <input name={field.key} defaultValue={snapshot.data[field.key]} className={inputClass} />
                  </div>
                ))}
            </div>

            {definition.hasGroundingMeasurements && (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-bold text-gray-900">Medições por ponto</h3>
                  <button type="button" onClick={() => setMeasurements((current) => [...current, newMeasurement()])} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    <Plus size={16} />
                    Adicionar ponto
                  </button>
                </div>
                <div className="space-y-3">
                  {measurements.map((measurement) => (
                    <div key={measurement.id} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-[1fr_150px_1fr_1fr_auto]">
                      <input value={measurement.ponto} onChange={(event) => updateMeasurement(measurement.id, { ponto: event.target.value })} placeholder="Identificação do ponto" className={inputClass} />
                      <input value={measurement.valorOhms} onChange={(event) => updateMeasurement(measurement.id, { valorOhms: event.target.value })} placeholder="Valor em ohms" className={inputClass} />
                      <input value={measurement.resultado} onChange={(event) => updateMeasurement(measurement.id, { resultado: event.target.value })} placeholder="Condição ou resultado" className={inputClass} />
                      <input value={measurement.observacao} onChange={(event) => updateMeasurement(measurement.id, { observacao: event.target.value })} placeholder="Observação" className={inputClass} />
                      <button type="button" onClick={() => setMeasurements((current) => current.filter((item) => item.id !== measurement.id))} className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-gray-600 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div><label className={labelClass}>Menor valor medido</label><input value={summary.menorValorMedido} readOnly className={inputClass} /></div>
                  <div><label className={labelClass}>Maior valor medido</label><input value={summary.maiorValorMedido} readOnly className={inputClass} /></div>
                  <div><label className={labelClass}>Valor médio</label><input value={summary.valorMedio} readOnly className={inputClass} /></div>
                </div>
              </div>
            )}
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Conclusão</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {definition.conclusionFields.map((field) => (
                <div key={field.key} className={field.key === 'observacoes' ? 'md:col-span-2' : ''}>
                  <label className={labelClass}>{field.label}</label>
                  <textarea name={field.key} defaultValue={snapshot.data[field.key]} className={`${inputClass} min-h-24`} />
                </div>
              ))}
            </div>
          </section>

          <div className="sticky bottom-3 z-10 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
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
