'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Check, Edit3, FileImage, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';
import { uploadArquivo } from '@/lib/storage';
import { conclusoesPadrao, gerarIdPonto, TermografiaClassificacao, TermografiaPonto, TermografiaRisco } from '@/lib/termografia/types';

type TermografiaPontoDraft = TermografiaPonto & {
  _fotoDigitalFile?: File;
  _fotoTermicaFile?: File;
};

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

async function prepararImagem(file: File) {
  if (!file.type.startsWith('image/')) return file;
  return imageCompression(file, {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1800,
    useWebWorker: true,
  });
}

function limparPontoUpload(ponto: TermografiaPontoDraft) {
  const limpo = { ...ponto };
  delete limpo._fotoDigitalFile;
  delete limpo._fotoTermicaFile;
  return limpo;
}

export default function NovaTermografiaPage() {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const [clienteNome, setClienteNome] = useState('');
  const [clienteCnpj, setClienteCnpj] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [clienteCidade, setClienteCidade] = useState('');
  const [clienteUf, setClienteUf] = useState('SP');
  const [clienteCep, setClienteCep] = useState('');
  const [dataExecucao, setDataExecucao] = useState(today);
  const [responsavelNome, setResponsavelNome] = useState('Roberto Fontes Lopes');
  const [responsavelCrea, setResponsavelCrea] = useState('0601049229');
  const [pontos, setPontos] = useState<TermografiaPontoDraft[]>([
    { id: gerarIdPonto(), setor: '', local: '', inspecionado: true, ocorrencia: false },
  ]);
  const [pontoAbertoId, setPontoAbertoId] = useState(pontos[0].id);

  const atualizarPonto = (id: string, patch: Partial<TermografiaPontoDraft>) => {
    setPontos((atuais) => atuais.map((p) => {
      if (p.id !== id) return p;
      const proximo = { ...p, ...patch };
      if (patch.classificacao && !patch.conclusao) {
        proximo.conclusao = conclusoesPadrao[patch.classificacao];
      }
      return proximo;
    }));
  };

  const adicionarPonto = () => {
    setPontos((atuais) => {
      const ultimo = atuais[atuais.length - 1];
      const novo = { id: gerarIdPonto(), setor: ultimo?.setor ?? '', local: '', inspecionado: true, ocorrencia: false };
      setPontoAbertoId(novo.id);
      return [...atuais, novo];
    });
  };

  const removerPonto = (id: string) => {
    const ponto = pontos.find((item) => item.id === id);
    const nome = ponto?.local || ponto?.setor || 'este ponto';
    if (!window.confirm(`Tem certeza que deseja excluir ${nome}? Essa ação não pode ser desfeita.`)) {
      return;
    }

    setPontos((atuais) => {
      if (atuais.length === 1) return atuais;
      const restantes = atuais.filter((p) => p.id !== id);
      if (pontoAbertoId === id) setPontoAbertoId(restantes[restantes.length - 1]?.id ?? restantes[0]?.id);
      return restantes;
    });
  };

  const selecionarFoto = (id: string, tipo: 'digital' | 'termica', file?: File) => {
    if (!file) return;
    const dataHoraFoto = new Date(file.lastModified || Date.now()).toISOString();
    const patch = tipo === 'digital'
      ? { fotoDigitalUrl: URL.createObjectURL(file), dataHoraFoto, _fotoDigitalFile: file }
      : { fotoTermicaUrl: URL.createObjectURL(file), dataHoraFoto, _fotoTermicaFile: file };
    atualizarPonto(id, patch);
  };

  const irParaPontos = () => {
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clienteNome.trim()) {
      toast.error('Informe o cliente.');
      return;
    }
    if (pontos.some((p) => !p.setor.trim() || !p.local.trim())) {
      toast.error('Todos os pontos precisam de setor/área e local.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const agora = new Date();
      const mes = String(agora.getMonth() + 1).padStart(2, '0');
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from('relatorios_termografia')
        .select('*', { count: 'exact', head: true })
        .gte('criado_em', inicioMes);
      const numeroRelatorio = `RT-${agora.getFullYear()}${mes}-${String((count ?? 0) + 1).padStart(3, '0')}`;

      const pontosUpload = await Promise.all(pontos.map(async (ponto, index) => {
        let fotoDigitalUrl = null;
        let fotoTermicaUrl = null;
        if (ponto._fotoDigitalFile) {
          const file = await prepararImagem(ponto._fotoDigitalFile);
          fotoDigitalUrl = await uploadArquivo(file, `termografia/${numeroRelatorio}`, `oc-${index + 1}-digital.jpg`);
        }
        if (ponto._fotoTermicaFile) {
          const file = await prepararImagem(ponto._fotoTermicaFile);
          fotoTermicaUrl = await uploadArquivo(file, `termografia/${numeroRelatorio}`, `oc-${index + 1}-termica.jpg`);
        }
        const limpo = limparPontoUpload(ponto);
        return {
          ...limpo,
          fotoDigitalUrl: fotoDigitalUrl ?? (limpo.fotoDigitalUrl?.startsWith('blob:') ? null : limpo.fotoDigitalUrl ?? null),
          fotoTermicaUrl: fotoTermicaUrl ?? (limpo.fotoTermicaUrl?.startsWith('blob:') ? null : limpo.fotoTermicaUrl ?? null),
        };
      }));

      const { data, error } = await supabase
        .from('relatorios_termografia')
        .insert({
          numero_relatorio: numeroRelatorio,
          criado_por: user.id,
          cliente_nome: clienteNome,
          cliente_cnpj: clienteCnpj,
          cliente_endereco: clienteEndereco,
          cliente_cidade: clienteCidade,
          cliente_uf: clienteUf,
          cliente_cep: clienteCep,
          data_execucao: dataExecucao,
          objetivo: 'Estudo Termográfico da subestação primária e dos painéis elétricos',
          equipamento: 'Flir InfraCAM SD',
          responsavel_nome: responsavelNome,
          responsavel_crea: responsavelCrea,
          revisao: 0,
          pontos: pontosUpload,
          status: 'gerado',
        })
        .select('id')
        .single();

      if (error) throw error;
      toast.success('Relatório de termografia criado.');
      router.push(`/termografia/${data.id}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar relatório.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <Toaster position="bottom-center" />
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/termografia" className="text-gray-500 hover:text-gray-700"><ArrowLeft size={20} /></Link>
          <img src="/logo.png" alt="Radial Energia" className="h-8 object-contain" />
        </div>
        <div className="text-right hidden sm:block">
          <h1 className="text-sm font-bold text-gray-900 leading-tight">RELATÓRIO TÉCNICO DE TERMOGRAFIA</h1>
          <p className="text-xs text-gray-500">Inspeção termográfica elétrica</p>
        </div>
      </div>

      <form noValidate onSubmit={handleSubmit} className="max-w-5xl mx-auto p-4 md:p-6 pb-24 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-2 flex gap-2">
          <button type="button" onClick={() => setStep(1)} className={`flex-1 py-2 rounded-md text-sm font-semibold ${step === 1 ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            1. Cliente
          </button>
          <button type="button" onClick={irParaPontos} className={`flex-1 py-2 rounded-md text-sm font-semibold ${step === 2 ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            2. Fotos e pontos
          </button>
        </div>

        {step === 1 && (
          <>
            <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mb-4">Dados do Cliente</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={labelClass}>Cliente *</label>
                  <input required value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} className={inputClass} />
                </div>
                <div><label className={labelClass}>CNPJ</label><input value={clienteCnpj} onChange={(e) => setClienteCnpj(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Data de execução</label><input type="date" value={dataExecucao} onChange={(e) => setDataExecucao(e.target.value)} className={inputClass} /></div>
                <div className="md:col-span-2"><label className={labelClass}>Endereço</label><input value={clienteEndereco} onChange={(e) => setClienteEndereco(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Cidade</label><input value={clienteCidade} onChange={(e) => setClienteCidade(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>UF</label><input value={clienteUf} onChange={(e) => setClienteUf(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>CEP</label><input value={clienteCep} onChange={(e) => setClienteCep(e.target.value)} className={inputClass} /></div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mb-4">Responsável Técnico</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelClass}>Responsável</label><input value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>CREA</label><input value={responsavelCrea} onChange={(e) => setResponsavelCrea(e.target.value)} className={inputClass} /></div>
              </div>
            </section>

            <div className="flex justify-end">
              <button type="button" onClick={irParaPontos} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-bold shadow">
                Próximo
              </button>
            </div>
          </>
        )}

        {step === 2 && (
        <>
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between gap-3 pb-2 border-b mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Roteiro e Ocorrências</h2>
              <p className="text-sm text-gray-500">Cada linha inspecionada entra no roteiro; marque ocorrência quando houver ponto aquecido.</p>
            </div>
            <button type="button" onClick={adicionarPonto} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> Ponto
            </button>
          </div>

          <div className="space-y-4">
            {pontos.map((ponto, index) => (
              <div key={ponto.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between gap-3 mb-4">
                  <button type="button" onClick={() => setPontoAbertoId(ponto.id)} className="flex-1 text-left">
                    <div className="font-semibold text-gray-900">Ponto {index + 1}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {ponto.setor || 'Setor não informado'} {ponto.local ? `- ${ponto.local}` : ''}
                      {ponto.ocorrencia ? ' | Ocorrência' : ' | Sem ocorrência'}
                      {(ponto.fotoDigitalUrl || ponto.fotoTermicaUrl) ? ' | Com fotos' : ''}
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPontoAbertoId(ponto.id)} className="text-gray-400 hover:text-blue-600" title="Editar ponto"><Edit3 size={18} /></button>
                    <button type="button" onClick={() => removerPonto(ponto.id)} className="text-gray-400 hover:text-red-600" title="Excluir ponto"><Trash2 size={18} /></button>
                  </div>
                </div>

                {pontoAbertoId === ponto.id && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className={labelClass}>Setor/área *</label>
                        <input required value={ponto.setor} onChange={(e) => atualizarPonto(ponto.id, { setor: e.target.value })} className={inputClass} />
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>Local *</label>
                        <input required value={ponto.local} onChange={(e) => atualizarPonto(ponto.id, { local: e.target.value })} className={inputClass} />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input type="checkbox" checked={ponto.ocorrencia} onChange={(e) => atualizarPonto(ponto.id, { ocorrencia: e.target.checked })} className="h-4 w-4" />
                        Ocorrência
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input type="checkbox" checked={ponto.inspecionado} onChange={(e) => atualizarPonto(ponto.id, { inspecionado: e.target.checked })} className="h-4 w-4" />
                        Inspecionado
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                      <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md p-3 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:border-blue-400">
                        <Camera size={18} /> Foto digital
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => selecionarFoto(ponto.id, 'digital', e.target.files?.[0])} />
                      </label>
                      <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md p-3 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:border-blue-400">
                        <FileImage size={18} /> Anexar térmica
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => selecionarFoto(ponto.id, 'termica', e.target.files?.[0])} />
                      </label>
                      {(ponto.fotoDigitalUrl || ponto.fotoTermicaUrl) && (
                        <div className="grid grid-cols-2 gap-3 md:col-span-2">
                          {ponto.fotoDigitalUrl && <img src={ponto.fotoDigitalUrl} alt="Foto digital" className="w-full h-40 object-cover rounded border" />}
                          {ponto.fotoTermicaUrl && <img src={ponto.fotoTermicaUrl} alt="Foto termográfica" className="w-full h-40 object-cover rounded border" />}
                        </div>
                      )}
                    </div>

                    {ponto.ocorrencia && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
                        <div><label className={labelClass}>Componente</label><input value={ponto.componente ?? ''} onChange={(e) => atualizarPonto(ponto.id, { componente: e.target.value })} className={inputClass} /></div>
                        <div><label className={labelClass}>Temperatura</label><input value={ponto.temperatura ?? ''} onChange={(e) => atualizarPonto(ponto.id, { temperatura: e.target.value })} placeholder="Ex.: 76,2 ºC" className={inputClass} /></div>
                        <div>
                          <label className={labelClass}>Classificação</label>
                          <select value={ponto.classificacao ?? 'Intervenção Programada'} onChange={(e) => atualizarPonto(ponto.id, { classificacao: e.target.value as TermografiaClassificacao })} className={inputClass}>
                            {Object.keys(conclusoesPadrao).map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Risco</label>
                          <select value={ponto.risco ?? 'Baixo'} onChange={(e) => atualizarPonto(ponto.id, { risco: e.target.value as TermografiaRisco })} className={inputClass}>
                            <option>Baixo</option><option>Médio</option><option>Alto</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className={labelClass}>Conclusão</label>
                          <input value={ponto.conclusao ?? conclusoesPadrao[ponto.classificacao ?? 'Intervenção Programada']} onChange={(e) => atualizarPonto(ponto.id, { conclusao: e.target.value })} className={inputClass} />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end mt-4">
                      <button type="button" onClick={() => setPontoAbertoId('')} className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800">
                        <Check size={16} /> Concluir ponto
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-between gap-3">
          <button type="button" onClick={() => {
            setStep(1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-3 rounded-md font-bold">
            Voltar
          </button>
          <button disabled={loading} type="submit" className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md font-bold shadow">
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            Salvar Relatório
          </button>
        </div>
        </>
        )}
      </form>
    </div>
  );
}
