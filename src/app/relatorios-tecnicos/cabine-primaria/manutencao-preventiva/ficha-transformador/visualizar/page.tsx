'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type InspectionStatus = 'C' | 'N/C' | 'N/A';

type Snapshot = {
  data: Record<string, string>;
  photos: { placa?: string; equipamento?: string };
  selectedTaps: string[];
  visualItems: string[];
  visualStatus: Record<string, InspectionStatus>;
  insulationRows: Array<{ id: string; position: string; voltage: string; current: string }>;
  occurrences: Array<{ id: string; priority: string; text: string; source?: string }>;
  coolingType: string;
  ttrConnections: string[];
  windingRows: Array<{ winding: string; connection: string }>;
  oilRows: Array<{ test: string; method: string; specified: string; result: string }>;
};

const reportIndex = [
  ['1', 'Informações gerais'],
  ['2', 'Registro fotográfico'],
  ['3', 'Inspeção visual / mecânica / elétrica'],
  ['4', 'Resistência de isolamento'],
  ['5', 'Relação de transformação'],
  ['6', 'Resistência elétrica dos enrolamentos'],
  ['7', 'Análise físico-química do óleo isolante'],
  ['8', 'Ocorrências e recomendações'],
];

const reportStatusClass: Record<InspectionStatus, string> = {
  C: 'bg-green-100 text-green-800',
  'N/A': 'bg-yellow-100 text-yellow-800',
  'N/C': 'bg-red-100 text-red-800',
};

const priorityStyles: Record<string, string> = {
  Baixa: 'bg-sky-100 text-sky-700 border-sky-200',
  Média: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Alta: 'bg-orange-100 text-orange-800 border-orange-200',
  Crítica: 'bg-red-100 text-red-700 border-red-200',
};

const emptySnapshot: Snapshot = {
  data: {},
  photos: {},
  selectedTaps: [],
  visualItems: [],
  visualStatus: {},
  insulationRows: [],
  occurrences: [],
  coolingType: 'Óleo isolante',
  ttrConnections: [],
  windingRows: [],
  oilRows: [],
};

function PageHeader({ page }: { page: string }) {
  return (
    <div className="grid grid-cols-[1.1fr_2fr_1fr] border border-black text-[11px] leading-tight">
      <div className="p-2 border-r border-black font-black text-blue-700 text-base flex items-center">RADIAL ENERGIA</div>
      <div className="p-2 border-r border-black text-center">
        <div className="font-black text-base">FICHA DE ENSAIO</div>
        <div>TRANSFORMADOR DE FORÇA</div>
      </div>
      <div className="p-2">
        <div><b>Rev.:</b> 00</div>
        <div><b>Página:</b> {page}</div>
      </div>
    </div>
  );
}

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

