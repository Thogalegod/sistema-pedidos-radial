'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'react-hot-toast';
import { criarRelatorioCabine } from '../actions';
import { CabineInput } from '@/lib/cabine-calc';
import { ArrowLeft, ArrowRight, Loader2, Save, Check } from 'lucide-react';
import Link from 'next/link';

export default function NovaCabinePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  // Form State - Step 1
  const [clienteNome, setClienteNome] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [clienteCidade, setClienteCidade] = useState('');
  const [clienteUf, setClienteUf] = useState('');
  const [clienteCep, setClienteCep] = useState('');
  const [clienteCnpj, setClienteCnpj] = useState('');
  const [clienteIe, setClienteIe] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [dataExecucao, setDataExecucao] = useState(today);
  const [objetivo, setObjetivo] = useState('Relatório de testes Cabine Primária');

  // Form State - Step 2
  const [caboDe, setCaboDe] = useState('');
  const [caboPara, setCaboPara] = useState('');
  const [caboModelo, setCaboModelo] = useState('EPR 8,7/15kV');
  const [caboComprimento, setCaboComprimento] = useState('');
  const [caboBitola, setCaboBitola] = useState('');
  const [caboTerminais, setCaboTerminais] = useState('Polimérica');
  const [caboTemperatura, setCaboTemperatura] = useState<number | ''>('');
  const [caboUmidade, setCaboUmidade] = useState<number | ''>('');
  const [caboClima, setCaboClima] = useState('Bom');

  const [hipotTensaoTeste, setHipotTensaoTeste] = useState('35kV');
  const [hipotDuracao, setHipotDuracao] = useState('15 min');
  const [hipotInstrumento, setHipotInstrumento] = useState('');
  const [hipotSerieInstrumento, setHipotSerieInstrumento] = useState('');

  const [meggerTensaoTeste, setMeggerTensaoTeste] = useState('10kV');
  const [meggerDuracao, setMeggerDuracao] = useState('15 min');
  const [meggerInstrumento, setMeggerInstrumento] = useState('');
  const [meggerSerieInstrumento, setMeggerSerieInstrumento] = useState('');

  // Form State - Step 3
  const [aterramentoQtdeHastes, setAterramentoQtdeHastes] = useState<number>(1);
  const [aterramentoTipo, setAterramentoTipo] = useState('Cobre');
  const [aterramentoComprimento, setAterramentoComprimento] = useState('');
  const [aterramentoBitola, setAterramentoBitola] = useState('25mm²');
  const [aterramentoInstrumento, setAterramentoInstrumento] = useState('');
  const [aterramentoSerieInstrumento, setAterramentoSerieInstrumento] = useState('');
  const [aterramentoTemperatura, setAterramentoTemperatura] = useState<number | ''>('');
  const [aterramentoUmidade, setAterramentoUmidade] = useState<number | ''>('');
  const [aterramentoClima, setAterramentoClima] = useState('Bom');

  // Form State - Step 4
  const [responsavelNome, setResponsavelNome] = useState('Roberto Fontes Lopes');
  const [responsavelCrea, setResponsavelCrea] = useState('CREA 060.104.922.9');

  const handleNext = () => setStep(s => s + 1);
  const handlePrev = () => setStep(s => s - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 4) {
      handleNext();
      return;
    }
    
    if (!clienteNome || !clienteEndereco || !clienteCidade || !clienteUf || !caboDe || !caboPara || !caboComprimento || !caboBitola || !aterramentoQtdeHastes) {
      toast.error('Preencha todos os dados obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      const input: CabineInput = {
        clienteNome, clienteEndereco, clienteCidade, clienteUf, clienteCep, clienteCnpj, clienteIe, dataExecucao, objetivo,
        caboDe, caboPara, caboModelo, caboComprimento, caboBitola, caboTerminais, 
        caboTemperatura: caboTemperatura === '' ? undefined : Number(caboTemperatura),
        caboUmidade: caboUmidade === '' ? undefined : Number(caboUmidade), caboClima,
        hipotTensaoTeste, hipotDuracao, hipotInstrumento, hipotSerieInstrumento,
        meggerTensaoTeste, meggerDuracao, meggerInstrumento, meggerSerieInstrumento,
        aterramentoQtdeHastes, aterramentoTipo, aterramentoComprimento, aterramentoBitola,
        aterramentoInstrumento, aterramentoSerieInstrumento,
        aterramentoTemperatura: aterramentoTemperatura === '' ? undefined : Number(aterramentoTemperatura),
        aterramentoUmidade: aterramentoUmidade === '' ? undefined : Number(aterramentoUmidade), aterramentoClima,
        responsavelNome, responsavelCrea
      };

      const { data: { session } } = await supabase.auth.getSession();
      
      const result = await criarRelatorioCabine(input, session?.access_token, session?.refresh_token);
      toast.success(`Relatório ${result.numeroRelatorio} gerado!`);
      router.push(`/cabine/${result.id}`);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar relatório.');
      setLoading(false);
    }
  };

  const inputClass = "w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  const steps = [
    { num: 1, title: 'Cliente' },
    { num: 2, title: 'Cabos & Ensaios' },
    { num: 3, title: 'Aterramento' },
    { num: 4, title: 'Responsável' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      <Toaster position="bottom-center" />
      <div className="flex items-center gap-4 mb-6">
        <Link href="/cabine" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nova Inspeção de Cabine Primária</h1>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 -z-10 rounded-full"></div>
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 -z-10 rounded-full transition-all duration-300"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          ></div>
          
          {steps.map(s => (
            <div key={s.num} className="flex flex-col items-center gap-2 bg-gray-100 p-1 relative">
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

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
        
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">1. Dados do Cliente</h2>
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
                <label className={labelClass}>CEP</label>
                <input value={clienteCep} onChange={e => setClienteCep(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CNPJ/CPF</label>
                <input value={clienteCnpj} onChange={e => setClienteCnpj(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Inscrição Estadual</label>
                <input value={clienteIe} onChange={e => setClienteIe(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Data de Execução *</label>
                <input type="date" required value={dataExecucao} onChange={e => setDataExecucao(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Objetivo</label>
                <input value={objetivo} onChange={e => setObjetivo(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">2. Dados do Cabo & Ensaios</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>DE *</label>
                <input required value={caboDe} onChange={e => setCaboDe(e.target.value)} className={inputClass} placeholder="Ex: Poste" />
              </div>
              <div>
                <label className={labelClass}>PARA *</label>
                <input required value={caboPara} onChange={e => setCaboPara(e.target.value)} className={inputClass} placeholder="Ex: Cabine" />
              </div>
              <div>
                <label className={labelClass}>Modelo do Cabo</label>
                <input value={caboModelo} onChange={e => setCaboModelo(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Terminais</label>
                <input value={caboTerminais} onChange={e => setCaboTerminais(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Comprimento *</label>
                <input required value={caboComprimento} onChange={e => setCaboComprimento(e.target.value)} className={inputClass} placeholder="Ex: 50m" />
              </div>
              <div>
                <label className={labelClass}>Bitola *</label>
                <input required value={caboBitola} onChange={e => setCaboBitola(e.target.value)} className={inputClass} placeholder="Ex: 50mm²" />
              </div>
              <div>
                <label className={labelClass}>Temperatura (°C)</label>
                <input type="number" value={caboTemperatura} onChange={e => setCaboTemperatura(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Umidade (%)</label>
                <input type="number" value={caboUmidade} onChange={e => setCaboUmidade(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Clima</label>
                <div className="flex gap-4">
                  {['Bom', 'Nublado', 'Chuvoso'].map(c => (
                    <label key={c} className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name="clima" value={c} checked={caboClima === c} onChange={e => setCaboClima(e.target.value)} />
                      <span className="text-sm">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-3">Ensaio HIPOT</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tensão de Teste</label>
                  <input value={hipotTensaoTeste} onChange={e => setHipotTensaoTeste(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Duração</label>
                  <input value={hipotDuracao} onChange={e => setHipotDuracao(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Instrumento</label>
                  <input value={hipotInstrumento} onChange={e => setHipotInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nº Série</label>
                  <input value={hipotSerieInstrumento} onChange={e => setHipotSerieInstrumento(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h3 className="font-semibold text-gray-800 mb-3">Ensaio Megger</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tensão de Teste</label>
                  <input value={meggerTensaoTeste} onChange={e => setMeggerTensaoTeste(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Duração</label>
                  <input value={meggerDuracao} onChange={e => setMeggerDuracao(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Instrumento</label>
                  <input value={meggerInstrumento} onChange={e => setMeggerInstrumento(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Nº Série</label>
                  <input value={meggerSerieInstrumento} onChange={e => setMeggerSerieInstrumento(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">3. Dados do Aterramento</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Qtde de Hastes *</label>
                <input type="number" min="1" required value={aterramentoQtdeHastes} onChange={e => setAterramentoQtdeHastes(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Tipo</label>
                <input value={aterramentoTipo} onChange={e => setAterramentoTipo(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Comprimento</label>
                <input value={aterramentoComprimento} onChange={e => setAterramentoComprimento(e.target.value)} className={inputClass} placeholder="Ex: 2,4m" />
              </div>
              <div>
                <label className={labelClass}>Bitola</label>
                <input value={aterramentoBitola} onChange={e => setAterramentoBitola(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Instrumento</label>
                <input value={aterramentoInstrumento} onChange={e => setAterramentoInstrumento(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nº Série</label>
                <input value={aterramentoSerieInstrumento} onChange={e => setAterramentoSerieInstrumento(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Temperatura (°C)</label>
                <input type="number" value={aterramentoTemperatura} onChange={e => setAterramentoTemperatura(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Umidade (%)</label>
                <input type="number" value={aterramentoUmidade} onChange={e => setAterramentoUmidade(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Clima</label>
                <div className="flex gap-4">
                  {['Bom', 'Nublado', 'Chuvoso'].map(c => (
                    <label key={c} className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name="climaAt" value={c} checked={aterramentoClima === c} onChange={e => setAterramentoClima(e.target.value)} />
                      <span className="text-sm">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">4. Responsável Técnico</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome</label>
                <input value={responsavelNome} onChange={e => setResponsavelNome(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CREA</label>
                <input value={responsavelCrea} onChange={e => setResponsavelCrea(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-md border border-gray-100 mt-2">
                  O upload do PDF da ART será adicionado em uma versão futura. Por enquanto, a página de CREA do responsável será gerada com os dados acima.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-6 mt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={handlePrev}
            disabled={step === 1 || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${step === 1 ? 'opacity-0 pointer-events-none' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <ArrowLeft size={18} />
            Anterior
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : step === 4 ? <Save size={18} /> : <ArrowRight size={18} />}
            {loading ? 'Processando...' : step === 4 ? 'Gerar Relatório' : 'Próximo'}
          </button>
        </div>
      </form>
    </div>
  );
}
