'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Edit3, Eye, FileText, Plus, Printer, Save, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast, Toaster } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getUrlArquivo } from '@/lib/storage';
import { uploadArquivo } from '@/lib/storage';
import { conclusoesPadrao, gerarIdPonto, pontosAquecidosPorSetorLocal, TermografiaClassificacao, TermografiaPonto, TermografiaRelatorio, TermografiaRisco } from '@/lib/termografia/types';

type PontoComFotos = TermografiaPonto & {
  fotoDigitalSrc?: string | null;
  fotoTermicaSrc?: string | null;
};

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1';

const classificacaoClasses: Record<string, string> = {
  Normal: 'bg-gray-100 text-gray-700',
  Observação: 'bg-blue-100 text-blue-800',
  'Intervenção Programada': 'bg-green-100 text-green-800',
  'Intervenção Imediata': 'bg-yellow-100 text-yellow-800',
  Crítico: 'bg-red-100 text-red-800',
};

const prioridadeClassificacao = ['Crítico', 'Intervenção Imediata', 'Intervenção Programada', 'Observação', 'Normal'];

function classificacaoDaLinha(pontos: TermografiaPonto[]) {
  const classificacoes = pontos
    .filter((p) => p.ocorrencia)
    .map((p) => p.classificacao || 'Intervenção Programada');
  return prioridadeClassificacao.find((c) => classificacoes.includes(c as TermografiaClassificacao)) || 'Normal';
}

async function prepararImagem(file: File) {
  if (!file.type.startsWith('image/')) return file;
  return imageCompression(file, {
    maxSizeMB: 1.2,
    maxWidthOrHeight: 1800,
    useWebWorker: true,
  });
}

function removerFotosAssinadas(ponto: PontoComFotos): TermografiaPonto {
  const limpo = { ...ponto };
  delete limpo.fotoDigitalSrc;
  delete limpo.fotoTermicaSrc;
  return limpo;
}

