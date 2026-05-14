'use client';

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CabineReportPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [relatorio, setRelatorio] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('relatorios_cabine')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setRelatorio(data);
        } else {
          setRelatorio(false);
        }
        setLoading(false);
      });
  }, [params.id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-lg font-medium text-gray-600">Carregando relatório completo...</div>;
  if (relatorio === false || !relatorio) return <div className="min-h-screen flex items-center justify-center text-lg font-medium text-red-600">Relatório não encontrado ou sem permissão de acesso.</div>;

  const dataEnsaio = format(parseISO(relatorio.data_execucao), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const val = relatorio.valores_calculados;

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-20 print:bg-white print:p-0">
      
      {/* Action Bar */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col md:flex-row gap-4 justify-between items-center no-print">
        <Link href="/cabine" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium">
          <ArrowLeft size={20} />
          Voltar
        </Link>
        <button onClick={handlePrint} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-md font-medium transition-colors">
          <Printer size={18} />
          Imprimir PDF
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @page { 
          size: A4 portrait; 
          margin: 15mm; 
        }
        @media print {
          body { background: white; font-size: 10pt; margin: 0; padding: 0; color: black; }
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
          .page-container { width: 100%; box-shadow: none; border: none; min-height: 100vh; padding: 0; margin: 0; position: relative; }
          .bg-gray-100 { background-color: transparent !important; }
          .border-gray-300 { border-color: #000 !important; }
          .text-gray-500, .text-gray-600 { color: #000 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .page-container {
          background: white;
          max-width: 5xl;
          margin: 0 auto 20px auto;
          min-height: 297mm;
          padding: 20mm;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
      `}} />

      {/* PÁGINA 1 — CAPA */}
      <div className="page-container page-break flex flex-col items-center justify-center text-center">
        <div className="font-bold text-3xl tracking-tighter mb-16 border-b-4 border-black pb-2 px-12">RADIAL ENERGIA</div>
        
        <h1 className="text-4xl font-bold mb-20 underline">RELATÓRIO TÉCNICO</h1>
        
        <div className="w-full text-left space-y-12 max-w-2xl text-lg">
          <div>
            <p className="font-bold">CLIENTE: {relatorio.cliente_nome}</p>
            <p>{relatorio.cliente_endereco}</p>
          </div>
          
          <div>
            <p className="font-bold">LOCAL DE EXECUÇÃO DOS SERVIÇOS:</p>
            <p>{relatorio.cliente_endereco} - {relatorio.cliente_cidade}/{relatorio.cliente_uf}</p>
          </div>
          
          <div>
            <p className="font-bold">DATA DE EXECUÇÃO DOS SERVIÇOS:</p>
            <p className="uppercase">{dataEnsaio}</p>
          </div>
          
          <div>
            <p className="font-bold">OBJETIVO:</p>
            <p>{relatorio.objetivo}</p>
          </div>
        </div>
      </div>

      {/* PÁGINA 2 — ÍNDICE */}
      <div className="page-container page-break">
        <div className="font-bold text-xl tracking-tight mb-12">RADIAL ENERGIA</div>
        
        <h2 className="text-2xl font-bold mb-12 text-center underline">ÍNDICE</h2>
        
        <div className="max-w-3xl mx-auto font-mono text-lg space-y-4">
          <div className="flex justify-between border-b border-dashed border-gray-400 pb-1 font-bold">
            <span>ASSUNTO</span>
            <span>PÁGINA</span>
          </div>
          <div className="flex justify-between items-end">
            <span>CAPA</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>1</span>
          </div>
          <div className="flex justify-between items-end">
            <span>ÍNDICE</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>2</span>
          </div>
          <div className="flex justify-between items-end">
            <span>DADOS GERAIS</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>3</span>
          </div>
          <div className="flex justify-between items-end">
            <span>RELATÓRIO DE INSPEÇÃO E TESTES - HIPOT</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>4</span>
          </div>
          <div className="flex justify-between items-end">
            <span>RELATÓRIO DE INSPEÇÃO E TESTES - ATERRAMENTO</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>5</span>
          </div>
          <div className="flex justify-between items-end">
            <span>RELATÓRIO DE INSPEÇÃO E TESTES - MEGGER</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>6</span>
          </div>
          <div className="flex justify-between items-end">
            <span>FICHA DE ENSAIO - TRANSFORMADOR</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>7</span>
          </div>
          <div className="flex justify-between items-end">
            <span>CREA DO RESPONSÁVEL</span><span className="flex-1 border-b border-dotted border-gray-400 mx-2 mb-1"></span><span>8</span>
          </div>
        </div>
      </div>

      {/* PÁGINA 3 — DADOS GERAIS */}
      <div className="page-container page-break">
        <div className="font-bold text-xl tracking-tight mb-12">RADIAL ENERGIA</div>
        
        <h2 className="text-2xl font-bold mb-12 text-center underline">DADOS GERAIS</h2>
        
        <div className="max-w-3xl mx-auto space-y-8 text-lg">
          <div className="flex">
            <span className="font-bold w-32">CLIENTE:</span>
            <div>
              <p>{relatorio.cliente_nome}</p>
              <p>{relatorio.cliente_endereco}</p>
              <p>CEP: {relatorio.cliente_cep || 'N/A'}</p>
            </div>
          </div>
          <div className="flex">
            <span className="font-bold w-32">CNPJ N.º:</span>
            <p>{relatorio.cliente_cnpj || 'N/A'}</p>
          </div>
          <div className="flex">
            <span className="font-bold w-64">INSCRIÇÃO ESTADUAL N.º:</span>
            <p>{relatorio.cliente_ie || 'ISENTO'}</p>
          </div>
        </div>
      </div>

      {/* PÁGINA 4 — HIPOT */}
      <div className="page-container page-break text-sm">
        <div className="font-bold text-lg tracking-tight mb-4">RADIAL ENERGIA</div>
        <h2 className="text-xl font-bold mb-6 text-center bg-gray-200 py-1 uppercase border border-black">Relatório de Inspeção e Testes - HIPOT</h2>
        
        {/* Cabeçalho */}
        <div className="border border-black p-2 mb-4 grid grid-cols-2 gap-2">
          <p><strong>Cliente:</strong> {relatorio.cliente_nome}</p>
          <p><strong>Data:</strong> {format(parseISO(relatorio.data_execucao), 'dd/MM/yyyy')}</p>
          <p><strong>Obra:</strong> {relatorio.cliente_cidade}</p>
          <p><strong>Projeto:</strong> Cabine Primária</p>
        </div>

        {/* Características do Cabo */}
        <div className="border border-black p-2 mb-4">
          <p className="font-bold mb-2">Características do Cabo:</p>
          <div className="grid grid-cols-3 gap-2">
            <p><strong>DE:</strong> {relatorio.cabo_de}</p>
            <p><strong>PARA:</strong> {relatorio.cabo_para}</p>
            <p><strong>Comprimento:</strong> {relatorio.cabo_comprimento}</p>
            <p><strong>Bitola:</strong> {relatorio.cabo_bitola}</p>
            <p><strong>Tensão de Teste:</strong> {relatorio.hipot_tensao_teste}</p>
            <p><strong>Duração:</strong> {relatorio.hipot_duracao}</p>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Tabela HIPOT */}
          <div className="w-1/3">
            <table className="w-full border-collapse border border-black text-center text-xs">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-black p-1">Minuto</th>
                  <th className="border border-black p-1 text-red-600 print:text-black">Fase R (µA)</th>
                  <th className="border border-black p-1 text-green-600 print:text-black">Fase S (µA)</th>
                  <th className="border border-black p-1 text-blue-600 print:text-black">Fase T (µA)</th>
                </tr>
              </thead>
              <tbody>
                {val.hipot.map((h: any) => (
                  <tr key={h.minuto}>
                    <td className="border border-black p-1 font-bold bg-gray-50">{h.minuto}</td>
                    <td className="border border-black p-1">{h.faseR}</td>
                    <td className="border border-black p-1">{h.faseS}</td>
                    <td className="border border-black p-1">{h.faseT}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Gráfico */}
          <div className="w-2/3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={val.hipot} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="minuto" label={{ value: 'Tempo (min)', position: 'insideBottomRight', offset: -5 }} />
                <YAxis label={{ value: 'Corrente de Fuga (µA)', angle: -90, position: 'insideLeft' }} domain={[0, 'dataMax + 2']} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="faseR" name="Fase R" stroke="#dc2626" strokeWidth={2} />
                <Line type="monotone" dataKey="faseS" name="Fase S" stroke="#16a34a" strokeWidth={2} />
                <Line type="monotone" dataKey="faseT" name="Fase T" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-8 border-t border-black pt-4 text-center">
          <p className="font-bold mb-4">CONCLUSÃO:</p>
          <p className="italic mb-8">Ensaio realizado obtendo resultados satisfatórios, podendo o cabo ser energizado e utilizado em suas totais funcionalidades.</p>
          <div className="w-64 mx-auto border-t border-black pt-1 mt-12">
            <p className="font-bold uppercase">{relatorio.responsavel_nome}</p>
            <p className="text-xs">{relatorio.responsavel_crea}</p>
          </div>
        </div>
      </div>

      {/* PÁGINA 5 — ATERRAMENTO */}
      <div className="page-container page-break text-sm">
        <div className="font-bold text-lg tracking-tight mb-4">RADIAL ENERGIA</div>
        <h2 className="text-xl font-bold mb-6 text-center bg-gray-200 py-1 uppercase border border-black">Relatório de Inspeção e Testes - Aterramento</h2>
        
        <div className="border border-black p-2 mb-4 grid grid-cols-2 gap-2">
          <p><strong>Cliente:</strong> {relatorio.cliente_nome}</p>
          <p><strong>Data:</strong> {format(parseISO(relatorio.data_execucao), 'dd/MM/yyyy')}</p>
          <p><strong>Obra:</strong> {relatorio.cliente_cidade}</p>
          <p><strong>Projeto:</strong> Cabine Primária</p>
        </div>

        <div className="border border-black p-2 mb-6">
          <p className="font-bold mb-2">Características:</p>
          <div className="grid grid-cols-2 gap-2">
            <p><strong>Qtde Hastes:</strong> {relatorio.aterramento_qtde_hastes}</p>
            <p><strong>Tipo:</strong> {relatorio.aterramento_tipo}</p>
            <p><strong>Comprimento:</strong> {relatorio.aterramento_comprimento || '--'}</p>
            <p><strong>Bitola:</strong> {relatorio.aterramento_bitola}</p>
            <p><strong>Instrumento:</strong> {relatorio.aterramento_instrumento || '--'}</p>
            <p><strong>Série:</strong> {relatorio.aterramento_serie_instrumento || '--'}</p>
          </div>
        </div>

        <h3 className="font-bold mb-2">Leituras Ôhmicas (Ω)</h3>
        <table className="w-full border-collapse border border-black text-center mb-8">
          <thead>
            <tr className="bg-gray-200">
              {val.aterramento.map((_: any, i: number) => (
                <th key={i} className="border border-black p-2">Haste {i+1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {val.aterramento.map((v: number, i: number) => (
                <td key={i} className="border border-black p-2 font-bold">{v}</td>
              ))}
            </tr>
          </tbody>
        </table>

        <div className="mt-8 border-t border-black pt-4 text-center">
          <p className="font-bold mb-4">CONCLUSÃO:</p>
          <p className="italic mb-8">Aterramento dentro das normas exigidas, podendo a cabine primária ser energizada.</p>
          <div className="w-64 mx-auto border-t border-black pt-1 mt-12">
            <p className="font-bold uppercase">{relatorio.responsavel_nome}</p>
            <p className="text-xs">{relatorio.responsavel_crea}</p>
          </div>
        </div>
      </div>

      {/* PÁGINA 6 — MEGGER */}
      <div className="page-container page-break text-sm">
        <div className="font-bold text-lg tracking-tight mb-4">RADIAL ENERGIA</div>
        <h2 className="text-xl font-bold mb-6 text-center bg-gray-200 py-1 uppercase border border-black">Relatório de Inspeção e Testes - Megger</h2>
        
        <div className="border border-black p-2 mb-6 grid grid-cols-2 gap-2">
          <p><strong>Cliente:</strong> {relatorio.cliente_nome}</p>
          <p><strong>Data:</strong> {format(parseISO(relatorio.data_execucao), 'dd/MM/yyyy')}</p>
          <p><strong>Cabo:</strong> {relatorio.cabo_de} / {relatorio.cabo_para}</p>
          <p><strong>Tensão de Teste:</strong> {relatorio.megger_tensao_teste}</p>
        </div>

        <h3 className="font-bold mb-2">Resistência de Isolamento (MΩ)</h3>
        <table className="w-full border-collapse border border-black text-center mb-8">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-black p-2">RxS</th>
              <th className="border border-black p-2">RxT</th>
              <th className="border border-black p-2">SxT</th>
              <th className="border border-black p-2">RxMassa</th>
              <th className="border border-black p-2">SxMassa</th>
              <th className="border border-black p-2">TxMassa</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black p-2 font-bold">{val.megger.RxS}</td>
              <td className="border border-black p-2 font-bold">{val.megger.RxT}</td>
              <td className="border border-black p-2 font-bold">{val.megger.SxT}</td>
              <td className="border border-black p-2 font-bold">{val.megger.RxMassa}</td>
              <td className="border border-black p-2 font-bold">{val.megger.SxMassa}</td>
              <td className="border border-black p-2 font-bold">{val.megger.TxMassa}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-8 border-t border-black pt-4 text-center">
          <p className="font-bold mb-4">CONCLUSÃO:</p>
          <p className="italic mb-8">Ensaio realizado obtendo resultados satisfatórios, podendo o cabo ser energizado e utilizado em suas totais funcionalidades.</p>
          <div className="w-64 mx-auto border-t border-black pt-1 mt-12">
            <p className="font-bold uppercase">{relatorio.responsavel_nome}</p>
            <p className="text-xs">{relatorio.responsavel_crea}</p>
          </div>
        </div>
      </div>

      {/* PÁGINA 7 — TRANSFORMADOR PLACEHOLDER */}
      <div className="page-container page-break flex flex-col items-center justify-center text-center">
        <div className="font-bold text-xl tracking-tight mb-12 absolute top-8 left-8">RADIAL ENERGIA</div>
        <h2 className="text-3xl font-bold mb-4 text-gray-400">FICHA DE ENSAIO DO TRANSFORMADOR</h2>
        <p className="text-gray-500 italic">— a ser vinculada —</p>
      </div>

      {/* PÁGINA 8 — CREA */}
      <div className="page-container flex flex-col items-center justify-center text-center">
        <div className="font-bold text-xl tracking-tight mb-12 absolute top-8 left-8">RADIAL ENERGIA</div>
        <h2 className="text-3xl font-bold mb-12 border-b-2 border-black pb-2">RESPONSÁVEL TÉCNICO</h2>
        
        <div className="text-2xl space-y-4">
          <p className="font-bold">{relatorio.responsavel_nome}</p>
          <p>{relatorio.responsavel_crea}</p>
          <p>Engenheiro Eletricista</p>
        </div>
      </div>

    </div>
  );
}
