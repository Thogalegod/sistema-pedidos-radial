'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  buildFichaComplementarSearchParams,
  emptyFichaComplementarSnapshot,
  isValidFichaComplementarId,
  normalizeFichaComplementarSnapshot,
  type FieldDefinition,
  type FichaComplementarDefinition,
  type FichaComplementarSnapshot,
  type InspectionStatus,
} from '@/lib/manutencao-preventiva/fichas-complementares';
import {
  createSupabaseManutencaoPreventivaClient,
  getFichaComplementar,
  getFichaComplementarById,
  validateFichaComplementarIds,
} from '@/lib/manutencao-preventiva/queries-mutations';

const reportStatusClass: Record<InspectionStatus, string> = {
  C: 'bg-green-100 text-green-800',
  'N/A': 'bg-yellow-100 text-yellow-800',
  'N/C': 'bg-red-100 text-red-800',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="bg-blue-700 text-white px-2 py-1 text-sm font-black mt-4 mb-2">{children}</h2>;
}

function FieldGrid({
  fields,
  data,
}: {
  fields: FieldDefinition[];
  data: Record<string, string>;
}) {
  const rows = fields
    .map((field) => [field.label, data[field.key]] as const)
    .filter(([, value]) => value?.trim());

  if (!rows.length) {
    return <div className="border border-black p-2 text-[11px]">Nenhum campo preenchido.</div>;
  }

  return (
    <div className="grid grid-cols-2 text-[11px] border-l border-t border-black">
      {rows.map(([label, value]) => (
        <div key={label} className="border-r border-b border-black p-1.5">
          <span className="font-bold">{label}: </span>{value}
        </div>
      ))}
    </div>
  );
}