export default function TermografiaViewer(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [data, setData] = useState<TermografiaRelatorio | null | false>(null);
  const [pontos, setPontos] = useState<PontoComFotos[]>([]);
  const [incluirFotosSemOcorrencia, setIncluirFotosSemOcorrencia] = useState(false);
  const [linhaSelecionada, setLinhaSelecionada] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TermografiaPonto>>({});
  const [fotoDigitalFile, setFotoDigitalFile] = useState<File | null>(null);
  const [fotoTermicaFile, setFotoTermicaFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregandoFotos, setCarregandoFotos] = useState(false);

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

  if (data === false) return <div className="p-8 text-center text-red-600">Relatório não encontrado.</div>;
  if (!data) return <div className="p-8 text-center">Carregando relatório...</div>;

  const pontosBase = pontos.length ? pontos : data.pontos;
  const ocorrencias = pontosBase.filter((p) => p.ocorrencia);
  const roteiro = pontosAquecidosPorSetorLocal(pontosBase);
  const chaveSelecionada = linhaSelecionada;
  const adicionandoPonto = editandoId === 'novo';
  const pontosSelecionados = chaveSelecionada
    ? pontosBase.filter((p) => `${p.setor}|||${p.local}` === chaveSelecionada)
    : [];
  const pontosDoModal: PontoComFotos[] = adicionandoPonto
    ? [{
      id: 'novo',
      setor: draft.setor ?? '',
      local: draft.local ?? '',
      inspecionado: Boolean(draft.inspecionado),
      ocorrencia: Boolean(draft.ocorrencia),
      componente: draft.componente,
      temperatura: draft.temperatura,
      classificacao: draft.classificacao,
      risco: draft.risco,
      conclusao: draft.conclusao,
    }]
    : pontosSelecionados;

  const abrirNovoPonto = () => {
    setLinhaSelecionada(null);
    setEditandoId('novo');
    setDraft({
      setor: '',
      local: '',
      inspecionado: true,
      ocorrencia: false,
      classificacao: 'Intervenção Programada',
      risco: 'Baixo',
      conclusao: conclusoesPadrao['Intervenção Programada'],
    });
    setFotoDigitalFile(null);
    setFotoTermicaFile(null);
  };

  const abrirDetalhes = async (chave: string) => {
    setLinhaSelecionada(chave);
    const pontosDaLinha = pontosBase.filter((p) => `${p.setor}|||${p.local}` === chave);
    const precisaAssinarFotos = pontosDaLinha.some((p) => (
      (p.fotoDigitalUrl && !(p as PontoComFotos).fotoDigitalSrc)
      || (p.fotoTermicaUrl && !(p as PontoComFotos).fotoTermicaSrc)
    ));

    if (!precisaAssinarFotos) return;

    setCarregandoFotos(true);
    try {
      const assinados = await Promise.all(pontosDaLinha.map(async (ponto) => ({
        ...ponto,
        fotoDigitalSrc: ponto.fotoDigitalUrl ? await getUrlArquivo(ponto.fotoDigitalUrl) : null,
        fotoTermicaSrc: ponto.fotoTermicaUrl ? await getUrlArquivo(ponto.fotoTermicaUrl) : null,
      })));

      setPontos((atuais) => atuais.map((item) => {
        const assinado = assinados.find((p) => p.id === item.id);
        return assinado ?? item;
      }));
    } catch {
      toast.error('Não foi possível carregar as fotos deste registro.');
    } finally {
      setCarregandoFotos(false);
    }
  };

  const iniciarEdicao = (ponto: PontoComFotos) => {
    setEditandoId(ponto.id);
    setDraft({ ...ponto });
    setFotoDigitalFile(null);
    setFotoTermicaFile(null);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setDraft({});
    setFotoDigitalFile(null);
    setFotoTermicaFile(null);
  };

  const salvarEdicao = async (ponto: PontoComFotos) => {
    if (!data) return;
    const setor = (draft.setor ?? '').trim();
    const local = (draft.local ?? '').trim();
    if (!setor || !local) {
      toast.error('Informe setor/área e local.');
      return;
    }

    setSalvando(true);
    try {
      const novoId = gerarIdPonto();
      const index = adicionandoPonto ? pontosBase.length : pontosBase.findIndex((p) => p.id === ponto.id);
      let fotoDigitalUrl = draft.fotoDigitalUrl ?? ponto.fotoDigitalUrl ?? null;
      let fotoTermicaUrl = draft.fotoTermicaUrl ?? ponto.fotoTermicaUrl ?? null;

      if (fotoDigitalFile) {
        const file = await prepararImagem(fotoDigitalFile);
        fotoDigitalUrl = await uploadArquivo(file, `termografia/${data.numero_relatorio}`, `oc-${index + 1}-digital.jpg`);
      }
      if (fotoTermicaFile) {
        const file = await prepararImagem(fotoTermicaFile);
        fotoTermicaUrl = await uploadArquivo(file, `termografia/${data.numero_relatorio}`, `oc-${index + 1}-termica.jpg`);
      }

      const pontoSalvo: TermografiaPonto = {
        id: adicionandoPonto ? novoId : ponto.id,
        setor,
        local,
        inspecionado: Boolean(draft.inspecionado),
        ocorrencia: Boolean(draft.ocorrencia),
        componente: draft.componente,
        temperatura: draft.temperatura,
        classificacao: draft.classificacao,
        risco: draft.risco,
        conclusao: draft.conclusao,
        fotoDigitalUrl,
        fotoTermicaUrl,
      };

      const atualizados = adicionandoPonto
        ? [...pontosBase.map((item) => removerFotosAssinadas(item as PontoComFotos)), pontoSalvo]
        : pontosBase.map((item) => {
          if (item.id !== ponto.id) return removerFotosAssinadas(item as PontoComFotos);
          return pontoSalvo;
        });

      const { error } = await supabase
        .from('relatorios_termografia')
        .update({ pontos: atualizados })
        .eq('id', data.id);

      if (error) throw error;

      const assinados = await Promise.all(atualizados.map(async (item) => ({
        ...item,
        fotoDigitalSrc: `${setor}|||${local}` === `${item.setor}|||${item.local}` && item.fotoDigitalUrl ? await getUrlArquivo(item.fotoDigitalUrl) : null,
        fotoTermicaSrc: `${setor}|||${local}` === `${item.setor}|||${item.local}` && item.fotoTermicaUrl ? await getUrlArquivo(item.fotoTermicaUrl) : null,
      })));
      setPontos(assinados);
      setData({ ...data, pontos: atualizados });
      setLinhaSelecionada(`${setor}|||${local}`);
      cancelarEdicao();
      toast.success(adicionandoPonto ? 'Ponto adicionado.' : 'Registro atualizado.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar registro.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 pb-20">
      <Toaster position="bottom-center" />
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div>
          <Link href="/termografia" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium">
            <ArrowLeft size={18} /> Voltar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">{data.numero_relatorio}</h1>
          <p className="text-gray-500">{data.cliente_nome}</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-3 py-2">
            <input
              type="checkbox"
              checked={incluirFotosSemOcorrencia}
              onChange={(e) => setIncluirFotosSemOcorrencia(e.target.checked)}
              className="h-4 w-4"
            />
            Incluir fotos sem ocorrência na impressão
          </label>
          <button
            onClick={() => router.push(`/termografia/${params.id}/imprimir${incluirFotosSemOcorrencia ? '?fotos=1' : ''}`)}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700"
          >
            <Printer size={18} /> Imprimir Relatório
          </button>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <FileText size={18} /> Roteiro
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-gray-600">
              Pontos inspecionados
              <strong className="text-base leading-none text-gray-900">{pontosBase.length}</strong>
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-orange-700">
              Ocorrências
              <strong className="text-base leading-none text-orange-600">{ocorrencias.length}</strong>
            </span>
            <button
              type="button"
              onClick={abrirNovoPonto}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
            >
              <Plus size={14} /> Adicionar ponto
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm md:min-w-0">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="p-3 text-left">Setor/área</th><th className="p-3 text-left">Local</th><th className="p-3 text-center">Pontos aquecidos</th><th className="p-3 text-center">Classificação</th><th className="p-3 text-center">Inspecionado</th><th className="w-16 p-3 text-right">Ação</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roteiro.map((linha, i) => {
                const chave = `${linha.setor}|||${linha.local}`;
                const selecionada = chaveSelecionada === chave;
                const classificacao = classificacaoDaLinha(pontosBase.filter((p) => p.setor === linha.setor && p.local === linha.local));
                return (
                <tr
                  key={`${linha.setor}-${linha.local}-${i}`}
                  onClick={() => abrirDetalhes(chave)}
                  className={`cursor-pointer transition-colors ${linha.pontosAquecidos > 0 ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'} ${selecionada ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                >
                  <td className="p-3 font-medium">{linha.setor}</td>
                  <td className="p-3">{linha.local}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${linha.pontosAquecidos > 0 ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {linha.pontosAquecidos}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${classificacaoClasses[classificacao] ?? classificacaoClasses.Normal}`}>
                      {classificacao}
                    </span>
                  </td>
                  <td className="p-3 text-center">s</td>
                  <td className="w-16 p-3 text-right">
                    <button
                      type="button"
                      aria-label="Ver e editar registro"
                      title="Ver e editar"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirDetalhes(chave);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-blue-600 hover:border-blue-200 hover:bg-blue-50"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(chaveSelecionada || adicionandoPonto) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <section className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
              <div>
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                  <Camera size={18} /> {adicionandoPonto ? 'Adicionar ponto' : 'Detalhes do registro'}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {adicionandoPonto ? 'Novo item do roteiro' : `${pontosSelecionados[0]?.setor || '-'} | ${pontosSelecionados[0]?.local || '-'}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  cancelarEdicao();
                  setLinhaSelecionada(null);
                }}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar detalhes"
              >
                <X size={18} />
              </button>
            </div>
            {carregandoFotos ? (
              <div className="p-8 text-center text-gray-500">Carregando fotos...</div>
            ) : pontosDoModal.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhum registro encontrado para este item.</div>
            ) : (
              <div className="max-h-[calc(92vh-80px)] overflow-y-auto divide-y divide-gray-100">
            {pontosDoModal.map((ponto, index) => {
              const fotoDigital = (ponto as PontoComFotos).fotoDigitalSrc;
              const fotoTermica = (ponto as PontoComFotos).fotoTermicaSrc;
              const editando = adicionandoPonto || editandoId === ponto.id;
              return (
                <div key={ponto.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="font-semibold text-gray-900">{adicionandoPonto ? 'Novo ponto' : `Registro ${index + 1} - ${ponto.local}`}</div>
                      <div className="text-sm text-gray-500">{adicionandoPonto ? 'Preencha os dados para incluir no roteiro' : `${ponto.setor} ${ponto.ocorrencia ? '| Ocorrência' : '| Sem ocorrência'}`}</div>
                    </div>
                    {editando && !adicionandoPonto ? (
                      <button onClick={cancelarEdicao} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm font-medium"><X size={16} /> Cancelar</button>
                    ) : !adicionandoPonto ? (
                      <button onClick={() => iniciarEdicao(ponto as PontoComFotos)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"><Edit3 size={16} /> Editar</button>
                    ) : null}
                  </div>

                  {editando ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className={labelClass}>Setor/área</label><input value={draft.setor ?? ''} onChange={(e) => setDraft((d) => ({ ...d, setor: e.target.value }))} className={inputClass} /></div>
                        <div><label className={labelClass}>Local</label><input value={draft.local ?? ''} onChange={(e) => setDraft((d) => ({ ...d, local: e.target.value }))} className={inputClass} /></div>
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                          <input type="checkbox" checked={Boolean(draft.ocorrencia)} onChange={(e) => setDraft((d) => ({ ...d, ocorrencia: e.target.checked }))} className="h-4 w-4" />
                          Ocorrência
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                          <input type="checkbox" checked={Boolean(draft.inspecionado)} onChange={(e) => setDraft((d) => ({ ...d, inspecionado: e.target.checked }))} className="h-4 w-4" />
                          Inspecionado
                        </label>
                      </div>
                      {draft.ocorrencia && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div><label className={labelClass}>Componente</label><input value={draft.componente ?? ''} onChange={(e) => setDraft((d) => ({ ...d, componente: e.target.value }))} className={inputClass} /></div>
                          <div><label className={labelClass}>Temperatura</label><input value={draft.temperatura ?? ''} onChange={(e) => setDraft((d) => ({ ...d, temperatura: e.target.value }))} className={inputClass} /></div>
                          <div>
                            <label className={labelClass}>Classificação</label>
                            <select value={draft.classificacao ?? 'Intervenção Programada'} onChange={(e) => setDraft((d) => ({ ...d, classificacao: e.target.value as TermografiaClassificacao, conclusao: d.conclusao || conclusoesPadrao[e.target.value as TermografiaClassificacao] }))} className={inputClass}>
                              {Object.keys(conclusoesPadrao).map((c) => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Risco</label>
                            <select value={draft.risco ?? 'Baixo'} onChange={(e) => setDraft((d) => ({ ...d, risco: e.target.value as TermografiaRisco }))} className={inputClass}>
                              <option>Baixo</option><option>Médio</option><option>Alto</option>
                            </select>
                          </div>
                          <div className="md:col-span-2"><label className={labelClass}>Conclusão</label><input value={draft.conclusao ?? ''} onChange={(e) => setDraft((d) => ({ ...d, conclusao: e.target.value }))} className={inputClass} /></div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="border border-dashed border-gray-300 rounded-md p-3 text-sm font-medium text-gray-700 cursor-pointer text-center hover:border-blue-400">
                          {adicionandoPonto ? 'Adicionar foto digital' : 'Trocar foto digital'}
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFotoDigitalFile(e.target.files?.[0] ?? null)} />
                        </label>
                        <label className="border border-dashed border-gray-300 rounded-md p-3 text-sm font-medium text-gray-700 cursor-pointer text-center hover:border-blue-400">
                          {adicionandoPonto ? 'Adicionar foto térmica' : 'Trocar foto térmica'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFotoTermicaFile(e.target.files?.[0] ?? null)} />
                        </label>
                      </div>
                      <button disabled={salvando} onClick={() => salvarEdicao(ponto as PontoComFotos)} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-bold">
                        <Save size={16} /> {salvando ? 'Salvando...' : adicionandoPonto ? 'Adicionar ponto' : 'Salvar alterações'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {ponto.ocorrencia && (
                        <div className="text-sm text-gray-700 mb-3">
                          <div><strong>Componente:</strong> {ponto.componente || '-'}</div>
                          <div><strong>Temperatura:</strong> {ponto.temperatura || '-'}</div>
                          <div><strong>Classificação:</strong> {ponto.classificacao || '-'} | <strong>Risco:</strong> {ponto.risco || '-'}</div>
                          <div className="mt-1 text-gray-500">{ponto.conclusao}</div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-500 mb-1">Digital</div>
                          {fotoDigital ? <img src={fotoDigital} alt="Foto digital" className="w-full h-56 object-cover rounded border" /> : <div className="h-56 rounded border flex items-center justify-center text-gray-400 text-sm">Sem foto</div>}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500 mb-1">Térmica</div>
                          {fotoTermica ? <img src={fotoTermica} alt="Foto termográfica" className="w-full h-56 object-cover rounded border" /> : <div className="h-56 rounded border flex items-center justify-center text-gray-400 text-sm">Sem foto</div>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
