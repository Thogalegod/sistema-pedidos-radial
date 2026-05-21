'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getUrlArquivo } from '@/lib/storage';
import { creaBase64 } from '@/lib/creaBase64';
import { formatarDataHora, pontosAquecidosPorSetorLocal, TermografiaClassificacao, TermografiaPonto, TermografiaRelatorio } from '@/lib/termografia/types';

type PontoComFotos = TermografiaPonto & {
  fotoDigitalSrc?: string | null;
  fotoTermicaSrc?: string | null;
};

const prioridadeClassificacao = ['Crítico', 'Intervenção Imediata', 'Intervenção Programada', 'Observação', 'Normal'];

function classificacaoDaLinha(pontos: TermografiaPonto[]) {
  const classificacoes = pontos
    .filter((p) => p.ocorrencia)
    .map((p) => p.classificacao || 'Intervenção Programada');
  return prioridadeClassificacao.find((c) => classificacoes.includes(c as TermografiaClassificacao)) || 'Normal';
}

function corClassificacao(classificacao: string) {
  if (classificacao === 'Crítico') return '#dc2626';
  if (classificacao === 'Intervenção Imediata') return '#ca8a04';
  if (classificacao === 'Intervenção Programada') return '#16a34a';
  if (classificacao === 'Observação') return '#2563eb';
  return '#6b7280';
}

function temperaturaComUnidade(valor?: string) {
  if (!valor) return '';
  return /º|°|c$/i.test(valor.trim()) ? valor : `${valor} ºC`;
}

