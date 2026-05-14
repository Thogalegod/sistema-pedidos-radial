'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'react-hot-toast';
import { criarRelatorioTransformador, criarRevisao } from '../actions';
import { TensaoBT, POTENCIAS_DISPONIVEIS, TAPS_PADRAO_13800, TENSOES_BT, TransformerInput } from '@/lib/transformer-calc';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';

export default function NovaInspecaoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Carregando...</div>}>
      <NovaInspecaoForm />
    </Suspense>
  );
}

function NovaInspecaoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const origemId = searchParams.get('origem');
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [clienteNome, setClienteNome] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [clienteCidade, setClienteCidade] = useState('');
  const [clienteUf, setClienteUf] = useState('');
  const [clienteCnpj, setClienteCnpj] = useState('');
  const [clienteIe, setClienteIe] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [fabricante, setFabricante] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [potenciaKva, setPotenciaKva] = useState<number>(112.5);
  const [tensaoAtNominal, setTensaoAtNominal] = useState<number>(13800);
  const [tensaoBt, setTensaoBt] = useState<TensaoBT>('380');
  const [resfriamento, setResfriamento] = useState('LN');
  const [grupoLigacao, setGrupoLigacao] = useState('Subtrativa');
  const [tipoOleo, setTipoOleo] = useState('Mineral');
  const [procedenciaOleo, setProcedenciaOleo] = useState('BR');

  const [tapsString, setTapsString] = useState(TAPS_PADRAO_13800.join(', '));
  const [tapDespacho, setTapDespacho] = useState<number>(13800);

  const [responsavelNome, setResponsavelNome] = useState('Roberto Fontes Lopes');
  const [responsavelCrea, setResponsavelCrea] = useState('CREA 060.104.922.9');
  
  // Format today's date to YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];
  const [dataRelatorio, setDataRelatorio] = useState(today);
  const [temperaturaC, setTemperaturaC] = useState<number>(26);
  const [umidadeRelativa, setUmidadeRelativa] = useState<number | ''>('');

  // Parsed taps from string
  const tapsArray = tapsString.split(/[\s,]+/).map(t => parseInt(t, 10)).filter(t => !isNaN(t));

  useEffect(() => {
    if (origemId) {
      supabase.from('relatorios_transformador').select('*').eq('id', origemId).single().then(({ data, error }) => {
        if (data && !error) {
          setClienteNome(data.cliente_nome);
          setClienteEndereco(data.cliente_endereco);
          setClienteCidade(data.cliente_cidade);
          setClienteUf(data.cliente_uf);
          setClienteCnpj(data.cliente_cnpj || '');
          setClienteIe(data.cliente_ie || '');
          // Não copia observações, ou copia vazio para o usuário preencher algo novo
          setObservacoes('');
          
          setFabricante(data.fabricante || '');
          setNumeroSerie(data.numero_serie || '');
          setPotenciaKva(data.potencia_kva);
          setTensaoAtNominal(data.tensao_at_nominal);
          setTensaoBt(data.tensao_bt);
          setResfriamento(data.resfriamento);
          setGrupoLigacao(data.grupo_ligacao);
          setTipoOleo(data.tipo_oleo);
          setProcedenciaOleo(data.procedencia_oleo);
          
          setTapsString(data.taps.join(', '));
          setTapDespacho(data.tap_despacho);
          
          setResponsavelNome(data.responsavel_nome);
          setResponsavelCrea(data.responsavel_crea);
          
          setTemperaturaC(data.temperatura_c);
          setUmidadeRelativa(data.umidade_relativa || '');
        }
      });
    }
  }, [origemId]);

  const handleUsarTapsPadrao = () => {
    setTapsString(TAPS_PADRAO_13800.join(', '));
    setTapDespacho(13800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome || !clienteEndereco || !clienteCidade || !clienteUf) {
      toast.error('Preencha os dados obrigatórios do cliente.');
      return;
    }
    if (tapsArray.length === 0) {
      toast.error('Informe pelo menos um tap.');
      return;
    }
    if (!tapsArray.includes(tapDespacho)) {
      toast.error('O tap de despacho deve estar entre os taps informados.');
      return;
    }

    setLoading(true);
    try {
      const input: TransformerInput = {
        clienteNome,
        clienteEndereco,
        clienteCidade,
        clienteUf,
        clienteCnpj,
        clienteIe,
        observacoes,
        fabricante,
        numeroSerie,
        potenciaKva,
        tensaoAtNominal,
        tensaoBt,
        resfriamento,
        grupoLigacao,
        tipoOleo,
        procedenciaOleo,
        taps: tapsArray,
        tapDespacho,
        temperaturaC,
        umidadeRelativa: umidadeRelativa === '' ? undefined : Number(umidadeRelativa),
        dataRelatorio,
        responsavelNome,
        responsavelCrea
      };

      const { data: { session } } = await supabase.auth.getSession();
      
      let result;
      if (origemId) {
        result = await criarRevisao(
          origemId,
          input,
          session?.access_token,
          session?.refresh_token
        );
      } else {
        result = await criarRelatorioTransformador(
          input, 
          session?.access_token, 
          session?.refresh_token
        );
      }
      
      toast.success(`Relatório ${result.numeroRelatorio} gerado!`);
      router.push(`/inspecoes/${result.id}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar relatório.');
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const sectionClass = "bg-white p-6 rounded-lg shadow-sm border border-gray-100 mb-6";
  const titleClass = "text-lg font-semibold text-gray-900 mb-4 pb-2 border-b";

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      <Toaster position="bottom-center" />
      <div className="flex items-center gap-4 mb-6">
        <Link href="/inspecoes" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {origemId ? 'Nova Revisão de Relatório' : 'Novo Relatório de Transformador'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* DADOS DO CLIENTE */}
        <section className={sectionClass}>
          <h2 className={titleClass}>1. Dados do Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Nome do Cliente *</label>
              <input required value={clienteNome} onChange={e => setClienteNome(e.target.value)} className={inputClass} placeholder="Razão social ou nome" />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Endereço *</label>
              <input required value={clienteEndereco} onChange={e => setClienteEndereco(e.target.value)} className={inputClass} placeholder="Rua, número, bairro" />
            </div>
            <div>
              <label className={labelClass}>Cidade *</label>
              <input required value={clienteCidade} onChange={e => setClienteCidade(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>UF *</label>
              <input required value={clienteUf} onChange={e => setClienteUf(e.target.value)} className={inputClass} maxLength={2} placeholder="Ex: SP" />
            </div>
            <div>
              <label className={labelClass}>CNPJ/CPF</label>
              <input value={clienteCnpj} onChange={e => setClienteCnpj(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Inscrição Estadual</label>
              <input value={clienteIe} onChange={e => setClienteIe(e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Observações</label>
              <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} className={inputClass} rows={2} />
            </div>
          </div>
        </section>

        {/* DADOS DO TRANSFORMADOR */}
        <section className={sectionClass}>
          <h2 className={titleClass}>2. Dados do Transformador</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Fabricante</label>
              <input value={fabricante} onChange={e => setFabricante(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Número de Série</label>
              <input value={numeroSerie} onChange={e => setNumeroSerie(e.target.value)} className={inputClass} placeholder="Usado p/ cálculo" />
            </div>
            <div>
              <label className={labelClass}>Potência (kVA) *</label>
              <select value={potenciaKva} onChange={e => setPotenciaKva(Number(e.target.value))} className={inputClass}>
                {POTENCIAS_DISPONIVEIS.map(k => (
                  <option key={k} value={k}>{k} kVA</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tensão AT Nominal (V) *</label>
              <input type="number" value={tensaoAtNominal} onChange={e => setTensaoAtNominal(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tensão BT *</label>
              <select value={tensaoBt} onChange={e => setTensaoBt(e.target.value as TensaoBT)} className={inputClass}>
                {TENSOES_BT.map(bt => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Resfriamento</label>
              <input value={resfriamento} onChange={e => setResfriamento(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Grupo de Ligação</label>
              <input value={grupoLigacao} onChange={e => setGrupoLigacao(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tipo de Óleo</label>
              <input value={tipoOleo} onChange={e => setTipoOleo(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Procedência Óleo</label>
              <input value={procedenciaOleo} onChange={e => setProcedenciaOleo(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        {/* TAPS */}
        <section className={sectionClass}>
          <div className="flex justify-between items-center mb-4 pb-2 border-b">
            <h2 className="text-lg font-semibold text-gray-900">3. Configuração de Taps</h2>
            <button type="button" onClick={handleUsarTapsPadrao} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Usar Padrão 13.8kV
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Taps AT (separados por vírgula ou espaço) *</label>
              <textarea 
                value={tapsString} 
                onChange={e => setTapsString(e.target.value)} 
                className={inputClass} 
                rows={3} 
                placeholder="Ex: 13800, 13200, 12600" 
              />
              <p className="text-xs text-gray-500 mt-1">
                Encontrados: {tapsArray.length > 0 ? tapsArray.join(', ') : 'Nenhum tap válido'}
              </p>
            </div>
            <div>
              <label className={labelClass}>Tap de Despacho (Ativo) *</label>
              <select value={tapDespacho} onChange={e => setTapDespacho(Number(e.target.value))} className={inputClass}>
                {tapsArray.map(t => (
                  <option key={t} value={t}>{t} V</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ENSAIO */}
        <section className={sectionClass}>
          <h2 className={titleClass}>4. Dados do Ensaio</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Data do Relatório *</label>
              <input type="date" required value={dataRelatorio} onChange={e => setDataRelatorio(e.target.value)} className={inputClass} />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className={labelClass}>Temperatura (°C) *</label>
                <input type="number" required min={15} max={45} value={temperaturaC} onChange={e => setTemperaturaC(Number(e.target.value))} className={inputClass} />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Umidade Relativa (%)</label>
                <input type="number" min={0} max={100} value={umidadeRelativa} onChange={e => setUmidadeRelativa(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Responsável Técnico *</label>
              <input required value={responsavelNome} onChange={e => setResponsavelNome(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Registro Profissional (CREA) *</label>
              <input required value={responsavelCrea} onChange={e => setResponsavelCrea(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        {/* SUBMIT */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition-colors disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {loading ? 'Gerando...' : 'Gerar Relatório'}
          </button>
        </div>
      </form>
    </div>
  );
}
