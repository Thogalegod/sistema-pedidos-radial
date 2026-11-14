'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, Cell, Tooltip } from 'recharts';
import { getUrlArquivo } from '@/lib/storage';
import { Document, Page, pdfjs } from 'react-pdf';
import { creaBase64 } from '@/lib/creaBase64';
import { CabineTransformerSheet } from '@/components/CabineTransformerSheet';

// Importa os estilos do react-pdf (necessário para não desconfigurar algumas renderizações)
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configura o worker do PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CabinePrintViewer(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [artTipo, setArtTipo] = useState<'pdf' | 'image' | null>(null);
  const [numPagesArt, setNumPagesArt] = useState<number>();

  useEffect(() => {
    let ativo = true;

    if (data?.art_arquivo_url) {
      setArtUrl(null);
      setArtTipo(null);
      setNumPagesArt(undefined);

      getUrlArquivo(data.art_arquivo_url).then(async (url) => {
        if (!ativo) return;
        setArtUrl(url);

        if (!url) return;

        try {
          const response = await fetch(url, { method: 'HEAD' });
          const contentType = response.headers.get('content-type') || '';
          if (!ativo) return;
          setArtTipo(contentType.startsWith('image/') ? 'image' : 'pdf');
        } catch {
          if (ativo) setArtTipo('pdf');
        }
      });
    } else {
      setArtUrl(null);
      setArtTipo(null);
      setNumPagesArt(undefined);
    }

    return () => {
      ativo = false;
    };
  }, [data]);

  useEffect(() => {
    supabase.from('relatorios_cabine')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setData(data);
        } else {
          setData(false);
        }
      });
  }, [params.id]);

  useEffect(() => {
    // Auto-print option could be enabled here after everything loads, 
    // but better to let user click to ensure PDF is loaded.
  }, []);

  useEffect(() => {
    if (!data?.numero_relatorio) return;
    document.title = `Relatório-${data.numero_relatorio}`;
  }, [data?.numero_relatorio]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPagesArt(numPages);
    setArtTipo('pdf');
  }

  if (data === false) return <div className="p-8 text-center text-red-600">Relatório não encontrado.</div>;
  if (!data) return <div className="p-8 text-center">Carregando relatório para impressão...</div>;

  const v = data.valores_calculados;
  const artCarregando = Boolean(artUrl && artTipo !== 'image' && !numPagesArt);

  const Header = ({ fl }: { fl: number }) => (
    <div className="cabecalho w-full border-2 border-blue-900 mb-3 flex text-[10pt]">
      <div className="w-1/4 p-1 flex items-center justify-center border-r-2 border-blue-900">
        <img src="/logo.png" alt="Logo" className="max-h-8 object-contain" />
      </div>
      <div className="w-1/2 p-1 flex items-center justify-center border-r-2 border-blue-900 font-bold text-center">
        RELATÓRIO TÉCNICO
      </div>
      <div className="w-1/4 p-0 text-[10px]" style={{ display: 'grid', gridTemplateRows: '1fr 1fr 1fr', borderLeft: '2px solid #1e3a5f' }}>
        <div style={{ padding: '2px 4px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center' }}>Nº: {data.numero_relatorio}</div>
        <div style={{ padding: '2px 4px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center' }}>Data: {data.data_execucao?.split('-').reverse().join('/')}</div>
        <div style={{ padding: '2px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Rev.: {data.revisao}</span>
          <span>FL.: {fl}/12</span>
        </div>
      </div>
    </div>
  );

  const Footer = () => (
    <div className="mt-8 pt-2 border-t border-gray-300 text-center text-xs text-gray-500 w-full fixed bottom-0 left-0 bg-white print:static print:bg-transparent no-print">
      {data.responsavel_nome} — Engenheiro Eletricista — CREA {data.responsavel_crea}
    </div>
  );

  return (
    <div className="bg-gray-100 min-h-screen pb-10 print:bg-white text-gray-900">
      <style dangerouslySetInnerHTML={{
        __html: `
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 190mm !important;
            background: white !important;
          }
          .page-break { page-break-after: always; break-after: page; }
          .page-break:last-child { page-break-after: avoid; break-after: avoid; }
          .page-container {
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
            box-shadow: none !important;
            width: 190mm !important;
            height: 276mm !important;
            min-height: 276mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          .cover-content {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          body { font-size: 9pt; font-family: Arial, sans-serif; background: white; }
          table { font-size: 8pt; width: 100%; border-collapse: collapse; }
          th { background-color: #1e3a5f !important; color: white !important; padding: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; border: 1px solid #ccc; text-align: left; }
          td { padding: 4px; border: 1px solid #ccc; }
          tr:nth-child(even) td { background-color: #f5f7fa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .cabecalho { position: static; }
          .section-title { color: #1e6db5 !important; font-weight: bold; font-size: 11pt; margin-top: 10px; margin-bottom: 6px; }
          .trafo-sheet table { margin-bottom: 0 !important; font-size: 7.2pt !important; }
          .trafo-sheet th { background-color: #f5f7fa !important; color: #111827 !important; padding: 2px 3px !important; border: 1px solid #ccc !important; text-align: center !important; }
          .trafo-sheet td { padding: 2px 3px !important; border: 1px solid #ccc !important; background-color: transparent !important; }
          .trafo-sheet tr:nth-child(even) td { background-color: transparent !important; }
          .print-only { display: flex !important; }
          @page art { size: A4 portrait; margin: 6mm; }
          .art-page {
            page: art;
            padding: 8mm !important;
            min-height: 0 !important;
            overflow: hidden !important;
            justify-content: flex-start !important;
          }
          .art-pdf-wrapper {
            margin-top: 2mm !important;
            margin-bottom: 0 !important;
          }
          .art-pdf-wrapper .react-pdf__Page,
          .art-pdf-wrapper .react-pdf__Page canvas {
            display: block !important;
            margin: 0 auto !important;
            width: 144mm !important;
            height: auto !important;
            max-width: 100% !important;
          }
        }
        @media screen {
          .print-only { display: none !important; }
        }
        /* Visualização em tela similar à impressão */
        .page-container {
          background: white; max-width: 210mm; margin: 20px auto; padding: 10mm;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative;
          box-sizing: border-box;
        }
        .page-container table { font-size: 9pt; width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .page-container th { background-color: #1e3a5f; color: white; padding: 4px; border: 1px solid #ccc; text-align: left; }
        .page-container td { padding: 4px; border: 1px solid #ccc; }
        .page-container tr:nth-child(even) td { background-color: #f5f7fa; }
        .page-container .trafo-sheet table { margin-bottom: 0; font-size: 7.2pt; }
        .page-container .trafo-sheet th { background-color: #f5f7fa; color: #111827; padding: 2px 3px; border: 1px solid #ccc; text-align: center; }
        .page-container .trafo-sheet td { padding: 2px 3px; border: 1px solid #ccc; background-color: transparent; }
        .page-container .trafo-sheet tr:nth-child(even) td { background-color: transparent; }
        .section-title { color: #1e6db5; font-weight: bold; font-size: 12pt; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
      `}} />

      <div className="text-center p-4 no-print bg-white border-b sticky top-0 z-50 shadow-sm flex justify-between items-center max-w-4xl mx-auto">
        <button onClick={() => router.push('/cabine')} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">← Voltar</button>
        <h2 className="font-bold">Relatório Completo</h2>
        <div>
          <button
            onClick={() => window.print()}
            disabled={artCarregando}
            className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 font-bold disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {artCarregando ? 'Carregando ART...' : '🖨️ Imprimir Agora'}
          </button>
        </div>
      </div>

      {/* PÁGINA 1 — CAPA */}
      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={1} />
        <div className="cover-content flex-1 flex flex-col items-center justify-center text-center">
          <h1 className="text-3xl font-bold text-blue-900 mb-4 tracking-wide">RELATÓRIO TÉCNICO DE ENSAIOS ELÉTRICOS</h1>
          <h2 className="text-xl font-semibold text-gray-700 mb-8">HIPOT CC + MEGGER DO CABO + ATERRAMENTO + TRANSFORMADOR</h2>
          <p className="text-lg text-gray-600">Cabine Primária Blindada - Ramal de Entrada de Média Tensão 15 kV</p>
        </div>
        <Footer />
      </div>

      {/* PÁGINA 2 — QUADRO RESUMO... */}
      <div className="page-container page-break">
        <Header fl={2} />

        <div className="section-title">1. Quadro resumo dos ensaios</div>
        <table>
          <thead>
            <tr>
              <th>Ensaio</th>
              <th>Objeto</th>
              <th>Parâmetro aplicado</th>
              <th>Critério objetivo</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Hipot CC</td>
              <td>Cabo MT + terminações</td>
              <td>35 kV CC / 15 min</td>
              <td>Sem ruptura, sem descarga e corrente estável</td>
              <td className="text-green-700 font-bold">Aprovado</td>
            </tr>
            <tr>
              <td>Megger</td>
              <td>Cabo MT</td>
              <td>10 kV / 15 min</td>
              <td>Valores elevados e coerentes entre fases</td>
              <td className="text-green-700 font-bold">Aprovado</td>
            </tr>
            <tr>
              <td>Aterramento</td>
              <td>Malha/hastes da cabine</td>
              <td>Medição em Ω</td>
              <td>Valor compatível com projeto/concessionária</td>
              <td className="text-green-700 font-bold">Aprovado</td>
            </tr>
            <tr>
              <td>Transformador</td>
              <td>Trafo da cabine</td>
              <td>Relação, isolação, óleo, TTR etc.</td>
              <td>Resultados compatíveis com placa/norma</td>
              <td className="text-green-700 font-bold">Aprovado</td>
            </tr>
          </tbody>
        </table>

        <div className="section-title">2. Dados do circuito de média tensão</div>
        <table>
          <tbody>
            <tr>
              <th className="w-1/4">Origem</th><td className="w-1/4">{data.cabo_de}</td>
              <th className="w-1/4">Isolação</th><td className="w-1/4">{data.cabo_isolacao}</td>
            </tr>
            <tr>
              <th>Destino</th><td>{data.cabo_para}</td>
              <th>Comprimento aprox.</th><td>{data.cabo_comprimento}</td>
            </tr>
            <tr>
              <th>Classe de tensão</th><td>8,7/15 kV</td>
              <th>Tipo de terminal</th><td>{data.cabo_terminais}</td>
            </tr>
            <tr>
              <th>Tensão nominal</th><td>13,8 kV</td>
              <th>Emendas</th><td>{data.cabo_emendas}</td>
            </tr>
            <tr>
              <th>Condutor</th><td>Cobre</td>
              <th>Blindagem</th><td>{data.cabo_blindagem}</td>
            </tr>
            <tr>
              <th>Seção</th><td>{data.cabo_secao}</td>
              <th>Instalação</th><td>{data.cabo_instalacao}</td>
            </tr>
          </tbody>
        </table>

        <div className="section-title">3. Condição climática</div>
        <table>
          <tbody>
            <tr>
              <th>Tempo</th><td>{data.cabo_clima}</td>
              <th>Temperatura</th><td>{data.cabo_temperatura ? `${data.cabo_temperatura} °C` : '-'}</td>
              <th>Umidade</th><td>{data.cabo_umidade ? `${data.cabo_umidade}%` : '-'}</td>
            </tr>
          </tbody>
        </table>

        <div className="section-title">4. Cliente</div>
        <table>
          <tbody>
            <tr><th>Razão Social</th><td>{data.cliente_nome}</td></tr>
            <tr><th>CNPJ</th><td>{data.cliente_cnpj || '-'}</td></tr>
            <tr><th>Endereço</th><td>{data.cliente_endereco}, {data.cliente_cidade} - CEP: {data.cliente_cep}</td></tr>
          </tbody>
        </table>

        <div className="section-title">5. Execução Técnica</div>
        <table>
          <tbody>
            <tr><th>Responsável</th><td>{data.responsavel_nome}</td></tr>
            <tr><th>Título</th><td>Engenheiro Eletricista</td></tr>
            <tr><th>CREA</th><td>{data.responsavel_crea}</td></tr>
            <tr><th>ART Nº</th><td>{data.art_numero || 'Pendente'}</td></tr>
          </tbody>
        </table>

        <Footer />
      </div>

      {/* PÁGINA 3 — HIPOT */}
      <div className="page-container page-break">
        <Header fl={3} />

        <div className="section-title">6. Ensaio de tensão aplicada - Hipot CC</div>
        <table>
          <thead>
            <tr>
              <th>Classe do cabo</th>
              <th>U0</th>
              <th>Referência CC IEC</th>
              <th>Tensão adotada</th>
              <th>Duração</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>8,7/15 kV</td>
              <td>8,7 kV</td>
              <td>4 x U0 = 34,8 kV</td>
              <td>35 kV CC</td>
              <td>15 min</td>
            </tr>
          </tbody>
        </table>

        <p className="text-justify mb-4 text-[9pt]">
          <strong>Procedimento resumido:</strong> A tensão de ensaio em corrente contínua é aplicada gradativamente até atingir o valor de teste (35 kV). Após estabilização, a leitura da corrente de fuga é realizada minuto a minuto durante 15 minutos. O critério de aprovação exige que não ocorra ruptura do dielétrico, ausência de descargas abruptas e que a corrente de fuga se estabilize ou decresça ao longo do tempo.
        </p>

        <table>
          <thead>
            <tr>
              <th>Fase</th>
              <th>Tensão CC</th>
              <th>Duração</th>
              <th>Corrente inicial</th>
              <th>Corrente final</th>
              <th>Ocorrências</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {['R', 'S', 'T'].map((fase) => {
              const finalVal = v.hipot[14][`fase${fase}` as keyof typeof v.hipot[0]];
              return (
                <tr key={fase}>
                  <td className="text-center font-bold">{fase}</td>
                  <td className="text-center">35 kV</td>
                  <td className="text-center">15 min</td>
                  <td className="text-center">0 µA</td>
                  <td className="text-center">{finalVal} µA</td>
                  <td className="text-center">Sem descarga/ruptura</td>
                  <td className="text-center text-green-700 font-bold">Aprovado</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 border border-gray-300 p-2 bg-white">
          <h3 className="text-center font-bold text-gray-700 mb-1">Corrente de fuga x tempo - Hipot CC 35 kV</h3>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <LineChart
              width={650}
              height={220}
              data={[{ minuto: 0, faseR: 0, faseS: 0, faseT: 0 }, ...v.hipot]}
              margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="minuto" tick={{fontSize: 10}} label={{ value: 'Tempo (min)', position: 'insideBottom', offset: -10, fontSize: 11 }} />
              <YAxis domain={[0, 16]} tick={{fontSize: 10}} label={{ value: 'Corrente de fuga (µA)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="faseR" name="Fase R" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="faseS" name="Fase S" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="faseT" name="Fase T" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </div>
        </div>

        {/* Conclusão Técnica Hipot */}
        <div className="p-3 border border-[#ccc] bg-[#f5f7fa] mt-4">
          <h3 className="font-bold uppercase mb-1 text-center text-[#1e6db5]">Conclusão Técnica — Ensaio de Tensão Aplicada (Hipot CC)</h3>
          <p className="italic text-justify leading-snug text-[8pt]">
            O ensaio de tensão aplicada em corrente contínua (Hipot CC) foi conduzido de acordo com a norma IEC 60060-1 e as recomendações da ABNT NBR 7287, com tensão de ensaio de 35 kV CC por 15 minutos. Durante todo o período, as leituras de corrente de fuga apresentaram comportamento decrescente ou estável nas três fases (R, S e T), sem ocorrência de descargas disruptivas (breakdown) ou rupturas do sistema dielétrico.
            <br/><br/>
            Conclui-se que o cabo de média tensão e suas terminações suportaram integralmente a tenção de ensaio estipulada, comprovando a qualidade da instalação e a integridade dielétrica do sistema para operação em tensão nominal de 13,8 kV.
          </p>
        </div>

        <Footer />
      </div>

      {/* PÁGINA 4 — MEGGER */}
      <div className="page-container page-break">
        <Header fl={4} />

        <div className="section-title">7. Ensaio de resistência de isolamento - Megger</div>

        <p className="text-justify mb-4 text-[9pt]">
          <strong>Procedimento resumido:</strong> A resistência de isolamento é medida utilizando um megôhmetro eletrônico. A tensão contínua é aplicada entre o condutor e a blindagem/terra e entre os condutores das diferentes fases. O objetivo é verificar a integridade da isolação após a instalação ou manutenção. Valores elevados e simétricos indicam boas condições da isolação.
        </p>

        <table>
          <thead>
            <tr>
              <th>Instrumento utilizado</th>
              <th>Tensão aplicada</th>
              <th>Duração de cada teste</th>
              <th>Critério mínimo referencial</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{data.megger_instrumento}</td>
              <td>10 kV CC</td>
              <td>15 min</td>
              <td>&gt; 1.000 MΩ e valores coerentes entre fases</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Medição</th>
              <th>Tensão de teste</th>
              <th>Tempo</th>
              <th>Leitura obtida (MΩ)</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="text-center font-bold">R x S</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.RxS.toLocaleString('pt-BR')}</td><td className="text-center text-green-700 font-bold">Aprovado</td></tr>
            <tr><td className="text-center font-bold">R x T</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.RxT.toLocaleString('pt-BR')}</td><td className="text-center text-green-700 font-bold">Aprovado</td></tr>
            <tr><td className="text-center font-bold">S x T</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.SxT.toLocaleString('pt-BR')}</td><td className="text-center text-green-700 font-bold">Aprovado</td></tr>
            <tr><td className="text-center font-bold">R x Massa</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.RxMassa.toLocaleString('pt-BR')}</td><td className="text-center text-green-700 font-bold">Aprovado</td></tr>
            <tr><td className="text-center font-bold">S x Massa</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.SxMassa.toLocaleString('pt-BR')}</td><td className="text-center text-green-700 font-bold">Aprovado</td></tr>
            <tr><td className="text-center font-bold">T x Massa</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.TxMassa.toLocaleString('pt-BR')}</td><td className="text-center text-green-700 font-bold">Aprovado</td></tr>
          </tbody>
        </table>
        
        <div style={{ width: '100%', marginTop: '12px' }} className="border border-gray-300 p-2 bg-white">
          <h3 className="text-center font-bold text-gray-700 mb-1 text-xs">Megger 10 kV / 15 min - Resistência de isolamento</h3>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <BarChart
              width={650}
              height={220}
              data={[
                { name: 'R-S', val: v.megger.RxS },
                { name: 'R-T', val: v.megger.RxT },
                { name: 'S-T', val: v.megger.SxT },
                { name: 'R-Massa', val: v.megger.RxMassa },
                { name: 'S-Massa', val: v.megger.SxMassa },
                { name: 'T-Massa', val: v.megger.TxMassa }
              ]}
              margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'MΩ', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="val" name="Resistência (MΩ)">
                {['#2563eb','#16a34a','#f97316','#dc2626','#9333ea','#06b6d4'].map((c, i) => <Cell key={i} fill={c} />)}
              </Bar>
            </BarChart>
          </div>
        </div>

        {/* Conclusão Técnica Megger */}
        <div className="p-3 border border-[#ccc] bg-[#f5f7fa] mt-4">
          <h3 className="font-bold uppercase mb-1 text-center text-[#1e6db5]">Conclusão Técnica — Ensaio de Resistência de Isolamento (Megger)</h3>
          <p className="italic text-justify leading-snug text-[8pt]">
            O ensaio de resistência de isolamento foi executado com megôhmetro eletrônico aplicando 10 kV CC por 15 minutos, conforme prescrições da norma ABNT NBR 7286 e IEC 60093. Os valores obtidos entre as combinações de fases e fase-terra apresentaram-se significativamente elevados e com distribuição coerente entre as medições, sem desequilíbrios acentuados que pudessem indicar degradação localizada da isolação.
            <br/><br/>
            Os resultados obtidos confirmam que a isolação do cabo se encontra em ótimas condições, com níveis de resistência muito acima dos limites mínimos estabelecidos pelas normas vigentes, garantindo segurança e longevidade ao sistema elétrico instalado.
          </p>
        </div>

        <Footer />
      </div>

      {/* PÁGINA 5 — ATERRAMENTO */}
      <div className="page-container page-break">
        <Header fl={5} />

        <div className="section-title">8. Medição de resistência de aterramento</div>

        <p className="text-justify mb-4 text-[9pt]">
          <strong>Procedimento resumido:</strong> O método utilizado para medição da resistência de aterramento é o de queda de potencial (Método Wenner ou 3 pontos). São inseridas hastes auxiliares de injeção de corrente e medição de potencial no solo a distâncias padronizadas. O ensaio avalia se a malha apresenta baixa resistência para garantir a rápida atuação das proteções e segurança contra tensões de passo e toque.
        </p>

        <table>
          <thead>
            <tr>
              <th>Hastes inspecionadas</th>
              <th>Tipo</th>
              <th>Comprimento aproximado</th>
              <th>Instrumento</th>
              <th>Método de medição</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{data.aterramento_qtde_hastes}</td>
              <td>{data.aterramento_tipo}</td>
              <td>{data.aterramento_comprimento}</td>
              <td>{data.aterramento_instrumento}</td>
              <td>Queda de potencial a 62%</td>
            </tr>
          </tbody>
        </table>

        <div className="w-full mb-4">
          <table>
            <thead>
              <tr>
                <th>Ponto Medido</th>
                <th>Leitura Obtida (Ω)</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {v.aterramento.map((val: number, i: number) => (
                <tr key={i}>
                  <td className="text-center font-bold">Haste P{i + 1}</td>
                  <td className="text-right pr-8">{val.toFixed(2)} Ω</td>
                  <td className="text-center text-green-700 font-bold">Aprovado</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ width: '100%', marginTop: '12px' }} className="border border-gray-300 p-2 bg-white">
          <h3 className="text-center font-bold text-gray-700 mb-1 text-xs">Resistência de aterramento por ponto</h3>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <BarChart
              width={650}
              height={220}
              data={[
                ...v.aterramento.map((val: number, i: number) => ({ name: `P${i+1}`, val })),
                { name: 'Geral', val: +(v.aterramento.reduce((a: number, b: number) => a + b, 0) / v.aterramento.length).toFixed(2) }
              ]}
              margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'Ohms (Ω)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="val" name="Resistência (Ω)" label={{ position: 'top', fontSize: 10 }}>
                {[...v.aterramento.map((_: any, i: number) => (
                  <Cell key={i} fill={['#2563eb','#16a34a','#f97316','#dc2626'][i % 4]} />
                )), <Cell key="geral" fill="#9333ea" />]}
              </Bar>
            </BarChart>
          </div>
        </div>

        {/* Conclusão Técnica Aterramento */}
        <div className="p-3 border border-[#ccc] bg-[#f5f7fa] mt-4">
          <h3 className="font-bold uppercase mb-1 text-center text-[#1e6db5]">Conclusão Técnica do Sistema de Aterramento</h3>
          <p className="italic text-justify leading-snug text-[8pt]">
            As medições de resistência ôhmica do sistema de aterramento foram realizadas em conformidade com as recomendações da norma ABNT NBR 15749 (Medição de Resistência de Aterramento e de Potenciais na Superfície do Solo) e NBR 5410. Os valores obtidos nas hastes e na malha geral encontram-se dentro dos limites aceitáveis para garantir o escoamento seguro de correntes de falta e proteção contra choques elétricos.
            <br/><br/>
            Desta forma, atesta-se que a malha de aterramento inspecionada apresenta integridade e continuidade elétrica satisfatórias, estando apta a proteger os equipamentos e garantir a segurança dos usuários e da instalação.
          </p>
        </div>

        <Footer />
      </div>

      {/* PÁGINA 6 — TRANSFORMADOR */}
      <div className="page-container page-break">
        <Header fl={6} />
        <div className="section-title">9. Ensaios do transformador</div>

        {v.trafo ? (
          <CabineTransformerSheet data={data} trafo={v.trafo} extra={v.trafoDados} />
        ) : (
          <div className="text-center p-8 text-gray-500 italic">
            Não há dados de transformador registrados para esta cabine.
          </div>
        )}

        <Footer />
      </div>

      {/* PÁGINA 7 — INSTRUMENTOS + CHECKLIST + CONCLUSÃO */}
      <div className="page-container page-break">
        <Header fl={7} />

        <div className="section-title">10. Instrumentos utilizados</div>
        <table>
          <thead>
            <tr>
              <th>Instrumento</th>
              <th>Modelo</th>
              <th>Nº série</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Hipot CC</td><td>{data.hipot_instrumento || 'Instrum HY 60kV CC'}</td><td>{data.hipot_serie_instrumento || '15552'}</td></tr>
            <tr><td>Megôhmetro</td><td>{data.megger_instrumento || 'Uni-T UT513'}</td><td>{data.megger_serie_instrumento || 'C160215986'}</td></tr>
            <tr><td>Terrômetro</td><td>{data.aterramento_instrumento || 'Hikari HTR-770'}</td><td>{data.aterramento_serie_instrumento || '130919201'}</td></tr>
            <tr><td>TTR / analisador trafo</td><td>Instrum TTR 2000R</td><td>906062-15980</td></tr>
          </tbody>
        </table>

        <div className="section-title">11. Checklist objetivo para liberação</div>
        <table>
          <thead>
            <tr>
              <th className="w-1/2">Item</th>
              <th className="w-1/4 text-center">Condição</th>
              <th className="w-1/4">Observação</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Limpeza geral da cabine e isoladores</td><td className="text-center font-bold text-green-700">[Conforme]</td><td>Sem poeira excessiva</td></tr>
            <tr><td>Aperto das conexões e terminais</td><td className="text-center font-bold text-green-700">[Conforme]</td><td>Torque verificado</td></tr>
            <tr><td>Sinalização de advertência e segurança</td><td className="text-center font-bold text-green-700">[Conforme]</td><td>Placas legíveis</td></tr>
            <tr><td>Nível e vazamento de óleo (trafo/disjuntor)</td><td className="text-center font-bold text-green-700">[Conforme]</td><td>Nível normal, sem vazamentos</td></tr>
            <tr><td>Integridade das muflas e condutores</td><td className="text-center font-bold text-green-700">[Conforme]</td><td>Isentos de trincas</td></tr>
          </tbody>
        </table>

        <div className="section-title">12. Conclusão</div>
        <p className="text-justify mb-8 text-[9pt]">
          <strong>
            Concluímos que a cabine primária e o ramal de entrada de média tensão foram ensaiados de acordo com os procedimentos normativos e apresentam plenas condições técnicas de operação. Os valores de resistência de isolamento encontram-se dentro dos limites aceitáveis para a classe de tensão nominal. O sistema de aterramento apresenta baixa resistência, garantindo a equipotencialização e a segurança da instalação. Todos os resultados de testes do transformador atestam seu funcionamento dentro dos padrões da NBR aplicável. A instalação está LIBERADA para energização.
          </strong>
        </p>

        <div className="section-title">13. Responsável Técnico</div>
        <div className="mt-16 text-center w-64">
          <div className="border-b border-gray-800 mb-2"></div>
          <div className="font-bold">{data.responsavel_nome}</div>
          <div>Engenheiro eletricista</div>
          <div>CREA: {data.responsavel_crea}</div>
        </div>

        <Footer />
      </div>

      {/* PÁGINA 8 — ANEXO I (CAPA) */}
      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={8} />
        <div className="cover-content flex-1 flex flex-col items-center justify-center w-full">
          <h1 className="text-5xl font-bold text-gray-800 mb-4 tracking-widest">ANEXO I</h1>
          <h2 className="text-2xl font-medium text-gray-600">CREA Responsável técnico</h2>
        </div>
        <Footer />
      </div>

      {/* PÁGINA 9 — ANEXO I (IMAGEM) */}
      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={9} />
        <div className="cover-content flex-1 flex flex-col items-center justify-center w-full">
          {!creaBase64.startsWith("COLE_AQUI") ? (
            <img src={creaBase64} alt="CREA Roberto Fontes Lopes" className="w-full max-w-2xl object-contain" style={{ maxHeight: '220mm' }} />
          ) : (
            <div className="w-full max-w-2xl bg-gray-100 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 font-bold" style={{ minHeight: '220mm' }}>
              Cole o texto Base64 no arquivo src/lib/creaBase64.ts
            </div>
          )}
        </div>
        <Footer />
      </div>

      {/* PÁGINA 10 — ANEXO II (CAPA) */}
      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={10} />
        <div className="cover-content flex-1 flex flex-col items-center justify-center w-full">
          <h1 className="text-5xl font-bold text-gray-800 mb-4 tracking-widest">ANEXO II</h1>
          <h2 className="text-2xl font-medium text-gray-600">Anotação de Responsabilidade Técnica</h2>
        </div>
        <Footer />
      </div>

      {/* ANEXO II — ART (PODE TER MÚLTIPLAS PÁGINAS) */}
      {artUrl && artTipo === 'image' ? (
        <div className="page-container page-break art-page flex flex-col items-center justify-center w-full relative">
          <Header fl={11} />
          <div className="art-pdf-wrapper w-full flex justify-center bg-white my-4">
            <img src={artUrl} alt="ART anexada" className="w-full object-contain" style={{ maxWidth: '170mm', maxHeight: '245mm' }} />
          </div>
          <Footer />
        </div>
      ) : artUrl ? (
        <Document
          file={artUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setArtTipo('image')}
          className="flex flex-col items-center"
          loading={<div className="no-print p-8 text-center text-gray-500">Processando PDF da ART para impressão...</div>}
          error={<div className="no-print p-8 text-center text-gray-500">Carregando ART como imagem...</div>}
        >
          {Array.from(new Array(numPagesArt || 0), (el, index) => (
            <div key={`page_${index + 1}`} className="page-container page-break art-page flex flex-col items-center justify-center w-full relative">
              <Header fl={11 + index} />
              <div className="art-pdf-wrapper w-full flex justify-center bg-white my-4">
                 <Page 
                   pageNumber={index + 1} 
                   renderTextLayer={false} 
                   renderAnnotationLayer={false} 
                   width={650} 
                 />
              </div>
              <Footer />
            </div>
          ))}
        </Document>
      ) : (
        <div className="page-container flex flex-col" style={{ minHeight: '277mm' }}>
          <Header fl={11} />
          <div className="flex-1 flex flex-col items-center justify-center w-full">
            <div className="w-full max-w-2xl border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 italic" style={{ minHeight: '220mm' }}>
              Nenhuma ART anexada para este relatório.
            </div>
          </div>
          <Footer />
        </div>
      )}

    </div>
  );
}

