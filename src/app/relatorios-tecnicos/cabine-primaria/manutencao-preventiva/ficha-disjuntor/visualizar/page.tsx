'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  buildFichaDisjuntorSearchParams,
  emptyFichaDisjuntorSnapshot,
  isValidFichaDisjuntorId,
  normalizeFichaDisjuntorSnapshot,
  type FichaDisjuntorSnapshot,
  type InspectionStatus,
} from '@/lib/manutencao-preventiva/ficha-disjuntor';
import {
  createSupabaseManutencaoPreventivaClient,
  getFichaDisjuntor,
  getFichaDisjuntorById,
} from '@/lib/manutencao-preventiva/queries-mutations';

const reportStatusClass: Record<InspectionStatus, string> = {
  C: 'bg-green-100 text-green-800',
  'N/A': 'bg-yellow-100 text-yellow-800',
  'N/C': 'bg-red-100 text-red-800',
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="bg-blue-700 text-white px-2 py-1 text-sm font-black mt-4 mb-2">{children}</h2>;
}

function FieldGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 text-[11px] border-l border-t border-black">
      {rows.map(([label, value]) => (
        <div key={label} className="border-r border-b border-black p-1.5">
          <span className="font-bold">{label}: </span>{value || '-'}
        </div>
      ))}
    </div>
  );
}

export default function FichaDisjuntorVisualizarPage() {
  const [snapshot, setSnapshot] = useState<FichaDisjuntorSnapshot>(emptyFichaDisjuntorSnapshot);
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
        setLoadError('Informe manutenção e disjuntor juntos para visualizar a ficha.');
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

      try {
        const client = createSupabaseManutencaoPreventivaClient(supabase);
        const persisted = fichaId
          ? await getFichaDisjuntorById(client, fichaId)
          : await getFichaDisjuntor(client, manutencaoId, equipamentoId);

        if (cancelled) return;

        if (!persisted) {
          setLoadError('Ficha do disjuntor não encontrada.');
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

        setSnapshot(normalizeFichaDisjuntorSnapshot(persisted.dados_ficha));
        setContextIds({
          manutencaoId: persisted.manutencao_id,
          equipamentoId: persisted.equipamento_id,
          fichaId: persisted.id,
        });
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Não foi possível carregar a ficha do disjuntor.';
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const d = snapshot.data;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <style jsx global>{`
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
        <Link href={contextIds ? `/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-disjuntor?${buildFichaDisjuntorSearchParams(contextIds)}` : '/relatorios-tecnicos/cabine-primaria/manutencao-preventiva'} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
          <ArrowLeft size={16} />
          Voltar ao preenchimento
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
          <Printer size={17} />
          Imprimir
        </button>
      </div>

      {(loading || error) && (
        <div className="no-print max-w-5xl mx-auto mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {loading ? 'Carregando ficha persistida...' : error}
        </div>
      )}

      <section className="report-page bg-white text-black mx-auto shadow-sm print:shadow-none">
        <div className="grid grid-cols-[1.1fr_2fr_1fr] border border-black text-[11px] leading-tight">
          <div className="p-2 border-r border-black font-black text-blue-700 text-base flex items-center">RADIAL ENERGIA</div>
          <div className="p-2 border-r border-black text-center">
            <div className="font-black text-base">FICHA DE MANUTENÇÃO</div>
            <div>DISJUNTOR 15 kV</div>
          </div>
          <div className="p-2">
            <div><b>Rev.:</b> 00</div>
            <div><b>Página:</b> 1</div>
          </div>
        </div>

        <div className="p-5">
          <div className="text-center my-10">
            <div className="text-3xl font-black mb-3">FICHA DE DISJUNTOR 15 kV</div>
            <div className="text-sm">
              <div><b>TAG:</b> {d.tag || '-'}</div>
              <div><b>Fabricante:</b> {d.fabricante || '-'}</div>
              <div><b>Nº Série:</b> {d.serie || '-'}</div>
            </div>
          </div>

          <SectionTitle>1. Identificação</SectionTitle>
          <FieldGrid rows={identificationFields.map(([, label], index) => [
            label,
            d[identificationFields[index][0]],
          ])} />

          <SectionTitle>2. Inspeção e manutenção</SectionTitle>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {inspectionItems.map(([key, label]) => {
              const status = snapshot.inspectionStatus[key] ?? 'C';

              return (
                <div key={key} className="flex items-center justify-between border border-black p-1.5">
                  <span className="font-bold">{label}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-black ${reportStatusClass[status]}`}>{status}</span>
                </div>
              );
            })}
          </div>

          <SectionTitle>3. Ensaios e medições</SectionTitle>
          <FieldGrid rows={measurementFields.map(([, label], index) => [
            label,
            d[measurementFields[index][0]],
          ])} />

          <SectionTitle>4. Conclusão</SectionTitle>
          <div className="space-y-2 text-[11px]">
            {conclusionFields.map(([key, label]) => (
              <div key={key} className="border border-black p-2">
                <div className="font-bold">{label}</div>
                <div className="whitespace-pre-wrap">{d[key] || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
