'use client';

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PrintButton from './PrintButton';
import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { cancelarRelatorio, deletarRelatorio } from '../actions';

export default function RelatorioPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [relatorio, setRelatorio] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('relatorios_transformador')
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

  const router = useRouter();

  const handleCancelar = async () => {
    if (confirm('Tem certeza? Esta ação não pode ser desfeita.')) {
      const { data: { session } } = await supabase.auth.getSession();
      try {
        await cancelarRelatorio(params.id, session?.access_token, session?.refresh_token);
        window.location.reload();
      } catch (err) {
        alert('Erro ao cancelar relatório.');
      }
    }
  };

  const handleDeletar = async () => {
    if (confirm('Esta ação é permanente e não pode ser desfeita.')) {
      const { data: { session } } = await supabase.auth.getSession();
      try {
        await deletarRelatorio(params.id, session?.access_token, session?.refresh_token);
        router.push('/inspecoes');
      } catch (err) {
        alert('Erro ao deletar relatório.');
      }
    }
  };

  const handleRevisao = () => {
    router.push(`/inspecoes/nova?origem=${params.id}`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-lg font-medium text-gray-600">Carregando ficha técnica...</div>;
  if (relatorio === false || !relatorio) return <div className="min-h-screen flex items-center justify-center text-lg font-medium text-red-600">Relatório não encontrado ou sem permissão de acesso.</div>;

  const dataEnsaio = format(parseISO(relatorio.data_relatorio), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const val = relatorio.valores_calculados;
  
  // Encontra menor tap (normalmente o último do array decrescente)
  const tapMin = Math.min(...relatorio.taps);

  return (
    <div className="min-h-screen bg-gray-100 p-4 pb-20 print:bg-white print:p-0">
      
      {/* Botões de Ação (não aparecem na impressão) */}
      <div className="max-w-5xl mx-auto mb-6 flex flex-col md:flex-row gap-4 justify-between items-center no-print">
        <Link href="/inspecoes" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium">
          <ArrowLeft size={20} />
          Voltar
        </Link>
        <div className="flex items-center gap-4">
          {relatorio.status === 'cancelado' ? (
            <button onClick={handleDeletar} className="text-red-600 hover:text-red-800 font-medium text-sm">Excluir permanentemente</button>
          ) : (
            <>
              <button onClick={handleCancelar} className="text-gray-500 hover:text-gray-700 font-medium text-sm">Cancelar Relatório</button>
              <button onClick={handleRevisao} className="text-blue-600 hover:text-blue-800 font-medium text-sm">Gerar Revisão</button>
            </>
          )}
          <PrintButton />
        </div>
      </div>

      {/* BANNER CANCELADO */}
      {relatorio.status === 'cancelado' && (
        <div className="max-w-5xl mx-auto bg-red-100 text-red-800 font-bold text-center py-2 mb-4 rounded-md print:hidden">
          RELATÓRIO CANCELADO
        </div>
      )}

      {/* Ficha Técnica */}
      <div className="max-w-5xl mx-auto bg-white ficha text-sm text-black shadow-md print:shadow-none print:w-full print:max-w-none ficha-container">
        
        {/* CSS Específico para Impressão */}
        <style dangerouslySetInnerHTML={{__html: `
          @page { 
            size: A4 portrait; 
            margin: 8mm 10mm 8mm 10mm; 
          }
          @media print {
            body { background: white; font-size: 8pt; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .ficha-container { width: 100%; }
            .ficha { border: 2px solid #000; width: 100%; box-shadow: none; margin: 0; }
            .border-print { border-color: #000 !important; }
            .bg-print { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            
            h1, h2 { font-size: 9pt; margin: 1mm 0; }
            h3 { font-size: 8pt; margin: 1mm 0; }
            
            table { font-size: 7.5pt; border-collapse: collapse; width: 100%; page-break-inside: avoid; }
            th, td { padding: 1.5px 3px !important; line-height: 1.2; }
            
            section, .secao { margin-bottom: 0; padding: 0; page-break-inside: avoid; }
            .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
            
            .conclusao { font-size: 7.5pt; padding: 2mm; margin-top: 1mm; }
            .assinatura { margin-top: 2mm; font-size: 8pt; padding-top: 2mm !important; }
          }
          .border-print { border-color: #000; }
        `}} />

        {/* HEADER */}
        <div className="grid grid-cols-3 border-b-2 border-print items-center p-2 secao">
          <div className="font-bold text-lg tracking-tight">RADIAL ENERGIA</div>
          <div className="text-center font-bold text-base leading-tight">FICHA DE ENSAIO<br/>TRANSFORMADOR TRIFÁSICO</div>
          <div className="text-right text-xs font-bold text-red-600 print:text-black">Nº: {relatorio.numero_relatorio}</div>
        </div>

        {/* INFO GRID (CABEÇALHO) */}
        <div className="grid grid-cols-2 divide-x-2 border-b-2 divide-print border-print secao">
          {/* Coluna Esquerda: Dados do Cliente */}
          <div className="p-2 space-y-0.5">
            <p><strong>Cliente:</strong> {relatorio.cliente_nome}</p>
            <p><strong>Endereço:</strong> {relatorio.cliente_endereco}</p>
            <p><strong>Cidade/UF:</strong> {relatorio.cliente_cidade} - {relatorio.cliente_uf}</p>
            <p><strong>Observações:</strong> {relatorio.observacoes || 'Nenhuma'}</p>
            <div className="mt-2 pt-2 border-t border-print">
              <p><strong>Temperatura:</strong> {val.temperaturaC} °C &nbsp;|&nbsp; <strong>Umidade:</strong> {relatorio.umidade_relativa || '--'}%</p>
            </div>
          </div>
          {/* Coluna Direita: Características Técnicas */}
          <div className="p-2">
            <h3 className="font-bold text-center border-b border-print pb-1 mb-1">CARACTERÍSTICAS TÉCNICAS</h3>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              <p><strong>Nº de Série:</strong> {relatorio.numero_serie || 'S/N'}</p>
              <p><strong>Potência:</strong> {relatorio.potencia_kva} kVA</p>
              <p><strong>AT:</strong> {relatorio.tensao_at_nominal} a {tapMin} V</p>
              <p><strong>BT:</strong> {relatorio.tensao_bt_label}</p>
              <p><strong>Fases:</strong> 3</p>
              <p><strong>Hz:</strong> 60</p>
              <p><strong>Classe:</strong> 15 kV</p>
              <p><strong>Resfriamento:</strong> {relatorio.resfriamento}</p>
              <p><strong>Polaridade:</strong> {relatorio.grupo_ligacao}</p>
              <p><strong>Fabricante:</strong> {relatorio.fabricante || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* RELAÇÃO DE TRANSFORMAÇÃO */}
        <div className="border-b-2 border-print break-inside-avoid secao">
          <div className="py-1 px-2 border-b border-print text-left font-bold">
            TENSÃO DE DESPACHO AT: {Number(relatorio.tap_despacho).toLocaleString('pt-BR')} V
          </div>
          <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Relação de Transformação</div>
          <table className="w-full text-center divide-y-2 divide-print">
            <thead>
              <tr className="divide-x-2 divide-print">
                <th className="py-1 px-2 w-40 bg-gray-50 bg-print text-left">TAP [V]:</th>
                {val.taps.map((t: any) => (
                  <th key={t.tensaoAt} className="py-1 px-2">{t.tensaoAt}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-print">
              <tr className="divide-x-2 divide-print">
                <td className="py-1 px-2 font-semibold bg-gray-50 bg-print text-left">FASE 1</td>
                {val.taps.map((t: any) => <td key={t.tensaoAt} className="py-1 px-2">{t.relH1H2}</td>)}
              </tr>
              <tr className="divide-x-2 divide-print">
                <td className="py-1 px-2 font-semibold bg-gray-50 bg-print text-left">FASE 2</td>
                {val.taps.map((t: any) => <td key={t.tensaoAt} className="py-1 px-2">{t.relH2H3}</td>)}
              </tr>
              <tr className="divide-x-2 divide-print">
                <td className="py-1 px-2 font-semibold bg-gray-50 bg-print text-left">FASE 3</td>
                {val.taps.map((t: any) => <td key={t.tensaoAt} className="py-1 px-2">{t.relH3H1}</td>)}
              </tr>
              <tr className="divide-x-2 divide-print border-t-2 border-print">
                <td className="py-1 px-2 font-semibold bg-gray-100 bg-print text-left">ERRO [%]:</td>
                {val.taps.map((t: any) => {
                  const max = Math.max(t.relH1H2, t.relH2H3, t.relH3H1);
                  const min = Math.min(t.relH1H2, t.relH2H3, t.relH3H1);
                  const erro = ((max - min) / t.relacaoTeorica) * 100;
                  return <td key={t.tensaoAt} className="py-1 px-2 font-bold text-red-600 print:text-black">{erro.toFixed(2)}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* CORRENTES NOMINAIS */}
        <div className="border-b-2 border-print break-inside-avoid secao">
          <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Correntes Nominais</div>
          <table className="w-full text-center divide-y-2 divide-print">
            <tbody className="divide-y-2 divide-print">
              <tr className="divide-x-2 divide-print font-semibold">
                <td className="py-1 px-2 w-16 bg-gray-50 bg-print">V</td>
                {val.taps.map((t: any) => <td key={`v-${t.tensaoAt}`} className="py-1 px-2">{t.tensaoAt}</td>)}
                <td className="py-1 px-2 bg-gray-200 bg-print">{relatorio.tensao_bt_label}</td>
              </tr>
              <tr className="divide-x-2 divide-print">
                <td className="py-1 px-2 w-16 font-semibold bg-gray-50 bg-print">A</td>
                {val.taps.map((t: any) => <td key={`a-${t.tensaoAt}`} className="py-1 px-2">{t.correnteAt}</td>)}
                <td className="py-1 px-2 font-bold bg-gray-100 bg-print">{val.correnteBt}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PERDAS EM VAZIO E CARGA */}
        <div className="grid grid-cols-2 divide-x-2 divide-print border-b-2 border-print break-inside-avoid secao">
          {/* VAZIO */}
          <div>
            <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Perdas em Vazio</div>
            <table className="w-full text-center divide-y-2 divide-print">
              <thead>
                <tr className="divide-x-2 divide-print bg-gray-50 bg-print">
                  <th className="py-1 px-2">I1 (A)</th>
                  <th className="py-1 px-2">I2 (A)</th>
                  <th className="py-1 px-2">I3 (A)</th>
                  <th className="py-1 px-2">I Méd (A)</th>
                  <th className="py-1 px-2">P (W)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2">{val.perdaVazioI1}</td>
                  <td className="py-1 px-2">{val.perdaVazioI2}</td>
                  <td className="py-1 px-2">{val.perdaVazioI3}</td>
                  <td className="py-1 px-2">{val.perdaVazioImed}</td>
                  <td className="py-1 px-2">{val.perdaVazioP}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* CARGA */}
          <div>
            <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Perdas em Carga e Impedância</div>
            <table className="w-full text-center divide-y-2 divide-print">
              <thead>
                <tr className="divide-x-2 divide-print bg-gray-50 bg-print">
                  <th className="py-1 px-2">IN (A)</th>
                  <th className="py-1 px-2">Vcc (V)</th>
                  <th className="py-1 px-2">Z (%)</th>
                  <th className="py-1 px-2">P a 22°C (W)</th>
                  <th className="py-1 px-2">P a 75°C (W)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2">{val.correnteBt}</td>
                  <td className="py-1 px-2">{val.tensaoCurtoCircuito}</td>
                  <td className="py-1 px-2">{val.impedanciaPercent75}</td>
                  <td className="py-1 px-2">{val.perdaCargaPcc22}</td>
                  <td className="py-1 px-2">{val.perdaCargaPcc75}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* TENSÃO APLICADA E INDUZIDA */}
        <div className="grid grid-cols-2 divide-x-2 divide-print border-b-2 border-print items-start break-inside-avoid secao">
          <div className="w-full">
            <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Tensão Aplicada</div>
            <table className="w-full text-left divide-y-2 divide-print">
              <tbody className="divide-y-2 divide-print">
                <tr className="divide-x-2 divide-print">
                  <td colSpan={2} className="py-1 px-2 font-bold text-center bg-gray-50 bg-print">TENSÃO APLICADA EM 60 Hz</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print w-3/5">Tempo [s]</td>
                  <td className="py-1 px-2 text-center w-2/5">60</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">AT x BT [kV]</td>
                  <td className="py-1 px-2 text-center">{val.tensaoAplicadaPrimKv}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">AT x Massa [kV]</td>
                  <td className="py-1 px-2 text-center">{val.tensaoAplicadaPrimKv}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">BT x Massa [kV]</td>
                  <td className="py-1 px-2 text-center">{val.tensaoAplicadaSecKv}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="w-full">
            <div className="bg-gray-100 bg-print py-1 px-2 font-bold italic text-center border-b-2 border-print uppercase">Tensão Induzida</div>
            <table className="w-full text-left divide-y-2 divide-print">
              <tbody className="divide-y-2 divide-print">
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print w-3/5">TENSÃO INDUZIDA [V]:</td>
                  <td className="py-1 px-2 w-2/5 text-center">380</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">FREQUÊNCIA [Hz]:</td>
                  <td className="py-1 px-2 text-center">120</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">TEMPO DO ENSAIO [S]:</td>
                  <td className="py-1 px-2 text-center">60</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">MÉTODO DO ENSAIO:</td>
                  <td className="py-1 px-2 text-center">NORMAL</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ISOLAMENTO E RIGIDEZ */}
        <div className="grid grid-cols-2 gap-2 divide-x-2 divide-print border-b-2 border-print items-start break-inside-avoid secao">
          <div className="w-full">
            <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Resistência de Isolamento</div>
            <table className="w-full text-center divide-y-2 divide-print">
              <thead>
                <tr className="divide-x-2 divide-print bg-gray-50 bg-print">
                  <th className="py-1 px-2">Posição</th>
                  <th className="py-1 px-2">Tensão Aplicada [V]</th>
                  <th className="py-1 px-2">Resistência [MΩ]</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-print">
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold text-left">AT x BT</td>
                  <td className="py-1 px-2">5000</td>
                  <td className="py-1 px-2 font-bold">{val.isolAtBt}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold text-left">AT x Massa</td>
                  <td className="py-1 px-2">5000</td>
                  <td className="py-1 px-2 font-bold">{val.isolAtMassa}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold text-left">BT x Massa</td>
                  <td className="py-1 px-2">2500</td>
                  <td className="py-1 px-2 font-bold">{val.isolBtMassa}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="w-full">
            <div className="bg-gray-100 bg-print py-1 px-2 font-bold text-center border-b-2 border-print uppercase">Rigidez Dielétrica do Óleo</div>
            <table className="w-full text-left divide-y-2 divide-print">
              <tbody className="divide-y-2 divide-print">
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print w-3/5">Rigidez Dielétrica [kV]</td>
                  <td className="py-1 px-2 text-center w-2/5 font-bold">{val.rigidezKv}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">Temperatura [°C]</td>
                  <td className="py-1 px-2 text-center">{val.temperaturaC}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">Tipo</td>
                  <td className="py-1 px-2 text-center">{relatorio.tipo_oleo}</td>
                </tr>
                <tr className="divide-x-2 divide-print">
                  <td className="py-1 px-2 font-semibold bg-gray-50 bg-print">Procedência</td>
                  <td className="py-1 px-2 text-center">{relatorio.procedencia_oleo}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CONCLUSÃO TÉCNICA */}
        <div className="p-3 border-b-2 border-print bg-[#f5f5f5] bg-print break-inside-avoid secao conclusao">
          <h3 className="font-bold uppercase mb-1 text-center">Conclusão Técnica</h3>
          <p className="italic text-justify leading-snug">
            Os ensaios realizados neste equipamento apresentaram resultados dentro dos limites estabelecidos pelas normas ABNT NBR 5356 e ABNT NBR IEC 60156, abrangendo os ensaios de relação de transformação, correntes nominais, perdas em vazio, perdas em carga e impedância, tensão aplicada, tensão induzida, resistência de isolamento e rigidez dielétrica do óleo isolante.
            <br/><br/>
            Com base nos resultados obtidos, o transformador encontra-se em condições técnicas satisfatórias, estando apto para energização e operação em plena carga dentro de suas especificações nominais.
          </p>
        </div>

        {/* FOOTER */}
        <div className="p-4 pt-8 flex justify-between items-end bg-white assinatura break-inside-avoid">
          <div>
            <p className="uppercase font-bold">São Paulo, {dataEnsaio}</p>
          </div>
          <div className="text-center border-t-2 border-print pt-1 px-8 min-w-[250px]">
            <p className="font-bold uppercase">{relatorio.responsavel_nome}</p>
            <p className="uppercase text-xs mb-0.5">Resp. Técnico</p>
            <p className="font-mono text-xs">{relatorio.responsavel_crea}</p>
          </div>
        </div>

      </div>
    </div>
  );
}
