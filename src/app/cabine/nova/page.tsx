'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'react-hot-toast';
import { criarRelatorioCabine } from '../actions';
import { CabineInput } from '@/lib/cabine-calc';
import { ArrowLeft, ArrowRight, Loader2, Save, Check, X } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { uploadArquivo } from '@/lib/storage';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NovaCabinePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  // Step 1 - Cliente & Condições
  const [clienteNome, setClienteNome] = useState('');
  const [clienteCnpj, setClienteCnpj] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [clienteCidade, setClienteCidade] = useState('');
  const [clienteCep, setClienteCep] = useState('');
  
  const today = new Date().toISOString().split('T')[0];
  const [dataExecucao, setDataExecucao] = useState(today);
  const [responsavelNome, setResponsavelNome] = useState('Roberto Fontes Lopes');
  const [responsavelCrea, setResponsavelCrea] = useState('0601049229');
  const [artNumero, setArtNumero] = useState('');
  
  const [artFile, setArtFile] = useState<File | null>(null);
  const [artNome, setArtNome] = useState<string>('');
  const [uploadando, setUploadando] = useState(false);

  const handleArtChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArtFile(file);
      setArtNome(file.name);
    }
  };

  const [clima, setClima] = useState('Bom');
  const [temperatura, setTemperatura] = useState<number | ''>('');
  const [umidade, setUmidade] = useState<number | ''>('');

  // Step 2 - Circuito
  const [caboDe, setCaboDe] = useState('Poste / ponto de entrega');
  const [caboPara, setCaboPara] = useState('Cabine primária blindada');
  const [caboSecao, setCaboSecao] = useState('25mm²');
  const [caboIsolacao, setCaboIsolacao] = useState('EPR');
  const [caboComprimento, setCaboComprimento] = useState('');
  const [caboTerminais, setCaboTerminais] = useState('Polimérico');
  const [caboEmendas, setCaboEmendas] = useState('Não');
  const [caboInstalacao, setCaboInstalacao] = useState('Subterrânea');

  const [hipotInstrumento, setHipotInstrumento] = useState('Instrum HY 60kV');
  const [hipotSerieInstrumento, setHipotSerieInstrumento] = useState('15552');
  const [meggerInstrumento, setMeggerInstrumento] = useState('Uni-T UT513');
  const [meggerSerieInstrumento, setMeggerSerieInstrumento] = useState('C160215986');
  const [aterramentoInstrumento, setAterramentoInstrumento] = useState('Hikari HTR-770');
  const [aterramentoSerieInstrumento, setAterramentoSerieInstrumento] = useState('130919201');
  const [ttrInstrumento, setTtrInstrumento] = useState('Instrum TTR 2000R');
  const [ttrSerieInstrumento, setTtrSerieInstrumento] = useState('906062-15980');

  // Step 3 - Aterramento
  const [aterramentoQtdeHastes, setAterramentoQtdeHastes] = useState<number>(4);
  const [aterramentoTipo, setAterramentoTipo] = useState('Cobre');
  const [aterramentoComprimento, setAterramentoComprimento] = useState('~2,4m');

  // Step 4 - Transformador
  const [trafoPotenciaKva, setTrafoPotenciaKva] = useState<number | ''>('');
  const [trafoTensaoBt, setTrafoTensaoBt] = useState<'220' | '380' | '440'>('380');
  const [trafoNumeroSerie, setTrafoNumeroSerie] = useState('');
  const [trafoFabricante, setTrafoFabricante] = useState('');
  
  const allTaps = [13800, 13200, 12600, 12000, 11400, 10800, 10200];
  const [selectedTaps, setSelectedTaps] = useState<number[]>([13800, 13200, 12600, 12000, 11400]);
  const [tapDespacho, setTapDespacho] = useState<number>(13800);

  const handleTapToggle = (tap: number) => {
    setSelectedTaps(prev => {
      const updated = prev.includes(tap) ? prev.filter(t => t !== tap) : [...prev, tap].sort((a, b) => b - a);
      if (!updated.includes(tapDespacho)) {
        setTapDespacho(updated[0] || 13800);
      }
      return updated;
    });
  };

  const handleNext = () => setStep(s => s + 1);
  const handlePrev = () => setStep(s => s - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 5) {
      handleNext();
      return;
    }
    
    if (!clienteNome || !caboComprimento) {
      toast.error('Preencha todos os dados obrigatórios.');
      return;
    }

    setUploadando(true);
    setLoading(true);
    try {
      let artUrl = null;
      if (artFile) {
        const timestamp = Date.now();
        const caminho = await uploadArquivo(artFile, 'arts', `art-${timestamp}.pdf`);
        artUrl = caminho;
      }

      const input: CabineInput = {
        clienteNome, clienteEndereco, clienteCidade, clienteUf: clienteCidade, clienteCep, clienteCnpj, dataExecucao,
        responsavelNome, responsavelCrea, artNumero, artArquivoUrl: artUrl,
        caboDe, caboPara, caboSecao, caboIsolacao, caboComprimento, caboTerminais, caboEmendas, caboInstalacao,
        caboTemperatura: temperatura === '' ? undefined : Number(temperatura),
        caboUmidade: umidade === '' ? undefined : Number(umidade), caboClima: clima,
        caboBitola: caboSecao, // para compatibilidade
        hipotInstrumento, hipotSerieInstrumento,
        meggerInstrumento, meggerSerieInstrumento,
        aterramentoQtdeHastes, aterramentoTipo, aterramentoComprimento,
        aterramentoInstrumento, aterramentoSerieInstrumento,
        trafoPotenciaKva: trafoPotenciaKva === '' ? undefined : Number(trafoPotenciaKva),
        trafoTensaoBt: trafoPotenciaKva ? trafoTensaoBt : undefined,
        trafoNumeroSerie, trafoFabricante,
        trafoTaps: selectedTaps,
        trafoTapDespacho: tapDespacho
      };

      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await criarRelatorioCabine(input, session?.access_token, session?.refresh_token);
      toast.success('Relatório criado com sucesso!');
      setUploadando(false);
      router.push(`/cabine/${res.id}`);
    } catch (e: any) {
      toast.error('Erro ao salvar relatório: ' + e.message);
      setLoading(false);
      setUploadando(false);
    }
  };

  const inputClass = "w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  const steps = [
    { num: 1, title: 'Cliente' },
    { num: 2, title: 'Circuito' },
    { num: 3, title: 'Aterramento' },
    { num: 4, title: 'Trafo' },
    { num: 5, title: 'ART' },
  ];

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/cabine" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </Link>
          <img src="/logo.png" alt="Radial Energia" className="h-8 object-contain" />
        </div>
        <div className="text-right hidden sm:block">
          <h1 className="text-sm font-bold text-gray-900 leading-tight">RELATÓRIO TÉCNICO DE ENSAIOS ELÉTRICOS</h1>
          <p className="text-xs text-gray-500">Cabine Primária Blindada - 15 kV</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
        <Toaster position="bottom-center" />
        
        <div className="mb-8 mt-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 -z-10 rounded-full"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-300"
              style={{ width: `${((step - 1) / 4) * 100}%` }}
            ></div>
            
            {steps.map(s => (
              <div key={s.num} className="flex flex-col items-center gap-2 bg-gray-50 p-1 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                  step >= s.num ? 'bg-blue-600 text-white shadow-md' : 'bg-white border-2 border-gray-300 text-gray-400'
                }`}>
                  {step > s.num ? <Check size={16} /> : s.num}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${step >= s.num ? 'text-gray-900' : 'text-gray-500'}`}>{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Dados do Cliente</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={labelClass}>Razão Social *</label>
                  <input required value={clienteNome} onChange={e => setClienteNome(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>CNPJ</label>
                  <input value={clienteCnpj} onChange={e => setClienteCnpj(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Endereço completo</label>
                  <input value={clienteEndereco} onChange={e => setClienteEndereco(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Cidade / UF</label>
                  <input value={clienteCidade} onChange={e => setClienteCidade(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>CEP</label>
                  <input value={clienteCep} onChange={e => setClienteCep(e.target.value)} className={inputClass} />
                </div>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mt-6">Execução</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Data de execução</label>
                  <input type="date" required value={dataExecucao} onChange={e => setDataExecucao(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Responsável técnico</label>
                  <input value={responsavelNome} onChange={e => setResponsavelNome(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>CREA</label>
                  <input value={responsavelCrea} onChange={e => setResponsavelCrea(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Número ART</label>
                  <input value={artNumero} onChange={e => setArtNumero(e.target.value)} className={inputClass} />
                </div>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mt-6">Condições Climáticas</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Tempo</label>
                  <div className="flex gap-4 mt-2">
                    {['Bom', 'Nublado', 'Chuvoso'].map(c => (
                      <label key={c} className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="clima" value={c} checked={clima === c} onChange={e => setClima(e.target.value)} />
                        <span className="text-sm">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Temperatura (°C)</label>
                  <input type="number" value={temperatura} onChange={e => setTemperatura(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Umidade Relativa (%)</label>
                  <input type="number" value={umidade} onChange={e => setUmidade(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Dados do Circuito de Média Tensão</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Origem</label>
                  <input value={caboDe} onChange={e => setCaboDe(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Destino</label>
                  <input value={caboPara} onChange={e => setCaboPara(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Classe de tensão</label>
                  <input disabled value="8,7/15 kV" className={`${inputClass} bg-gray-100 text-gray-500`} />
                </div>
                <div>
                  <label className={labelClass}>Tensão nominal do sistema</label>
                  <input disabled value="13,8 kV" className={`${inputClass} bg-gray-100 text-gray-500`} />
                </div>
                <div>
                  <label className={labelClass}>Condutor</label>
                  <input disabled value="Cobre" className={`${inputClass} bg-gray-100 text-gray-500`} />
                </div>
                <div>
                  <label className={labelClass}>Seção [mm²]</label>
                  <select value={caboSecao} onChange={e => setCaboSecao(e.target.value)} className={inputClass}>
                    <option value="25mm²">25mm²</option>
                    <option value="35mm²">35mm²</option>
                    <option value="50mm²">50mm²</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Isolação</label>
                  <select value={caboIsolacao} onChange={e => setCaboIsolacao(e.target.value)} className={inputClass}>
                    <option value="EPR">EPR</option>
                    <option value="XLPE">XLPE</option>
                    <option value="HEPR">HEPR</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Comprimento [m] *</label>
                  <input required value={caboComprimento} onChange={e => setCaboComprimento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Tipo de terminal</label>
                  <select value={caboTerminais} onChange={e => setCaboTerminais(e.target.value)} className={inputClass}>
                    <option value="Polimérico">Polimérico</option>
                    <option value="Contrátil">Contrátil</option>
                    <option value="Termo">Termo</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Emendas</label>
                  <div className="flex gap-4 mt-2">
                    {['Não', 'Sim'].map(c => (
                      <label key={c} className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="emendas" value={c} checked={caboEmendas === c} onChange={e => setCaboEmendas(e.target.value)} />
                        <span className="text-sm">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Blindagem</label>
                  <input disabled value="Fita de cobre" className={`${inputClass} bg-gray-100 text-gray-500`} />
                </div>
                <div>
                  <label className={labelClass}>Instalação</label>
                  <div className="flex gap-4 mt-2">
                    {['Subterrânea', 'Aérea'].map(c => (
                      <label key={c} className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" name="instalacao" value={c} checked={caboInstalacao === c} onChange={e => setCaboInstalacao(e.target.value)} />
                        <span className="text-sm">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mt-6">Instrumentos de Ensaio</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Hipot CC — Modelo</label>
                  <input value={hipotInstrumento} onChange={e => setHipotInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Hipot CC — Nº Série</label>
                  <input value={hipotSerieInstrumento} onChange={e => setHipotSerieInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Megôhmetro — Modelo</label>
                  <input value={meggerInstrumento} onChange={e => setMeggerInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Megôhmetro — Nº Série</label>
                  <input value={meggerSerieInstrumento} onChange={e => setMeggerSerieInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Terrômetro — Modelo</label>
                  <input value={aterramentoInstrumento} onChange={e => setAterramentoInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Terrômetro — Nº Série</label>
                  <input value={aterramentoSerieInstrumento} onChange={e => setAterramentoSerieInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>TTR/Analisador — Modelo</label>
                  <input value={ttrInstrumento} onChange={e => setTtrInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>TTR/Analisador — Nº Série</label>
                  <input value={ttrSerieInstrumento} onChange={e => setTtrSerieInstrumento(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Aterramento</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Quantidade de hastes</label>
                  <input type="number" min="1" value={aterramentoQtdeHastes} onChange={e => setAterramentoQtdeHastes(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Tipo de haste</label>
                  <input value={aterramentoTipo} onChange={e => setAterramentoTipo(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Comprimento das hastes</label>
                  <input value={aterramentoComprimento} onChange={e => setAterramentoComprimento(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Dados do Transformador</h2>
              <p className="text-sm text-gray-500 mb-4">Deixe em branco a Potência caso a cabine não possua transformador sob ensaio.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Potência (kVA)</label>
                  <select value={trafoPotenciaKva} onChange={e => setTrafoPotenciaKva(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass}>
                    <option value="">Nenhum</option>
                    {[45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000].map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Tensão BT</label>
                  <select value={trafoTensaoBt} onChange={e => setTrafoTensaoBt(e.target.value as any)} className={inputClass} disabled={trafoPotenciaKva === ''}>
                    <option value="220">220/127V</option>
                    <option value="380">380/220V</option>
                    <option value="440">440/254V</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nº de Série</label>
                  <input value={trafoNumeroSerie} onChange={e => setTrafoNumeroSerie(e.target.value)} className={inputClass} disabled={trafoPotenciaKva === ''} />
                </div>
                <div>
                  <label className={labelClass}>Fabricante</label>
                  <input value={trafoFabricante} onChange={e => setTrafoFabricante(e.target.value)} className={inputClass} disabled={trafoPotenciaKva === ''} />
                </div>
              </div>

              {trafoPotenciaKva !== '' && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mt-6">Seleção de Taps</h2>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {allTaps.map(tap => (
                      <label key={tap} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={selectedTaps.includes(tap)} onChange={() => handleTapToggle(tap)} className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                        <span className="text-sm">{tap} V</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 md:w-1/2">
                    <label className={labelClass}>Tap de Despacho</label>
                    <select value={tapDespacho} onChange={e => setTapDespacho(Number(e.target.value))} className={inputClass}>
                      {selectedTaps.map(tap => (
                        <option key={tap} value={tap}>{tap} V</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b">Anotação de Responsabilidade Técnica (ART)</h2>
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {uploadando ? (
                  <div className="flex flex-col items-center justify-center text-blue-600">
                    <Loader2 className="animate-spin mb-2" size={32} />
                    <span>Enviando arquivo e gerando relatório...</span>
                  </div>
                ) : artFile ? (
                  <div className="flex items-center justify-center gap-2 text-green-700 font-medium">
                    <Check size={20} />
                    <span>{artNome}</span>
                    <button type="button" onClick={() => { setArtFile(null); setArtNome(''); }} className="ml-2 text-red-500 hover:text-red-700">
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input type="file" accept="application/pdf" className="hidden" id="art-upload" onChange={handleArtChange} />
                    <label htmlFor="art-upload" className="cursor-pointer text-blue-600 font-medium hover:text-blue-700">
                      Clique aqui para fazer upload do PDF
                    </label>
                    <p className="text-xs text-gray-500 mt-2">O arquivo será anexado como última página do relatório (opcional)</p>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-6 mt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handlePrev}
              disabled={step === 1 || loading || uploadando}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <ArrowLeft size={18} />
              Anterior
            </button>
            
            <button
              type="submit"
              disabled={loading || uploadando}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-70"
            >
              {uploadando ? <Loader2 className="animate-spin" size={20} /> : step === 5 ? <Save size={20} /> : <ArrowRight size={20} />}
              {uploadando ? 'Salvando...' : step === 5 ? 'Gerar Relatório' : 'Próximo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