function ReportPage({ children, page }: { children: React.ReactNode; page: string }) {
  return (
    <section className="report-page bg-white text-black mx-auto mb-6 shadow-sm print:shadow-none">
      <PageHeader page={page} />
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function FichaTransformadorVisualizarPage() {
  const [snapshot] = useState<Snapshot>(() => {
    if (typeof window === 'undefined') return emptySnapshot;
    const raw = window.localStorage.getItem('radial:ficha-transformador-preview');
    return raw ? JSON.parse(raw) as Snapshot : emptySnapshot;
  });

  const meggerChartData = useMemo(() => snapshot.insulationRows.map((row) => ({
    name: row.position.replace('Massa', 'M'),
    atual: Number((snapshot.data[`megger-${row.id}`] || '').replace(/\./g, '').replace(',', '.')) || 0,
  })), [snapshot]);

  const windingChartData = useMemo(() => snapshot.windingRows.map((row) => ({
    name: row.winding,
    atual: Number((snapshot.data[`enrolamento-${row.winding}`] || '').replace(/\./g, '').replace(',', '.')) || 0,
  })), [snapshot]);

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
            page-break-after: always;
          }
        }
      `}</style>

      <div className="no-print max-w-5xl mx-auto mb-4 flex items-center justify-between">
        <Link href="/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-transformador" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
          <ArrowLeft size={16} />
          Voltar ao preenchimento
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
          <Printer size={17} />
          Imprimir / PDF
        </button>
      </div>

      <ReportPage page="1">
        <div className="h-[220mm] flex flex-col justify-between">
          <div>
            <div className="text-center mt-16">
              <div className="text-3xl font-black mb-3">FICHA DE ENSAIO</div>
              <div className="text-xl font-bold">TRANSFORMADOR DE FORÇA</div>
              <div className="mt-8 text-sm">
                <div><b>TAG:</b> {d.tag || '-'}</div>
                <div><b>Potência:</b> {d.potencia || '-'} kVA</div>
                <div><b>Nº Série:</b> {d.serie || '-'}</div>
              </div>
            </div>
            <div className="mt-16 border border-black">
              <div className="bg-gray-100 border-b border-black p-2 text-sm font-bold">Índice da ficha</div>
              <div className="p-3 text-sm space-y-1">
                {reportIndex.map(([n, title]) => (
                  <div key={n} className="flex justify-between border-b border-dotted border-gray-400">
                    <span>{n}. {title}</span>
                    <span>{Number(n) + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs">
            <div><b>Equipamento:</b> Transformador de força</div>
            <div><b>Refrigeração:</b> {d.refrigeracao || snapshot.coolingType}</div>
          </div>
        </div>
      </ReportPage>

      <ReportPage page="2">
        <SectionTitle>1. Informações gerais</SectionTitle>
        <FieldGrid rows={[
          ['Equipamento', 'Transformador de força'],
          ['TAG', d.tag],
          ['Potência [kVA]', d.potencia],
          ['Nº Série', d.serie],
          ['A.T. [kV]', `${snapshot.selectedTaps.join(' / ')} kV`],
          ['B.T. [V]', d.bt],
          ['Classe de isolação [kV]', d.classeIsolacao],
          ['Tap de despacho [kV]', d.tapDespacho],
          ['Fabricação', d.fabricacao],
          ['Fabricante', d.fabricante],
          ['Volume [L]', d.volume],
          ['Peso [kg]', d.peso],
          ['Refrigeração', d.refrigeracao || snapshot.coolingType],
        ]} />

        <SectionTitle>2. Registro fotográfico</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-black h-64 flex items-center justify-center overflow-hidden">
            {snapshot.photos.placa ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshot.photos.placa} alt="Placa de identificação" className="w-full h-full object-cover" />
            ) : <span className="text-xs text-gray-500">Foto da placa de identificação</span>}
          </div>
          <div className="border border-black h-64 flex items-center justify-center overflow-hidden">
            {snapshot.photos.equipamento ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshot.photos.equipamento} alt="Transformador" className="w-full h-full object-cover" />
            ) : <span className="text-xs text-gray-500">Foto do equipamento</span>}
          </div>
        </div>

        <SectionTitle>3. Inspeção visual / mecânica / elétrica</SectionTitle>
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          {snapshot.visualItems.map((item) => (
            <div key={item} className="flex items-center justify-between border border-black p-1.5">
              <span>{item}</span>
              <span className={`px-2 py-0.5 font-bold ${reportStatusClass[snapshot.visualStatus[item] || 'C']}`}>
                {snapshot.visualStatus[item] || 'C'}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[10px] mt-2">C: Conforme | N/C: Não conforme | N/A: Não se aplica</div>
      </ReportPage>

      <ReportPage page="3">
        <SectionTitle>4. Resistência de isolamento</SectionTitle>
        <table className="w-full text-[11px] border border-black">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-1 text-left">Posição</th>
              <th className="border border-black p-1 text-left">Tensão de ensaio</th>
              <th className="border border-black p-1 text-left">Leitura [MΩ]</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.insulationRows.map((row) => (
              <tr key={row.id}>
                <td className="border border-black p-1">{row.position}</td>
                <td className="border border-black p-1">{row.voltage}</td>
                <td className="border border-black p-1">{d[`megger-${row.id}`] || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="h-72 border border-black mt-4 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={meggerChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Legend />
              <Bar dataKey="atual" name="Medição atual [MΩ]" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportPage>

      <ReportPage page="4">
        <SectionTitle>5. Relação de transformação</SectionTitle>
        <table className="w-full text-[10px] border border-black">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-1 text-left">Conexões</th>
              {snapshot.selectedTaps.map((tap) => <th key={tap} className="border border-black p-1 text-left">{tap} kV</th>)}
            </tr>
          </thead>
          <tbody>
            {snapshot.ttrConnections.map((connection) => (
              <tr key={connection}>
                <td className="border border-black p-1 font-medium">{connection}</td>
                {snapshot.selectedTaps.map((tap) => (
                  <td key={`${connection}-${tap}`} className="border border-black p-1">{d[`ttr-${connection}-${tap}`] || '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <SectionTitle>6. Resistência elétrica dos enrolamentos</SectionTitle>
        <table className="w-full text-[11px] border border-black">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-1 text-left">Enrolamento</th>
              <th className="border border-black p-1 text-left">Conexão</th>
              <th className="border border-black p-1 text-left">Leitura</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.windingRows.map((row) => (
              <tr key={row.winding}>
                <td className="border border-black p-1">{row.winding}</td>
                <td className="border border-black p-1">{row.connection}</td>
                <td className="border border-black p-1">{d[`enrolamento-${row.winding}`] || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="h-64 border border-black mt-4 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={windingChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Legend />
              <Bar dataKey="atual" name="Medição atual" fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ReportPage>

      <ReportPage page="5">
        <SectionTitle>7. Análise físico-química do óleo isolante</SectionTitle>
        {snapshot.coolingType === 'Seco' ? (
          <div className="border border-black p-3 text-sm">Não aplicável para transformador seco.</div>
        ) : (
          <table className="w-full text-[10px] border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-1 text-left">Ensaio</th>
                <th className="border border-black p-1 text-left">Método</th>
                <th className="border border-black p-1 text-left">Especificado</th>
                <th className="border border-black p-1 text-left">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.oilRows.map((row) => (
                <tr key={row.test}>
                  <td className="border border-black p-1">{row.test}</td>
                  <td className="border border-black p-1">{row.method}</td>
                  <td className="border border-black p-1">{row.specified}</td>
                  <td className="border border-black p-1">{d[`oleo-${row.test}`] || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <SectionTitle>8. Ocorrências e recomendações</SectionTitle>
        {snapshot.occurrences.length === 0 ? (
          <div className="border border-black p-3 text-sm">Sem ocorrências registradas para este equipamento.</div>
        ) : (
          <div className="space-y-2">
            {snapshot.occurrences.map((occurrence) => (
              <div key={occurrence.id} className="border border-black p-2 text-sm">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${priorityStyles[occurrence.priority]}`}>
                  {occurrence.priority}
                </span>
                <p className="mt-2">{occurrence.text}</p>
              </div>
            ))}
          </div>
        )}
      </ReportPage>
    </div>
  );
}