export function FichaComplementarVisualizarPage({
  definition,
}: {
  definition: FichaComplementarDefinition;
}) {
  const [snapshot, setSnapshot] = useState<FichaComplementarSnapshot>(emptyFichaComplementarSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextIds, setContextIds] = useState<{ manutencaoId: string; equipamentoId: string; fichaId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const setLoadError = (message: string) => {
      setContextIds(null);
      setError(message);
      setLoading(false);
      toast.error(message);
    };

    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      const fichaId = params.get('fichaId') ?? '';
      const manutencaoId = params.get('manutencaoId') ?? '';
      const equipamentoId = params.get('equipamentoId') ?? '';
      const hasPairParam = Boolean(manutencaoId || equipamentoId);

      if (!fichaId && !hasPairParam) {
        setLoadError('Ficha não informada para visualização.');
        return;
      }

      if (hasPairParam && (!manutencaoId || !equipamentoId)) {
        setLoadError('Informe manutenção e equipamento juntos para visualizar a ficha.');
        return;
      }

      const invalidIds = [
        fichaId && ['fichaId', fichaId],
        manutencaoId && ['manutencaoId', manutencaoId],
        equipamentoId && ['equipamentoId', equipamentoId],
      ].filter((entry): entry is [string, string] => Boolean(entry))
        .filter(([, value]) => !isValidFichaComplementarId(value));

      if (invalidIds.length > 0) {
        setLoadError(`Identificador inválido: ${invalidIds[0][0]}.`);
        return;
      }

      try {
        const client = createSupabaseManutencaoPreventivaClient(supabase);
        const persisted = fichaId
          ? await getFichaComplementarById(client, definition.tableName, fichaId)
          : await getFichaComplementar(client, definition.tableName, manutencaoId, equipamentoId);

        if (cancelled) return;

        if (!persisted) {
          setLoadError('Ficha não encontrada.');
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

        const valid = await validateFichaComplementarIds(client, definition.tipo, persisted.manutencao_id, persisted.equipamento_id);
        if (!valid || cancelled) {
          setLoadError('Manutenção e equipamento não pertencem à mesma cabine ou o tipo do equipamento não corresponde à ficha.');
          return;
        }

        setSnapshot(normalizeFichaComplementarSnapshot(persisted.dados_ficha));
        setContextIds({
          manutencaoId: persisted.manutencao_id,
          equipamentoId: persisted.equipamento_id,
          fichaId: persisted.id,
        });
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Não foi possível carregar a ficha.';
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [definition]);

  const statusRows = definition.inspectionItems.filter((field) => snapshot.inspectionStatus[field.key]);
  const canShowReport = !loading && !error;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <style>{`
        .report-page {
          width: 210mm;
          min-height: 297mm;
          padding: 10mm;
        }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .report-page {
            width: auto;
            min-height: 277mm;
            margin: 0;
            box-shadow: none;
          }
        }
      `}</style>

      <div className="no-print max-w-5xl mx-auto mb-4 flex items-center justify-between">
        <Link href={contextIds ? `/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/${definition.routeSegment}?${buildFichaComplementarSearchParams(contextIds)}` : '/relatorios-tecnicos/cabine-primaria/manutencao-preventiva'} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
          <ArrowLeft size={16} />
          Voltar ao preenchimento
        </Link>
        <button onClick={() => window.print()} disabled={!canShowReport} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
          <Printer size={17} />
          Imprimir
        </button>
      </div>

      {(loading || error) && (
        <div className="no-print max-w-5xl mx-auto mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {loading ? 'Carregando ficha persistida...' : error}
        </div>
      )}

      {canShowReport && (
      <section className="report-page bg-white text-black mx-auto shadow-sm print:shadow-none">
        <div className="grid grid-cols-[1.1fr_2fr_1fr] border border-black text-[11px] leading-tight">
          <div className="p-2 border-r border-black font-black text-blue-700 text-base flex items-center">RADIAL ENERGIA</div>
          <div className="p-2 border-r border-black text-center">
            <div className="font-black text-base">FICHA DE MANUTENÇÃO</div>
            <div>{definition.equipmentLabel.toUpperCase()}</div>
          </div>
          <div className="p-2">
            <div><b>Rev.:</b> 00</div>
            <div><b>Página:</b> 1</div>
          </div>
        </div>

        <div className="p-5">
          <div className="text-center my-10">
            <div className="text-3xl font-black mb-3">{definition.title.toUpperCase()}</div>
            <div className="text-sm">
              <div><b>Identificação:</b> {snapshot.data.tag || '-'}</div>
              <div><b>Fabricante:</b> {snapshot.data.fabricante || '-'}</div>
            </div>
          </div>

          <SectionTitle>1. Identificação</SectionTitle>
          <FieldGrid fields={definition.identificationFields} data={snapshot.data} />

          <SectionTitle>2. Inspeção e manutenção</SectionTitle>
          {statusRows.length ? (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {statusRows.map((field) => {
                const status = snapshot.inspectionStatus[field.key];

                return (
                  <div key={field.key} className="flex items-center justify-between border border-black p-1.5">
                    <span className="font-bold">{field.label}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-black ${reportStatusClass[status]}`}>{status}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-black p-2 text-[11px]">Nenhum item preenchido.</div>
          )}

          {definition.hasGroundingMeasurements && snapshot.measurements.length > 0 && (
            <>
              <SectionTitle>3. Medições por ponto</SectionTitle>
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr] text-[11px] border-l border-t border-black">
                {['Ponto', 'Valor em ohms', 'Condição / resultado', 'Observação'].map((label) => (
                  <div key={label} className="border-r border-b border-black p-1.5 font-bold">{label}</div>
                ))}
                {snapshot.measurements.map((measurement) => (
                  <div key={measurement.id} className="contents">
                    <div className="border-r border-b border-black p-1.5">{measurement.ponto || '-'}</div>
                    <div className="border-r border-b border-black p-1.5">{measurement.valorOhms || '-'}</div>
                    <div className="border-r border-b border-black p-1.5">{measurement.resultado || '-'}</div>
                    <div className="border-r border-b border-black p-1.5">{measurement.observacao || '-'}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <SectionTitle>{definition.hasGroundingMeasurements ? '4' : '3'}. Ensaios e medições</SectionTitle>
          <FieldGrid fields={definition.measurementFields} data={snapshot.data} />

          <SectionTitle>{definition.hasGroundingMeasurements ? '5' : '4'}. Conclusão</SectionTitle>
          <div className="space-y-2 text-[11px]">
            {definition.conclusionFields
              .filter((field) => snapshot.data[field.key]?.trim())
              .map((field) => (
                <div key={field.key} className="border border-black p-2">
                  <div className="font-bold">{field.label}</div>
                  <div className="whitespace-pre-wrap">{snapshot.data[field.key]}</div>
                </div>
              ))}
            {!definition.conclusionFields.some((field) => snapshot.data[field.key]?.trim()) && (
              <div className="border border-black p-2">Nenhum campo preenchido.</div>
            )}
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
