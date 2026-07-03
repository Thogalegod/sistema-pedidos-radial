'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Edit3, FileImage, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import imageCompression from 'browser-image-compression';
import { uploadArquivo } from '@/lib/storage';
import { gerarIdPonto, TermografiaClassificacao, TermografiaRisco, conclusoesPadrao } from '@/lib/termografia/types';
import { nomeFotoPonto } from '@/lib/termografia/images';
import { useTermografiaDraft, type UseTermografiaDraftOptions } from '@/hooks/useTermografiaDraft';
import { SaveStatusBanner } from '@/components/termografia/SaveStatusBanner';

type FotoEstado = 'vazia' | 'local' | 'enviando' | 'salva' | 'erro';

type UploadEstado = {
  digital: FotoEstado;
  termica: FotoEstado;
  erroDigital?: string;
  erroTermica?: string;
};

type UploadEstados = Record<string, UploadEstado>;

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

async function prepararImagem(file: File) {
  if (!file.type.startsWith('image/')) return file;
  return imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 2400,
    useWebWorker: true,
  });
}

// Hook auxiliar para gerenciar o upload individual de cada ponto
function useUploadsIndividuais() {
  const [estados, setEstados] = useState<UploadEstados>({});

  const inicializarPonto = useCallback((pontoId: string) => {
    setEstados((prev) => {
      if (prev[pontoId]) return prev;
      return { ...prev, [pontoId]: { digital: 'vazia', termica: 'vazia' } };
    });
  }, []);

  const atualizarEstado = useCallback((
    pontoId: string,
    tipo: 'digital' | 'termica',
    estado: FotoEstado,
    erroMsg?: string,
  ) => {
    setEstados((prev) => {
      const atual = prev[pontoId] ?? { digital: 'vazia', termica: 'vazia' };
      const campoErro = tipo === 'digital' ? 'erroDigital' : 'erroTermica';
      return {
        ...prev,
        [pontoId]: {
          ...atual,
          [tipo]: estado,
          [campoErro]: erroMsg,
        },
      };
    });
  }, []);

  const uploadPendente = useCallback(() => {
    return Object.values(estados).some((e) => e.digital === 'enviando' || e.termica === 'enviando');
  }, [estados]);

  return { estados, inicializarPonto, atualizarEstado, uploadPendente };
}