export default function TermografiaPrintViewer(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const incluirFotosSemOcorrencia = searchParams.get('fotos') === '1';
  const [data, setData] = useState<TermografiaRelatorio | null | false>(null);
  const [pontos, setPontos] = useState<PontoComFotos[]>([]);

  useEffect(() => {
    supabase
      .from('relatorios_termografia')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data: rel, error }) => {
        setData(error ? false : rel as TermografiaRelatorio);
      });
  }, [params.id]);

  useEffect(() => {
    if (!data) return;
    let ativo = true;
    Promise.all((data.pontos ?? []).map(async (ponto) => ({
      ...ponto,
      fotoDigitalSrc: ponto.fotoDigitalUrl ? await getUrlArquivo(ponto.fotoDigitalUrl) : null,
      fotoTermicaSrc: ponto.fotoTermicaUrl ? await getUrlArquivo(ponto.fotoTermicaUrl) : null,
    }))).then((res) => {
      if (ativo) setPontos(res);
    });
    return () => { ativo = false; };
  }, [data]);

  const roteiro = useMemo(() => pontosAquecidosPorSetorLocal(pontos), [pontos]);
  const ocorrencias = pontos.filter((p) => p.ocorrencia);
  const registrosSemOcorrencia = pontos.filter((p) => !p.ocorrencia && (p.fotoDigitalSrc || p.fotoTermicaSrc || p.fotoDigitalUrl || p.fotoTermicaUrl));
  const paginasRegistrosSemOcorrencia = Array.from(
    { length: incluirFotosSemOcorrencia ? Math.ceil(registrosSemOcorrencia.length / 2) : 0 },
    (_, i) => registrosSemOcorrencia.slice(i * 2, i * 2 + 2)
  );
  const totalFolhas = 5 + Math.max(1, Math.ceil(roteiro.length / 34)) + paginasRegistrosSemOcorrencia.length + ocorrencias.length + 2;

  if (data === false) return <div className="p-8 text-center text-red-600">Relatório não encontrado.</div>;
  if (!data) return <div className="p-8 text-center">Carregando relatório para impressão...</div>;

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
          <span>FL.: {fl}/{totalFolhas}</span>
        </div>
      </div>
    </div>
  );

  const Footer = () => (
    <div className="mt-6 pt-2 border-t border-gray-300 text-center text-xs text-gray-500 w-full no-print">
      {data.responsavel_nome} - Engenheiro Eletricista - CREA {data.responsavel_crea}
    </div>
  );

  const paginasRoteiro = Array.from({ length: Math.max(1, Math.ceil(roteiro.length / 34)) }, (_, i) => roteiro.slice(i * 34, i * 34 + 34));
  let folha = 1;

  return (
    <div className="bg-gray-100 min-h-screen pb-10 print:bg-white text-gray-900">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0 !important; padding: 0 !important; width: 190mm !important; background: white !important; }
          .page-break { page-break-after: always; break-after: page; }
          .page-break:last-child { page-break-after: avoid; break-after: avoid; }
          .page-container { margin: 0 !important; padding: 0 !important; max-width: none !important; box-shadow: none !important; width: 190mm !important; height: 276mm !important; min-height: 276mm !important; box-sizing: border-box !important; overflow: hidden !important; }
          table { font-size: 8pt; width: 100%; border-collapse: collapse; }
          th { background-color: #1e3a5f !important; color: white !important; padding: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; border: 1px solid #ccc; text-align: left; }
          td { padding: 4px; border: 1px solid #ccc; }
          tr:nth-child(even) td { background-color: #f5f7fa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .section-title { color: #1e6db5 !important; font-weight: bold; font-size: 11pt; margin-top: 10px; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        }
        .page-container { background: white; max-width: 210mm; margin: 20px auto; padding: 10mm; box-shadow: 0 4px 6px rgba(0,0,0,0.1); position: relative; box-sizing: border-box; }
        .page-container table { font-size: 9pt; width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .page-container th { background-color: #1e3a5f; color: white; padding: 4px; border: 1px solid #ccc; text-align: left; }
        .page-container td { padding: 4px; border: 1px solid #ccc; }
        .page-container tr:nth-child(even) td { background-color: #f5f7fa; }
        .section-title { color: #1e6db5; font-weight: bold; font-size: 12pt; margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
      `}} />

      <div className="text-center p-4 no-print bg-white border-b sticky top-0 z-50 shadow-sm flex justify-between items-center max-w-4xl mx-auto">
        <button onClick={() => router.push(`/termografia/${data.id}`)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">← Voltar</button>
        <h2 className="font-bold">Página de Impressão</h2>
        <button onClick={() => window.print()} className="bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 font-bold">Imprimir Agora</button>
      </div>

      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <h1 className="text-3xl font-bold text-blue-900 mb-4 tracking-wide">RELATÓRIO TÉCNICO</h1>
          <h2 className="text-xl font-semibold text-gray-700 mb-8">INSPEÇÃO TERMOGRÁFICA</h2>
          <div className="w-full max-w-2xl text-left text-sm">
            <table><tbody>
              <tr><th>Cliente</th><td>{data.cliente_nome}</td></tr>
              <tr><th>Local de execução</th><td>{data.cliente_endereco} {data.cliente_cidade && `- ${data.cliente_cidade}/${data.cliente_uf}`}</td></tr>
              <tr><th>Data de execução</th><td>{data.data_execucao?.split('-').reverse().join('/')}</td></tr>
              <tr><th>Objetivo</th><td>{data.objetivo}</td></tr>
            </tbody></table>
          </div>
        </div>
        <Footer />
      </div>

      <div className="page-container page-break" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="section-title">Índice</div>
        <table><tbody>
          <tr><td>1. Objetivos</td><td className="text-right">3</td></tr>
          <tr><td>2. Termos comuns à inspeção termográfica</td><td className="text-right">3</td></tr>
          <tr><td>3. Responsáveis pela inspeção termográfica</td><td className="text-right">4</td></tr>
          <tr><td>4. Equipamento utilizado</td><td className="text-right">4</td></tr>
          <tr><td>5. Utilidades da inspeção termográfica</td><td className="text-right">5</td></tr>
          <tr><td>6. Critério flexível de classificação de aquecimentos</td><td className="text-right">5</td></tr>
          <tr><td>7. Resultados e roteiro</td><td className="text-right">6</td></tr>
          <tr><td>8. Fichas de ocorrência</td><td className="text-right">Após roteiro</td></tr>
          <tr><td>9. CREA responsável técnico</td><td className="text-right">Anexo II</td></tr>
        </tbody></table>
        <Footer />
      </div>

      <div className="page-container page-break" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="section-title">1. Objetivos</div>
        <p className="text-justify text-[9pt]">Na realização de uma inspeção termográfica em sistemas elétricos, busca-se detectar processos de falha por anomalias térmicas antes da interrupção da função, quantificar o risco associado e orientar a manutenção preventiva dos componentes inspecionados.</p>
        <div className="section-title">2. Termos comuns à inspeção termográfica</div>
        <p className="text-justify text-[9pt]">Inspeção termográfica é uma técnica de inspeção não destrutiva realizada com sistemas infravermelhos para medição de temperaturas e observação de padrões diferenciais de distribuição de calor em componentes, equipamentos ou processos.</p>
        <div className="section-title">3. Responsáveis pela inspeção termográfica</div>
        <p className="text-justify text-[9pt]">O inspetor de termografia é o profissional habilitado a realizar as inspeções, registrar imagens e documentar as informações térmicas pertinentes. O analista classifica as anomalias encontradas segundo critérios pré-estabelecidos.</p>
        <div className="section-title">4. Equipamento utilizado</div>
        <table><tbody><tr><th>Equipamento</th><td>{data.equipamento}</td></tr><tr><th>Faixa de temperatura</th><td>-10ºC a 350ºC</td></tr><tr><th>Faixa espectral</th><td>7,5 a 13 µm</td></tr></tbody></table>
        <Footer />
      </div>

      <div className="page-container page-break" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="section-title">5. Utilidades da inspeção termográfica</div>
        <p className="text-justify text-[9pt]">A termografia integra programas de manutenção preventiva e confiabilidade, especialmente em instalações elétricas, permitindo localizar componentes aquecidos, mau contato, oxidação, desgaste ou condições que possam causar interrupções produtivas.</p>
        <div className="section-title">6. Critério flexível de classificação de aquecimentos</div>
        <table>
          <thead><tr><th>Classificação</th><th>Diagnóstico</th><th>Prazo recomendável</th></tr></thead>
          <tbody>
            <tr><td>Crítico</td><td>Falha iminente</td><td>Intervenção urgente</td></tr>
            <tr><td>Intervenção Imediata</td><td>Falha potencial</td><td>Até 14 dias</td></tr>
            <tr><td>Intervenção Programada</td><td>Falha provável</td><td>Até 21 dias</td></tr>
            <tr><td>Observação</td><td>Suspeita de falha</td><td>Acompanhamento periódico</td></tr>
            <tr><td>Normal</td><td>Sem anomalia térmica relevante</td><td>Rotina normal</td></tr>
          </tbody>
        </table>
        <div className="section-title">7. Resultados</div>
        <p className="text-justify text-[9pt]">A relação dos pontos inspecionados e das ocorrências detectadas é apresentada no ANEXO I deste relatório, com indicação do setor, local, quantidade de pontos aquecidos e fichas fotográficas correspondentes.</p>
        <Footer />
      </div>

      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <h1 className="text-5xl font-bold text-gray-800 mb-4 tracking-widest">ANEXO I</h1>
          <h2 className="text-2xl font-medium text-gray-600">Relação de fotos e ocorrências</h2>
        </div>
        <Footer />
      </div>

      {paginasRoteiro.map((linhas, paginaIndex) => (
        <div key={paginaIndex} className="page-container page-break" style={{ minHeight: '277mm' }}>
          <Header fl={folha++} />
          <div className="section-title">Termografia / Roteiro</div>
          <table>
            <thead><tr><th>Setor/área</th><th>Local</th><th className="text-center">Pontos aquecidos</th><th className="text-center">Classificação</th><th className="text-center">Inspecionado</th></tr></thead>
            <tbody>
              {linhas.map((linha, i) => {
                const classificacao = classificacaoDaLinha(pontos.filter((p) => p.setor === linha.setor && p.local === linha.local));
                return (
                  <tr key={`${linha.setor}-${linha.local}-${i}`}>
                    <td>{linha.setor}</td><td>{linha.local}</td><td className="text-center">{linha.pontosAquecidos}</td>
                    <td className="text-center font-bold" style={{ color: corClassificacao(classificacao) }}>{classificacao}</td>
                    <td className="text-center">s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Footer />
        </div>
      ))}

      {paginasRegistrosSemOcorrencia.map((registros, paginaIndex) => (
        <div key={`registro-${paginaIndex}`} className="page-container page-break" style={{ minHeight: '277mm' }}>
          <Header fl={folha++} />
          <div className="section-title">Registros Fotográficos Sem Ocorrência</div>
          <div className="grid grid-cols-1 gap-4">
            {registros.map((registro, index) => (
              <div key={registro.id} className="border border-gray-300 p-2">
                <div className="font-bold text-sm mb-2">{paginaIndex * 2 + index + 1}. {registro.setor} - {registro.local}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-center font-bold text-xs mb-1">Foto digital</div>
                    {registro.fotoDigitalSrc ? <img src={registro.fotoDigitalSrc} alt="Foto digital" className="w-full h-[78mm] object-contain border" /> : <div className="h-[78mm] border flex items-center justify-center text-gray-400">Sem foto</div>}
                  </div>
                  <div>
                    <div className="text-center font-bold text-xs mb-1">Foto Termográfica</div>
                    {registro.fotoTermicaSrc ? <img src={registro.fotoTermicaSrc} alt="Foto termográfica" className="w-full h-[78mm] object-contain border" /> : <div className="h-[78mm] border flex items-center justify-center text-gray-400">Sem foto</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Footer />
        </div>
      ))}

      {ocorrencias.map((ocorrencia, index) => {
        const { data: dataFoto, hora } = formatarDataHora(ocorrencia.dataHoraFoto);
        const classificacao = ocorrencia.classificacao || 'Intervenção Programada';
        const risco = ocorrencia.risco || 'Baixo';
        const conclusao = ocorrencia.conclusao || 'Desconectar, limpar e reconectar. Reapertar conexão.';
        return (
          <div key={ocorrencia.id} className="page-container page-break" style={{ minHeight: '277mm' }}>
            <Header fl={folha++} />
            <div className="section-title">Ficha de Acompanhamento de Ocorrência</div>
            <table><tbody>
              <tr><th>Ocorrência</th><td>{index + 1}</td><th>Data</th><td>{dataFoto || data.data_execucao?.split('-').reverse().join('/')}</td><th>Hora</th><td>{hora}</td><th>Temp.</th><td>{temperaturaComUnidade(ocorrencia.temperatura)}</td></tr>
              <tr><th>Setor</th><td colSpan={3}>{ocorrencia.setor}</td><th>Local</th><td colSpan={3}>{ocorrencia.local}</td></tr>
              <tr><th>Componente</th><td colSpan={7}>{ocorrencia.componente || '-'}</td></tr>
              <tr><th>Classificação</th><td colSpan={3}>{classificacao}</td><th>Risco</th><td colSpan={3}>{risco}</td></tr>
              <tr><th>Conclusão</th><td colSpan={7}>{conclusao}</td></tr>
            </tbody></table>
            <div className="section-title">Registros Fotográficos</div>
            <div className="grid grid-cols-2 gap-4">
              <div><div className="text-center font-bold text-sm mb-2">Foto digital</div>{ocorrencia.fotoDigitalSrc ? <img src={ocorrencia.fotoDigitalSrc} alt="Foto digital" className="w-full h-[130mm] object-contain border" /> : <div className="h-[130mm] border flex items-center justify-center text-gray-400">Sem foto</div>}</div>
              <div><div className="text-center font-bold text-sm mb-2">Foto Termográfica</div>{ocorrencia.fotoTermicaSrc ? <img src={ocorrencia.fotoTermicaSrc} alt="Foto termográfica" className="w-full h-[130mm] object-contain border" /> : <div className="h-[130mm] border flex items-center justify-center text-gray-400">Sem foto</div>}</div>
            </div>
            <Footer />
          </div>
        );
      })}

      <div className="page-container page-break" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="section-title">Declaração de Normalização</div>
        <p className="text-justify text-[10pt]">Considerando-se que todos os pontos da inspeção encontram-se devidamente verificados pelos analistas responsáveis, esta inspeção é considerada normalizada pelos padrões e metodologia desenvolvidos pela Radial Energia, ressalvadas as ocorrências e recomendações descritas neste relatório.</p>
        <p className="mt-8 text-[10pt]">Documento emitido em: {new Date().toLocaleDateString('pt-BR')}</p>
        <p className="mt-4 text-[10pt]">Recomendamos novo relatório em 6 meses da data de emissão, conforme prática de manutenção preventiva e acompanhamento termográfico.</p>
        <div className="mt-24 text-center w-80 mx-auto">
          <div className="border-b border-gray-800 mb-2"></div>
          <div className="font-bold">{data.responsavel_nome}</div>
          <div>Engenheiro eletricista</div>
          <div>CREA: {data.responsavel_crea}</div>
        </div>
        <Footer />
      </div>

      <div className="page-container page-break flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <h1 className="text-5xl font-bold text-gray-800 mb-4 tracking-widest">ANEXO II</h1>
          <h2 className="text-2xl font-medium text-gray-600">CREA Eng. Responsável</h2>
        </div>
        <Footer />
      </div>

      <div className="page-container flex flex-col" style={{ minHeight: '277mm' }}>
        <Header fl={folha++} />
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <img src={creaBase64} alt="CREA responsável técnico" className="w-full max-w-2xl object-contain" style={{ maxHeight: '220mm' }} />
        </div>
        <Footer />
      </div>
    </div>
  );
}
