'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, Cell, Tooltip } from 'recharts';
import { getUrlArquivo } from '@/lib/storage';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CabineReportViewer(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [creaUrl, setCreaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (data?.art_arquivo_url) {
      getUrlArquivo(data.art_arquivo_url).then(setArtUrl);
    }
    getUrlArquivo('crea/roberto-fontes-lopes.jpg').then(setCreaUrl);
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

  if (data === false) return <div className="p-8 text-center text-red-600">Relatório não encontrado.</div>;
  if (!data) return <div className="p-8 text-center">Carregando relatório...</div>;

  const v = data.valores_calculados;

  const Header = ({ fl }: { fl: number }) => (
    <div className="cabecalho w-full border-2 border-blue-900 mb-6 flex text-[10pt]">
      <div className="w-1/4 p-2 flex items-center justify-center border-r-2 border-blue-900">
        <img src="/logo.png" alt="Logo" className="max-h-12 object-contain" />
      </div>
      <div className="w-1/2 p-2 flex items-center justify-center border-r-2 border-blue-900 font-bold text-center">
        RELATÓRIO TÉCNICO
      </div>
      <div className="w-1/4 p-0 text-xs" style={{ display: 'grid', gridTemplateRows: '1fr 1fr 1fr', borderLeft: '2px solid #1e3a5f' }}>
        <div style={{ padding: '2px 6px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center' }}>N Relatório: {data.numero_relatorio}</div>
        <div style={{ padding: '2px 6px', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center' }}>Data: {data.data_execucao?.split('-').reverse().join('/')}</div>
        <div style={{ padding: '2px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        @page { size: A4 portrait; margin: 15mm; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-after: always; break-after: page; }
          .page-break:last-child { page-break-after: avoid; break-after: avoid; }
          .page-container { margin: 0; padding: 15mm; box-shadow: none; }
          body { font-size: 9pt; font-family: Arial, sans-serif; background: white; }
          table { font-size: 8pt; width: 100%; border-collapse: collapse; }
          th { background-color: #1e3a5f !important; color: white !important; padding: 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact; border: 1px solid #ccc; text-align: left; }
          td { padding: 6px; border: 1px solid #ccc; }
          tr:nth-child(even) td { background-color: #f5f7fa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .cabecalho { position: static; }
          .section-title { color: #1e6db5 !important; font-weight: bold; font-size: 11pt; margin-top: 15px; margin-bottom: 8px; }
          .print-only { display: flex !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
        /* Visualização em tela similar à impressão */
        .page-container {
          background: white; max-width: 210mm; margin: 20px auto; padding: 15mm;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative;
        }
        .page-container table { font-size: 9pt; width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        .page-container th { background-color: #1e3a5f; color: white; padding: 6px; border: 1px solid #ccc; text-align: left; }
        .page-container td { padding: 6px; border: 1px solid #ccc; }
        .page-container tr:nth-child(even) td { background-color: #f5f7fa; }
        .section-title { color: #1e6db5; font-weight: bold; font-size: 12pt; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
      `}} />

      <div className="text-center p-4 no-print bg-white border-b sticky top-0 z-50 shadow-sm flex justify-between items-center max-w-4xl mx-auto">
        <button onClick={() => router.push('/cabine')} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">← Voltar</button>
        <h2 className="font-bold">Visualização do Relatório</h2>
        <div>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">Imprimir Relatório</button>
          {artUrl && (
            <button
              onClick={() => window.open(artUrl, '_blank')}
              className="no-print bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 ml-2"
            >
              Abrir ART
            </button>
          )}
        </div>
      </div>

      {/* PÁGINA 1 — CAPA */}
      <div className="page-container page-break flex flex-col items-center justify-center">
        <Header fl={1} />
        <div className="flex-1 flex flex-col items-center justify-center text-center">
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
            <tr><th className="w-1/3">Origem</th><td>{data.cabo_de}</td></tr>
            <tr><th>Destino</th><td>{data.cabo_para}</td></tr>
            <tr><th>Classe de tensão</th><td>8,7/15 kV</td></tr>
            <tr><th>Tensão nominal</th><td>13,8 kV</td></tr>
            <tr><th>Condutor</th><td>Cobre</td></tr>
            <tr><th>Seção</th><td>{data.cabo_secao}</td></tr>
            <tr><th>Isolação</th><td>{data.cabo_isolacao}</td></tr>
            <tr><th>Comprimento aproximado</th><td>{data.cabo_comprimento}</td></tr>
            <tr><th>Tipo de terminal</th><td>{data.cabo_terminais}</td></tr>
            <tr><th>Emendas</th><td>{data.cabo_emendas}</td></tr>
            <tr><th>Blindagem</th><td>{data.cabo_blindagem}</td></tr>
            <tr><th>Instalação</th><td>{data.cabo_instalacao}</td></tr>
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

        <div className="mt-8 border border-gray-300 p-2 bg-white">
          <h3 className="text-center font-bold text-gray-700 mb-2">Corrente de fuga x tempo - Hipot CC 35 kV</h3>
          <div style={{ width: '100%', overflowX: 'auto', marginTop: 16 }}>
            <LineChart
              width={700}
              height={320}
              data={[{ minuto: 0, faseR: 0, faseS: 0, faseT: 0 }, ...v.hipot]}
              margin={{ top: 10, right: 30, left: 20, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="minuto" label={{ value: 'Tempo (min)', position: 'insideBottom', offset: -15 }} />
              <YAxis domain={[0, 16]} label={{ value: 'Corrente de fuga (µA)', angle: -90, position: 'insideLeft', offset: 10 }} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} />
              <Line type="monotone" dataKey="faseR" name="Fase R" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="faseS" name="Fase S" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="faseT" name="Fase T" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </div>
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
            </tr>
          </thead>
          <tbody>
            <tr><td className="text-center font-bold">R x S</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.RxS.toLocaleString('pt-BR')}</td></tr>
            <tr><td className="text-center font-bold">R x T</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.RxT.toLocaleString('pt-BR')}</td></tr>
            <tr><td className="text-center font-bold">S x T</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.SxT.toLocaleString('pt-BR')}</td></tr>
            <tr><td className="text-center font-bold">R x Massa</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.RxMassa.toLocaleString('pt-BR')}</td></tr>
            <tr><td className="text-center font-bold">S x Massa</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.SxMassa.toLocaleString('pt-BR')}</td></tr>
            <tr><td className="text-center font-bold">T x Massa</td><td className="text-center">10 kV</td><td className="text-center">15 min</td><td className="text-right pr-4">{v.megger.TxMassa.toLocaleString('pt-BR')}</td></tr>
          </tbody>
        </table>
        
        <div style={{ width: '100%', marginTop: '16px' }} className="border border-gray-300 p-2 bg-white">
          <h3 className="text-center font-bold text-gray-700 mb-2 text-xs">Megger 10 kV / 15 min - Resistência de isolamento</h3>
          <div style={{ width: '100%', overflowX: 'auto', marginTop: 16 }}>
            <BarChart
              width={700}
              height={280}
              data={[
                { name: 'R-S', val: v.megger.RxS },
                { name: 'R-T', val: v.megger.RxT },
                { name: 'S-T', val: v.megger.SxT },
                { name: 'R-Massa', val: v.megger.RxMassa },
                { name: 'S-Massa', val: v.megger.SxMassa },
                { name: 'T-Massa', val: v.megger.TxMassa }
              ]}
              margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
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

        <div className="flex gap-4">
          <div className="w-1/2">
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

          <div className="w-1/2 border border-gray-300 p-2 bg-white">
            <h3 className="text-center font-bold text-gray-700 mb-2 text-xs">Resistência de aterramento por ponto</h3>
            <div style={{ width: '100%', overflowX: 'auto', marginTop: 16 }}>
              <BarChart
                width={700}
                height={280}
                data={[
                  ...v.aterramento.map((val: number, i: number) => ({ name: `P${i+1}`, val })),
                  { name: 'Geral', val: +(v.aterramento.reduce((a: number, b: number) => a + b, 0) / v.aterramento.length).toFixed(2) }
                ]}
                margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
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
        </div>

        <Footer />
      </div>

      {/* PÁGINA 6 — TRANSFORMADOR */}
      <div className="page-container page-break">
        <Header fl={6} />
        <div className="section-title">9. Ensaios do transformador</div>

        {v.trafo ? (
          <div className="text-[8pt]">
            <table className="mb-4">
              <tbody>
                <tr>
                  <th className="w-1/4">Fabricante</th><td className="w-1/4">{data.trafo_fabricante}</td>
                  <th className="w-1/4">Potência</th><td className="w-1/4">{data.trafo_potencia_kva} kVA</td>
                </tr>
                <tr>
                  <th>Nº de Série</th><td>{data.trafo_numero_serie}</td>
                  <th>Tensão AT/BT</th><td>13800 / {data.trafo_tensao_bt} V</td>
                </tr>
              </tbody>
            </table>

            {/* Relação de Transformação */}
            <div className="mt-4 mb-1"><strong>TENSÃO DE DESPACHO AT:</strong> {Number(data.trafo_tap_despacho).toLocaleString('pt-BR')} V</div>
            <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Relação de Transformação</h4>
            <table className="mb-4 text-center">
              <thead>
                <tr>
                  <th className="w-40 text-left">TAP [V]:</th>
                  {v.trafo.taps.map((t: any) => <th key={t.tensaoAt} className="text-center">{t.tensaoAt}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold text-left">FASE 1</td>
                  {v.trafo.taps.map((t: any) => <td key={t.tensaoAt}>{t.relH1H2}</td>)}
                </tr>
                <tr>
                  <td className="font-semibold text-left">FASE 2</td>
                  {v.trafo.taps.map((t: any) => <td key={t.tensaoAt}>{t.relH2H3}</td>)}
                </tr>
                <tr>
                  <td className="font-semibold text-left">FASE 3</td>
                  {v.trafo.taps.map((t: any) => <td key={t.tensaoAt}>{t.relH3H1}</td>)}
                </tr>
                <tr className="border-t border-[#ccc]">
                  <td className="font-semibold bg-[#f5f7fa] text-left">ERRO [%]:</td>
                  {v.trafo.taps.map((t: any) => {
                    const max = Math.max(t.relH1H2, t.relH2H3, t.relH3H1);
                    const min = Math.min(t.relH1H2, t.relH2H3, t.relH3H1);
                    const erro = ((max - min) / t.relacaoTeorica) * 100;
                    return <td key={t.tensaoAt} className="font-bold text-red-600 print:text-black">{erro.toFixed(2)}</td>;
                  })}
                </tr>
              </tbody>
            </table>

            {/* Correntes Nominais */}
            <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Correntes Nominais</h4>
            <table className="mb-4 text-center">
              <tbody>
                <tr className="font-semibold">
                  <td className="w-16 bg-[#f5f7fa]">V</td>
                  {v.trafo.taps.map((t: any) => <td key={`v-${t.tensaoAt}`}>{t.tensaoAt}</td>)}
                  <td className="bg-[#e2e8f0]">{data.trafo_tensao_bt}</td>
                </tr>
                <tr>
                  <td className="w-16 font-semibold bg-[#f5f7fa]">A</td>
                  {v.trafo.taps.map((t: any) => <td key={`a-${t.tensaoAt}`}>{t.correnteAt}</td>)}
                  <td className="font-bold bg-[#f5f7fa]">{v.trafo.correnteBt}</td>
                </tr>
              </tbody>
            </table>

            <div className="flex gap-2 mb-4">
              {/* Perdas em Vazio */}
              <div className="w-1/2">
                <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Perdas em Vazio</h4>
                <table className="text-center w-full">
                  <thead>
                    <tr>
                      <th>I1 (A)</th>
                      <th>I2 (A)</th>
                      <th>I3 (A)</th>
                      <th>I Méd (A)</th>
                      <th>P (W)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{v.trafo.perdaVazioI1}</td>
                      <td>{v.trafo.perdaVazioI2}</td>
                      <td>{v.trafo.perdaVazioI3}</td>
                      <td>{v.trafo.perdaVazioImed}</td>
                      <td>{v.trafo.perdaVazioP}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Perdas em Carga */}
              <div className="w-1/2">
                <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Perdas em Carga e Impedância</h4>
                <table className="text-center w-full">
                  <thead>
                    <tr>
                      <th>IN (A)</th>
                      <th>Vcc (V)</th>
                      <th>Z (%)</th>
                      <th>P a 22°C (W)</th>
                      <th>P a 75°C (W)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{v.trafo.correnteBt}</td>
                      <td>{v.trafo.tensaoCurtoCircuito}</td>
                      <td>{v.trafo.impedanciaPercent75}</td>
                      <td>{v.trafo.perdaCargaPcc22}</td>
                      <td>{v.trafo.perdaCargaPcc75}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              {/* Tensão Aplicada */}
              <div className="w-1/2">
                <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Tensão Aplicada</h4>
                <table className="w-full text-left">
                  <tbody>
                    <tr>
                      <td colSpan={2} className="font-bold text-center bg-[#f5f7fa]">TENSÃO APLICADA EM 60 Hz</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa] w-3/5">Tempo [s]</td>
                      <td className="text-center w-2/5">60</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">AT x BT [kV]</td>
                      <td className="text-center">{v.trafo.tensaoAplicadaPrimKv}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">AT x Massa [kV]</td>
                      <td className="text-center">{v.trafo.tensaoAplicadaPrimKv}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">BT x Massa [kV]</td>
                      <td className="text-center">{v.trafo.tensaoAplicadaSecKv}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Tensão Induzida */}
              <div className="w-1/2">
                <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold italic text-center border border-[#ccc] uppercase">Tensão Induzida</h4>
                <table className="w-full text-left">
                  <tbody>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa] w-3/5">TENSÃO INDUZIDA [V]:</td>
                      <td className="w-2/5 text-center">380</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">FREQUÊNCIA [Hz]:</td>
                      <td className="text-center">120</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">TEMPO DO ENSAIO [S]:</td>
                      <td className="text-center">60</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">MÉTODO DO ENSAIO:</td>
                      <td className="text-center">NORMAL</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              {/* Resistência de Isolamento */}
              <div className="w-1/2">
                <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Resistência de Isolamento</h4>
                <table className="w-full text-center">
                  <thead>
                    <tr>
                      <th>Posição</th>
                      <th>Tensão Aplicada [V]</th>
                      <th>Resistência [MΩ]</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-semibold text-left">AT x BT</td>
                      <td>5000</td>
                      <td className="font-bold">{v.trafo.isolAtBt}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-left">AT x Massa</td>
                      <td>5000</td>
                      <td className="font-bold">{v.trafo.isolAtMassa}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold text-left">BT x Massa</td>
                      <td>2500</td>
                      <td className="font-bold">{v.trafo.isolBtMassa}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Rigidez Dielétrica do Óleo */}
              <div className="w-1/2">
                <h4 className="bg-[#1e3a5f] text-white py-1 px-2 font-bold text-center border border-[#ccc] uppercase">Rigidez Dielétrica do Óleo</h4>
                <table className="w-full text-left">
                  <tbody>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa] w-3/5">Rigidez Dielétrica [kV]</td>
                      <td className="text-center w-2/5 font-bold">{v.trafo.rigidezKv}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">Temperatura [°C]</td>
                      <td className="text-center">{data.cabo_temperatura || '--'}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">Tipo</td>
                      <td className="text-center">Mineral</td>
                    </tr>
                    <tr>
                      <td className="font-semibold bg-[#f5f7fa]">Procedência</td>
                      <td className="text-center">BR</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Conclusão Técnica Trafo */}
            <div className="p-3 border border-[#ccc] bg-[#f5f7fa] mt-2">
              <h3 className="font-bold uppercase mb-1 text-center text-[#1e6db5]">Conclusão Técnica do Transformador</h3>
              <p className="italic text-justify leading-snug text-xs">
                Os ensaios realizados neste equipamento apresentaram resultados dentro dos limites estabelecidos pelas normas ABNT NBR 5356 e ABNT NBR IEC 60156, abrangendo os ensaios de relação de transformação, correntes nominais, perdas em vazio, perdas em carga e impedância, tensão aplicada, tensão induzida, resistência de isolamento e rigidez dielétrica do óleo isolante.
                <br/><br/>
                Com base nos resultados obtidos, o transformador encontra-se em condições técnicas satisfatórias, estando apto para energização e operação em plena carga dentro de suas especificações nominais.
              </p>
            </div>

          </div>
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

      {/* PÁGINA 8 — ANEXO I */}
      <div className="page-container page-break flex flex-col items-center justify-center">
        <Header fl={8} />
        <div className="flex-1 flex flex-col items-center justify-center w-full mt-4">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 tracking-widest">ANEXO I</h1>
          <h2 className="text-xl font-medium text-gray-600 mb-12">CREA Responsável técnico</h2>

          {creaUrl ? (
            <img src={creaUrl} alt="CREA Roberto Fontes Lopes" className="w-full max-w-2xl" />
          ) : (
            <div className="w-full max-w-2xl bg-gray-100 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 font-bold" style={{ minHeight: '600px' }}>
              Imagem do CREA não cadastrada. Acesse Configurações para adicionar.
            </div>
          )}
        </div>
        <Footer />
      </div>

      {/* PÁGINA 9 — ANEXO II */}
      <div className="page-container">
        <Header fl={9} />
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 400 }}>
          <h1 className="text-4xl font-bold text-gray-800 mb-2 tracking-widest">ANEXO II</h1>
          <h2 className="text-xl font-medium text-gray-600 mb-12">Anotação de Responsabilidade Técnica</h2>

          {artUrl ? (
            <>
              {/* Na tela: botão para abrir em nova aba */}
              <div className="no-print flex flex-col items-center gap-4">
                <div className="text-green-700 font-semibold text-lg">✓ ART anexada</div>
                <button
                  onClick={() => window.open(artUrl, '_blank')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
                >
                  Abrir ART em nova aba
                </button>
                <p className="text-gray-500 text-sm text-center max-w-md">
                  Para incluir a ART no relatório impresso, abra o arquivo acima,
                  imprima separadamente e adicione ao final do relatório.
                </p>
              </div>

              {/* Na impressão: placeholder indicando que ART deve ser anexada */}
              <div className="print-only w-full border-2 border-dashed border-gray-400 rounded flex items-center justify-center text-gray-500 italic text-center p-8" style={{ minHeight: 400 }}>
                ART registrada no sistema — imprimir separadamente e incluir aqui
              </div>
            </>
          ) : (
            <div className="w-full border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 italic" style={{ minHeight: 400 }}>
              Nenhuma ART anexada para este relatório.
            </div>
          )}
        </div>
        <Footer />
      </div>

    </div>
  );
}