export default function NovaTermografiaPage() {
  const [step, setStep] = useState(1);
  const { estados, inicializarPonto, atualizarEstado, uploadPendente } = useUploadsIndividuais();
  const uploadPendenteRef = useRef(uploadPendente);

  useEffect(() => {
    uploadPendenteRef.current = uploadPendente;
  }, [uploadPendente]);

  const options: UseTermografiaDraftOptions = {
    uploadPendente: () => uploadPendenteRef.current(),
  };

  const {
    relatorio, dados, pontos, saveStatus, salvoEm, carregando,
    atualizarDados, atualizarPontos, salvarAgora, repetir, finalizar,
  } = useTermografiaDraft(options);

  const [abertoId, setAbertoId] = useState('');
  const [finalizando, setFinalizando] = useState(false);

  // Mostrar aviso de recuperação
  const jaRecuperou = useRef(false);
  useEffect(() => {
    if (!carregando && relatorio && !jaRecuperou.current) {
      jaRecuperou.current = true;
      const fotosCount = (relatorio.pontos ?? []).filter(
        (p) => p.fotoDigitalUrl || p.fotoTermicaUrl,
      ).length;
      if (fotosCount > 0) {
        toast(`Seu relatório foi recuperado — ${fotosCount} foto(s) já salva(s).`, { icon: '📋' });
      }
    }
  }, [carregando, relatorio]);

  // Abrir o primeiro ponto após carregar
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (!carregando && pontos.length > 0 && !jaAbriu.current) {
      jaAbriu.current = true;
      setAbertoId(pontos[0].id);
      pontos.forEach((p) => inicializarPonto(p.id));
    }
  }, [carregando, pontos, inicializarPonto]);

  const adicionarPonto = () => {
    const id = gerarIdPonto();
    const ultimo = pontos[pontos.length - 1];
    const novo = { id, setor: ultimo?.setor ?? '', local: '', inspecionado: true, ocorrencia: false };
    atualizarPontos([...pontos, novo]);
    inicializarPonto(id);
    setAbertoId(id);
    requestAnimationFrame(() => {
      document.getElementById(`ponto-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const atualizarPonto = (id: string, patch: Record<string, unknown>) => {
    atualizarPontos(pontos.map((p) => {
      if (p.id !== id) return p;
      const proximo = { ...p, ...patch };
      if (patch.classificacao && !patch.conclusao) {
        proximo.conclusao = conclusoesPadrao[patch.classificacao as TermografiaClassificacao];
      }
      return proximo;
    }));
  };

  const removerPonto = (id: string) => {
    if (pontos.length <= 1) return;
    if (!window.confirm('Tem certeza que deseja excluir este ponto?')) return;
    atualizarPontos(pontos.filter((p) => p.id !== id));
    if (abertoId === id) {
      const restantes = pontos.filter((p) => p.id !== id);
      setAbertoId(restantes[restantes.length - 1]?.id ?? '');
    }
  };

  const handleFotoSelecionada = (pontoId: string, tipo: 'digital' | 'termica', file?: File) => {
    if (!file) return;
    void processarFoto(pontoId, tipo, file);
  };

  const processarFoto = async (pontoId: string, tipo: 'digital' | 'termica', file: File) => {
    atualizarEstado(pontoId, tipo, 'enviando');
    try {
      const comprimida = await prepararImagem(file);
      const caminho = await uploadArquivo(comprimida, `termografia/${relatorio?.numero_relatorio ?? 'rascunho'}`, nomeFotoPonto(pontoId, tipo));
      atualizarPontos(pontos.map((p) => {
        if (p.id !== pontoId) return p;
        const urlKey = tipo === 'digital' ? 'fotoDigitalUrl' : 'fotoTermicaUrl';
        return { ...p, [urlKey]: caminho };
      }));
      atualizarEstado(pontoId, tipo, 'salva');
      void salvarAgora();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no upload';
      atualizarEstado(pontoId, tipo, 'erro', msg);
      toast.error(msg);
    }
  };

  const handleFinalizar = async () => {
    if (finalizando) return;
    if (!dados.cliente_nome.trim()) { toast.error('Informe o cliente.'); return; }
    if (pontos.some((p) => !p.setor.trim() || !p.local.trim())) { toast.error('Preencha setor e local de todos os pontos.'); return; }
    if (Object.values(estados).some((e) => e.digital === 'enviando' || e.termica === 'enviando')) {
      toast.error('Aguarde os uploads terminarem.');
      return;
    }
    setFinalizando(true);
    try {
      const id = await finalizar();
      toast.success('Relatório finalizado com sucesso!');
      window.location.href = `/termografia/${id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar.');
      setFinalizando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span className="text-lg">Carregando ou recuperando rascunho…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <Toaster position="bottom-center" />
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/termografia" className="text-gray-500 hover:text-gray-700"><ArrowLeft size={20} /></Link>
            <img src="/logo.png" alt="Radial Energia" className="h-8 object-contain" />
          </div>
          <div className="text-right hidden sm:block">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">RELATÓRIO TÉCNICO DE TERMOGRAFIA</h1>
            <p className="text-xs text-gray-500">Inspeção termográfica elétrica</p>
          </div>
        </div>
        {/* Banner de salvamento */}
        {relatorio && (
          <div className="max-w-5xl mx-auto mt-2">
            <SaveStatusBanner status={saveStatus} salvoEm={salvoEm ?? undefined} onRetry={repetir} />
          </div>
        )}
      </div>

      <form noValidate onSubmit={(e) => { e.preventDefault(); void handleFinalizar(); }} className="max-w-5xl mx-auto p-4 md:p-6 pb-24 space-y-6">
        {/* Step switcher */}
        <div className="bg-white rounded-lg border border-gray-200 p-2 flex gap-2">
          <button type="button" onClick={() => setStep(1)} className={`flex-1 py-2 rounded-md text-sm font-semibold ${step === 1 ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            1. Cliente
          </button>
          <button type="button" onClick={() => setStep(2)} className={`flex-1 py-2 rounded-md text-sm font-semibold ${step === 2 ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
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
                  <input required value={dados.cliente_nome} onChange={(e) => atualizarDados({ cliente_nome: e.target.value })} className={inputClass} />
                </div>
                <div><label className={labelClass}>CNPJ</label><input value={dados.cliente_cnpj} onChange={(e) => atualizarDados({ cliente_cnpj: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>Data de execução</label><input type="date" value={dados.data_execucao} onChange={(e) => atualizarDados({ data_execucao: e.target.value })} className={inputClass} /></div>
                <div className="md:col-span-2"><label className={labelClass}>Endereço</label><input value={dados.cliente_endereco} onChange={(e) => atualizarDados({ cliente_endereco: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>Cidade</label><input value={dados.cliente_cidade} onChange={(e) => atualizarDados({ cliente_cidade: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>UF</label><input value={dados.cliente_uf} onChange={(e) => atualizarDados({ cliente_uf: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>CEP</label><input value={dados.cliente_cep} onChange={(e) => atualizarDados({ cliente_cep: e.target.value })} className={inputClass} /></div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 pb-2 border-b mb-4">Responsável Técnico</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelClass}>Responsável</label><input value={dados.responsavel_nome} onChange={(e) => atualizarDados({ responsavel_nome: e.target.value })} className={inputClass} /></div>
                <div><label className={labelClass}>CREA</label><input value={dados.responsavel_crea} onChange={(e) => atualizarDados({ responsavel_crea: e.target.value })} className={inputClass} /></div>
              </div>
            </section>

            <div className="flex justify-end">
              <button type="button" onClick={() => setStep(2)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-bold shadow">
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

              </div>

              <div className="space-y-4">
                {pontos.map((ponto, index) => {
                  const fotoEstado = estados[ponto.id] ?? { digital: 'vazia', termica: 'vazia' };
                  return (
                    <div key={ponto.id} id={`ponto-${ponto.id}`} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between gap-3 mb-4">
                        <button type="button" onClick={() => setAbertoId(ponto.id)} className="flex-1 text-left">
                          <div className="font-semibold text-gray-900">Ponto {index + 1}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {ponto.setor || 'Setor não informado'} {ponto.local ? `- ${ponto.local}` : ''}
                            {ponto.ocorrencia ? ' | Ocorrência' : ' | Sem ocorrência'}
                            {(ponto.fotoDigitalUrl || ponto.fotoTermicaUrl) ? ' | Com fotos' : ''}
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setAbertoId(ponto.id)} className="text-gray-400 hover:text-blue-600" title="Editar ponto"><Edit3 size={18} /></button>
                          <button type="button" onClick={() => removerPonto(ponto.id)} className="text-gray-400 hover:text-red-600" title="Excluir ponto"><Trash2 size={18} /></button>
                        </div>
                      </div>

                      {abertoId === ponto.id && (
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
                            {/* Foto Digital */}
                            <div>
                              {fotoEstado.digital === 'salva' || ponto.fotoDigitalUrl ? (
                                <div className="space-y-2">
                                  <div className="relative">
                                    <img
                                      src={ponto.fotoDigitalUrl?.startsWith('http') || ponto.fotoDigitalUrl?.startsWith('termografia')
                                        ? `/api/supabase-storage?path=${encodeURIComponent(ponto.fotoDigitalUrl)}`
                                        : ponto.fotoDigitalSrc ?? '/placeholder.svg'}
                                      alt="Foto digital"
                                      className="w-full h-36 object-cover rounded border"
                                    />
                                    {fotoEstado.digital === 'salva' && (
                                      <span className="absolute top-1 right-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded">Salva</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`foto-digital-input-${ponto.id}`)?.click()}
                                    className="text-sm text-blue-600 hover:underline"
                                  >
                                    Substituir foto
                                  </button>
                                  <input
                                    id={`foto-digital-input-${ponto.id}`}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => handleFotoSelecionada(ponto.id, 'digital', e.target.files?.[0])}
                                  />
                                </div>
                              ) : (
                                <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md p-3 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:border-blue-400">
                                  <Camera size={18} /> Foto digital
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => handleFotoSelecionada(ponto.id, 'digital', e.target.files?.[0])}
                                  />
                                </label>
                              )}
                              {fotoEstado.digital === 'enviando' && (
                                <div className="flex items-center gap-2 mt-1 text-sm text-blue-600">
                                  <Loader2 size={14} className="animate-spin" /> Enviando…
                                </div>
                              )}
                              {fotoEstado.digital === 'erro' && (
                                <div className="mt-1">
                                  <span className="text-sm text-red-600">{fotoEstado.erroDigital ?? 'Erro'}</span>
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`foto-digital-input-${ponto.id}`)?.click()}
                                    className="ml-2 text-sm text-blue-600 hover:underline"
                                  >
                                    Tentar novamente
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Foto Térmica */}
                            <div>
                              {fotoEstado.termica === 'salva' || ponto.fotoTermicaUrl ? (
                                <div className="space-y-2">
                                  <div className="relative">
                                    <img
                                      src={ponto.fotoTermicaUrl?.startsWith('http') || ponto.fotoTermicaUrl?.startsWith('termografia')
                                        ? `/api/supabase-storage?path=${encodeURIComponent(ponto.fotoTermicaUrl)}`
                                        : ponto.fotoTermicaSrc ?? '/placeholder.svg'}
                                      alt="Foto termográfica"
                                      className="w-full h-36 object-cover rounded border"
                                    />
                                    {fotoEstado.termica === 'salva' && (
                                      <span className="absolute top-1 right-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded">Salva</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`foto-termica-input-${ponto.id}`)?.click()}
                                    className="text-sm text-blue-600 hover:underline"
                                  >
                                    Substituir foto
                                  </button>
                                  <input
                                    id={`foto-termica-input-${ponto.id}`}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFotoSelecionada(ponto.id, 'termica', e.target.files?.[0])}
                                  />
                                </div>
                              ) : (
                                <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-md p-3 bg-white text-sm font-medium text-gray-700 cursor-pointer hover:border-blue-400">
                                  <FileImage size={18} /> Anexar térmica
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFotoSelecionada(ponto.id, 'termica', e.target.files?.[0])}
                                  />
                                </label>
                              )}
                              {fotoEstado.termica === 'enviando' && (
                                <div className="flex items-center gap-2 mt-1 text-sm text-blue-600">
                                  <Loader2 size={14} className="animate-spin" /> Enviando…
                                </div>
                              )}
                              {fotoEstado.termica === 'erro' && (
                                <div className="mt-1">
                                  <span className="text-sm text-red-600">{fotoEstado.erroTermica ?? 'Erro'}</span>
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`foto-termica-input-${ponto.id}`)?.click()}
                                    className="ml-2 text-sm text-blue-600 hover:underline"
                                  >
                                    Tentar novamente
                                  </button>
                                </div>
                              )}
                            </div>
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
                            <button
                              type="button"
                              onClick={() => setAbertoId('')}
                              className="inline-flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800"
                            >
                              <Check size={16} /> Concluir ponto
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={adicionarPonto}
                className="mt-4 w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-300 text-blue-600 px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-50 hover:border-blue-400"
              >
                <Plus size={18} /> Adicionar novo ponto
              </button>
            </section>

            <div className="flex justify-between gap-3">
              <button type="button" onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-3 rounded-md font-bold">
                Voltar
              </button>
              <button
                disabled={finalizando}
                type="submit"
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md font-bold shadow"
              >
                {finalizando ? <Loader2 size={20} className="animate-spin" /> : null}
                Finalizar relatório
              </button>
            </div>
          </>
        )}
      </form>

    </div>
  );
}
