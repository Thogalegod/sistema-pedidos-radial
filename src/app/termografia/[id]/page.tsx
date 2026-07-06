'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Download, Edit3, Eye, FileText, Plus, Printer, RotateCcw, Save, Scissors, Target, Trash2, X } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast, Toaster } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { getUrlArquivo, getUrlDownload, uploadArquivo } from '@/lib/storage';
import { conclusoesPadrao, gerarIdPonto, pontosAquecidosPorSetorLocal, type TermografiaClassificacao, type TermografiaDadosGerais, type TermografiaPonto, type TermografiaRelatorio, type TermografiaRisco } from '@/lib/termografia/types';
import {
  nomeFotoOriginalVersionada,
  nomeFotoPonto,
  nomeFotoPontoVersionada,
  recortarImagem,
} from '@/lib/termografia/images';
import { deletarRelatorio } from '@/lib/termografia/delete';
import { GeneralDataEditor } from '@/components/termografia/GeneralDataEditor';
import { PhotoCropDialog } from '@/components/termografia/PhotoCropDialog';
import { PhotoAnnotationDialog } from '@/components/termografia/PhotoAnnotationDialog';

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

const prioridadeClassificacao = ['Crítico', 'Intervenção Imediata', 'Intervenção Programada', 'Observação', 'Normal'] as const;

function classificacaoDaLinha(pontos: TermografiaPonto[]) {
  const classificacoes = pontos.filter((p) => p.ocorrencia).map((p) => p.classificacao || 'Intervenção Programada');
  return prioridadeClassificacao.find((c) => classificacoes.includes(c)) || 'Normal';
}

async function prepararImagem(file: File) {
  if (!file.type.startsWith('image/')) return file;
  return imageCompression(file, { maxSizeMB: 1.2, maxWidthOrHeight: 1800, useWebWorker: true });
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
  const [mostrarEditor, setMostrarEditor] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [excluindoRelatorio, setExcluindoRelatorio] = useState(false);
  const [cropPontoId, setCropPontoId] = useState<string | null>(null);
  const [cropTipo, setCropTipo] = useState<'digital' | 'termica'>('digital');
  const [annotateFile, setAnnotateFile] = useState<File | null>(null);
  const [annotatePontoId, setAnnotatePontoId] = useState<string | null>(null);

  // Cache de URLs assinadas
  const cacheUrls = useRef<Map<string, string | null>>(new Map());

  // Carregar dados
  useEffect(() => {
    supabase
      .from('relatorios_termografia')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(({ data: rel, error }) => {
        if (error || !rel) {
          setData(false);
          return;
        }
        const relData = rel as TermografiaRelatorio;
        setData(relData);
        // Inicializar pontos com os dados persistidos — esse é o fix do bug das fotos
        setPontos(relData.pontos?.map((p: TermografiaPonto) => ({ ...p, fotoDigitalSrc: null, fotoTermicaSrc: null })) ?? []);
      });
  }, [params.id]);

  // Função para carregar URL assinada com cache em memória
  const carregarUrlAssinada = useCallback(async (caminho: string, pontoId: string, tipo: 'digital' | 'termica'): Promise<string | null> => {
    const chave = `${pontoId}-${tipo}`;
    if (cacheUrls.current.has(chave)) return cacheUrls.current.get(chave) ?? null;
    const url = await getUrlArquivo(caminho);
    cacheUrls.current.set(chave, url);
    return url;
  }, []);

  // Carregar fotos de uma linha específica
  const abrirDetalhes = async (chave: string) => {
    setLinhaSelecionada(chave);
    setEditandoId(null);
    const pontosDaLinha = pontos.filter((p) => `${p.setor}|||${p.local}` === chave);
    const precisaCarregar = pontosDaLinha.some(
      (p) => (p.fotoDigitalUrl && !p.fotoDigitalSrc) || (p.fotoTermicaUrl && !p.fotoTermicaSrc),
    );
    if (!precisaCarregar) return;

    setCarregandoFotos(true);
    try {
      const assinados = await Promise.all(pontosDaLinha.map(async (ponto) => ({
        ...ponto,
        fotoDigitalSrc: ponto.fotoDigitalUrl ? await carregarUrlAssinada(ponto.fotoDigitalUrl, ponto.id, 'digital') : null,
        fotoTermicaSrc: ponto.fotoTermicaUrl ? await carregarUrlAssinada(ponto.fotoTermicaUrl, ponto.id, 'termica') : null,
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

  // Download de foto
  const baixarFoto = async (caminho: string, pontoId: string, tipo: 'digital' | 'termica') => {
    try {
      const url = await getUrlDownload(caminho, nomeFotoPonto(pontoId, tipo));
      window.open(url, '_blank');
    } catch {
      toast.error('Não foi possível baixar a foto.');
    }
  };

  // Edição geral
  const salvarDadosGerais = async (novosDados: TermografiaDadosGerais) => {
    if (!data) return;
    const { error } = await supabase
      .from('relatorios_termografia')
      .update(novosDados)
      .eq('id', data.id);
    if (error) throw error;
    setData({ ...data, ...novosDados });
    setMostrarEditor(false);
    toast.success('Dados atualizados.');
  };
  // Exclusão do relatório
  const excluirRelatorio = async () => {
    if (!data) return;
    if (!window.confirm(`Tem certeza que deseja excluir o relatório ${data.numero_relatorio}? Esta ação não pode ser desfeita.`)) return;
    setExcluindoRelatorio(true);
    try {
      const { error } = await deletarRelatorio(data.id, data.numero_relatorio);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Relatório excluído.');
      router.push('/termografia');
    } catch {
      toast.error('Erro ao excluir relatório.');
    } finally {
      setExcluindoRelatorio(false);
    }
  };

  if (data === false) return <div className="p-8 text-center text-red-600">Relatório não encontrado.</div>;
  if (!data) return <div className="p-8 text-center">Carregando relatório...</div>;

  const ocorrencias = pontos.filter((p) => p.ocorrencia);
  const roteiro = pontosAquecidosPorSetorLocal(pontos);
  const chaveSelecionada = linhaSelecionada;
  const adicionandoPonto = editandoId === 'novo';
  const pontosSelecionados = chaveSelecionada
    ? pontos.filter((p) => `${p.setor}|||${p.local}` === chaveSelecionada)
    : [];
  const pontosDoModal: PontoComFotos[] = adicionandoPonto
    ? [{
        id: 'novo', setor: draft.setor ?? '', local: draft.local ?? '',
        inspecionado: Boolean(draft.inspecionado), ocorrencia: Boolean(draft.ocorrencia),
        componente: draft.componente, temperatura: draft.temperatura,
        classificacao: draft.classificacao as TermografiaClassificacao | undefined,
        risco: draft.risco as TermografiaRisco | undefined,
        conclusao: draft.conclusao,
      }]
    : pontosSelecionados;

  const abrirNovoPonto = () => {
    setLinhaSelecionada(null);
    setEditandoId('novo');
    setDraft({ setor: '', local: '', inspecionado: true, ocorrencia: false, classificacao: 'Intervenção Programada' as TermografiaClassificacao, risco: 'Baixo' as TermografiaRisco, conclusao: conclusoesPadrao['Intervenção Programada'] });
    setFotoDigitalFile(null);
    setFotoTermicaFile(null);
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
    if (!setor || !local) { toast.error('Informe setor/área e local.'); return; }

    setSalvando(true);
    try {
      const novoId = gerarIdPonto();
      let fotoDigitalUrl = draft.fotoDigitalUrl ?? ponto.fotoDigitalUrl ?? null;
      let fotoTermicaUrl = draft.fotoTermicaUrl ?? ponto.fotoTermicaUrl ?? null;
      const pontoId = adicionandoPonto ? novoId : ponto.id;
      const revisao = Date.now();

      if (fotoDigitalFile) {
        const file = await prepararImagem(fotoDigitalFile);
        fotoDigitalUrl = await uploadArquivo(
          file,
          `termografia/${data.numero_relatorio}`,
          nomeFotoPontoVersionada(pontoId, 'digital', revisao),
        );
      }
      if (fotoTermicaFile) {
        const file = await prepararImagem(fotoTermicaFile);
        fotoTermicaUrl = await uploadArquivo(
          file,
          `termografia/${data.numero_relatorio}`,
          nomeFotoPontoVersionada(pontoId, 'termica', revisao),
        );
      }

      const pontoSalvo: TermografiaPonto = {
        id: pontoId, setor, local,
        inspecionado: Boolean(draft.inspecionado), ocorrencia: Boolean(draft.ocorrencia),
        componente: draft.componente, temperatura: draft.temperatura,
        classificacao: draft.classificacao as TermografiaClassificacao, risco: draft.risco as TermografiaRisco,
        conclusao: draft.conclusao, fotoDigitalUrl, fotoTermicaUrl,
      };

      const atualizados = adicionandoPonto
        ? [...pontos.map(removerFotosAssinadas), pontoSalvo]
        : pontos.map((item) => item.id !== ponto.id ? removerFotosAssinadas(item) : pontoSalvo);

      const { error } = await supabase.from('relatorios_termografia').update({ pontos: atualizados }).eq('id', data.id);
      if (error) throw error;

      // Atualizar estado local com URLs assinadas
      const comUrls = await Promise.all(atualizados.map(async (item) => ({
        ...item,
        fotoDigitalSrc: item.id === pontoId && item.fotoDigitalUrl ? await carregarUrlAssinada(item.fotoDigitalUrl, item.id, 'digital') : null,
        fotoTermicaSrc: item.id === pontoId && item.fotoTermicaUrl ? await carregarUrlAssinada(item.fotoTermicaUrl, item.id, 'termica') : null,
      })));
      setPontos(comUrls);
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

  // Exclusão de ponto
  const excluirPonto = async (ponto: PontoComFotos) => {
    if (!window.confirm(`Excluir ${ponto.local || 'este ponto'}?`)) return;
    setExcluindo(true);
    try {
      const atualizados = pontos.filter((p) => p.id !== ponto.id).map(removerFotosAssinadas);
      const { error } = await supabase.from('relatorios_termografia').update({ pontos: atualizados }).eq('id', data.id);
      if (error) throw error;
      setPontos(atualizados.map((p) => ({ ...p, fotoDigitalSrc: null, fotoTermicaSrc: null })));
      setData({ ...data, pontos: atualizados });
      setLinhaSelecionada(null);
      cancelarEdicao();
      toast.success('Ponto excluído.');
    } catch {
      toast.error('Erro ao excluir ponto.');
    } finally {
      setExcluindo(false);
    }
  };

  // Fetch photo as File for cropping
  const fetchPhotoAsFile = async (url: string, nome: string): Promise<File> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], nome, { type: blob.type });
  };

  // Open crop dialog for a photo
  const abrirCrop = async (ponto: PontoComFotos, tipo: 'digital' | 'termica') => {
    const src = tipo === 'digital' ? ponto.fotoDigitalSrc : ponto.fotoTermicaSrc;
    if (!src) return;
    try {
      const file = await fetchPhotoAsFile(src, nomeFotoPonto(ponto.id, tipo));
      setCropFile(file);
      setCropPontoId(ponto.id);
      setCropTipo(tipo);
    } catch {
      toast.error('Não foi possível carregar a foto para recorte.');
    }
  };

  // Handle crop confirmation
  const handleCropConfirm = async (file: File) => {
    if (!data || !cropPontoId || !cropTipo) return;
    try {
      const filePreparado = await prepararImagem(file);
      const caminhoArquivo = await uploadArquivo(
        filePreparado,
        `termografia/${data.numero_relatorio}`,
        nomeFotoPontoVersionada(cropPontoId, cropTipo),
      );

      // Clear cache and get new signed URL
      const chave = `${cropPontoId}-${cropTipo}`;
      cacheUrls.current.delete(chave);
      const novaUrl = await getUrlArquivo(caminhoArquivo);
      cacheUrls.current.set(chave, novaUrl);

      // Update pontos state with new signed URL
      const atualizados = pontos.map((item) => {
        if (item.id !== cropPontoId) return removerFotosAssinadas(item);
        return {
          ...removerFotosAssinadas(item),
          ...(cropTipo === 'digital'
            ? { fotoDigitalUrl: caminhoArquivo }
            : { fotoTermicaUrl: caminhoArquivo }),
        };
      });
      const { error } = await supabase.from('relatorios_termografia').update({ pontos: atualizados }).eq('id', data.id);
      if (error) throw error;

      setPontos((atuais) => atuais.map((item) => ({
        ...item,
        ...(cropTipo === 'digital' && item.id === cropPontoId ? { fotoDigitalSrc: novaUrl, fotoDigitalUrl: caminhoArquivo } : {}),
        ...(cropTipo === 'termica' && item.id === cropPontoId ? { fotoTermicaSrc: novaUrl, fotoTermicaUrl: caminhoArquivo } : {}),
      })));
      setData({ ...data, pontos: atualizados });

      toast.success('Foto recortada com sucesso.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao recortar foto.');
    } finally {
      setCropFile(null);
      setCropPontoId(null);
      setCropTipo('digital');
    }
  };

  // Open annotation dialog for a digital photo
  const abrirAnnotacao = async (ponto: PontoComFotos) => {
    const src = ponto.fotoDigitalSrc;
    if (!src) return;
    try {
      const file = await fetchPhotoAsFile(src, nomeFotoPonto(ponto.id, 'digital'));
      setAnnotateFile(file);
      setAnnotatePontoId(ponto.id);
    } catch {
      toast.error('Não foi possível carregar a foto para marcação.');
    }
  };

  // Handle annotation confirmation
  const handleAnnotateConfirm = async (annotatedFile: File) => {
    if (!data || !annotatePontoId) return;
    try {
      const filePreparado = await prepararImagem(annotatedFile);
      const caminhoArquivo = await uploadArquivo(
        filePreparado,
        `termografia/${data.numero_relatorio}`,
        nomeFotoPontoVersionada(annotatePontoId, 'digital'),
      );

      // Clear cache and get new signed URL
      const chave = `${annotatePontoId}-digital`;
      cacheUrls.current.delete(chave);
      const novaUrl = await getUrlArquivo(caminhoArquivo);
      cacheUrls.current.set(chave, novaUrl);

      const atualizados = pontos.map((item) => {
        if (item.id !== annotatePontoId) return removerFotosAssinadas(item);
        return { ...removerFotosAssinadas(item), fotoDigitalUrl: caminhoArquivo };
      });
      const { error } = await supabase.from('relatorios_termografia').update({ pontos: atualizados }).eq('id', data.id);
      if (error) throw error;

      // Update pontos state with new signed URL
      setPontos((atuais) => atuais.map((item) => ({
        ...item,
        ...(item.id === annotatePontoId ? { fotoDigitalSrc: novaUrl, fotoDigitalUrl: caminhoArquivo } : {}),
      })));
      setData({ ...data, pontos: atualizados });

      toast.success('Marcações salvas com sucesso.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar marcações.');
    } finally {
      setAnnotateFile(null);
      setAnnotatePontoId(null);
    }
  };

  // Restore original digital photo
  const restaurarOriginal = async (ponto: PontoComFotos) => {
    if (!data || !ponto.fotoDigitalOriginalUrl) return;
    try {
      // Update DB: set fotoDigitalUrl back to original path
      const atualizados = pontos.map((p) => {
        if (p.id !== ponto.id) return p;
        return { ...p, fotoDigitalUrl: ponto.fotoDigitalOriginalUrl };
      });

      const { error } = await supabase.from('relatorios_termografia').update({ pontos: atualizados.map(removerFotosAssinadas) }).eq('id', data.id);
      if (error) throw error;

      // Clear cache and reload signed URL for the original
      const chave = `${ponto.id}-digital`;
      cacheUrls.current.delete(chave);
      const novaUrl = await getUrlArquivo(ponto.fotoDigitalOriginalUrl);
      cacheUrls.current.set(chave, novaUrl);

      setPontos(atualizados.map((item) => ({
        ...item,
        ...(item.id === ponto.id ? { fotoDigitalSrc: novaUrl, fotoDigitalUrl: ponto.fotoDigitalOriginalUrl } : {}),
      })));
      setData({ ...data, pontos: atualizados.map(removerFotosAssinadas) });

      toast.success('Foto original restaurada.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao restaurar foto.');
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
        <div className="flex flex-wrap items-start gap-3">
          <button
            type="button"
            onClick={() => setMostrarEditor(true)}
            className="inline-flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-md font-medium hover:bg-gray-50"
          >
            <Edit3 size={16} /> Editar dados
          </button>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-3 py-2 cursor-pointer">
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
          <button
            type="button"
            onClick={excluirRelatorio}
            disabled={excluindoRelatorio}
            className="inline-flex items-center gap-2 border border-red-200 bg-white text-red-600 px-4 py-2 rounded-md font-medium hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={16} /> {excluindoRelatorio ? 'Excluindo...' : 'Excluir'}
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
              <strong className="text-base leading-none text-gray-900">{pontos.length}</strong>
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
                const classificacao = classificacaoDaLinha(pontos.filter((p) => p.setor === linha.setor && p.local === linha.local));
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
                        onClick={(e) => { e.stopPropagation(); abrirDetalhes(chave); }}
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

      {/* Modal de detalhes/edição */}
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
                onClick={() => { cancelarEdicao(); setLinhaSelecionada(null); }}
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
                  const editando = adicionandoPonto || editandoId === ponto.id;
                  return (
                    <div key={ponto.id} className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="font-semibold text-gray-900">{adicionandoPonto ? 'Novo ponto' : `Registro ${index + 1} - ${ponto.local}`}</div>
                          <div className="text-sm text-gray-500">
                            {adicionandoPonto ? 'Preencha os dados para incluir no roteiro' : `${ponto.setor} ${ponto.ocorrencia ? '| Ocorrência' : '| Sem ocorrência'}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {editando && !adicionandoPonto ? (
                            <button onClick={cancelarEdicao} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm font-medium"><X size={16} /> Cancelar</button>
                          ) : !adicionandoPonto ? (
                            <>
                              <button onClick={() => iniciarEdicao(ponto)} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"><Edit3 size={16} /> Editar</button>
                              <button onClick={() => excluirPonto(ponto)} disabled={excluindo} className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium"><Trash2 size={16} /> Excluir</button>
                            </>
                          ) : null}
                        </div>
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
                              <div><label className={labelClass}>Risco</label>
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
                          <button disabled={salvando} onClick={() => salvarEdicao(ponto)} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-bold">
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
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-500">Digital</span>
                                {ponto.fotoDigitalUrl && (
                                  <button onClick={() => baixarFoto(ponto.fotoDigitalUrl!, ponto.id, 'digital')} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                      <Download size={12} /> Baixar
                                    </button>
                                  )}
                                  {ponto.fotoDigitalUrl && (ponto as PontoComFotos).fotoDigitalSrc && (
                                      <button onClick={() => abrirCrop(ponto, 'digital')} className="text-xs text-green-600 hover:underline inline-flex items-center gap-1">
                                        <Scissors size={12} /> Recortar
                                      </button>
                                    )}
                                    {ponto.ocorrencia && ponto.fotoDigitalUrl && (ponto as PontoComFotos).fotoDigitalSrc && (
                                      <button onClick={() => abrirAnnotacao(ponto)} className="text-xs text-purple-600 hover:underline inline-flex items-center gap-1">
                                        <Target size={12} /> Marcar componentes
                                      </button>
                                    )}
                                    {ponto.fotoDigitalOriginalUrl && ponto.fotoDigitalUrl !== ponto.fotoDigitalOriginalUrl && (
                                      <button onClick={() => void restaurarOriginal(ponto)} className="text-xs text-orange-600 hover:underline inline-flex items-center gap-1">
                                        <RotateCcw size={12} /> Restaurar original
                                      </button>
                                    )}
                                  </div>
                              {(ponto as PontoComFotos).fotoDigitalSrc
                                ? <img src={(ponto as PontoComFotos).fotoDigitalSrc!} alt="Foto digital" className="w-full h-56 object-cover rounded border" />
                                : ponto.fotoDigitalUrl
                                  ? <div className="h-56 rounded border flex items-center justify-center text-gray-400 text-sm">Carregando...</div>
                                  : <div className="h-56 rounded border flex items-center justify-center text-gray-400 text-sm">Sem foto</div>}
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-500">Térmica</span>
                                {ponto.fotoTermicaUrl && (
                                  <button onClick={() => baixarFoto(ponto.fotoTermicaUrl!, ponto.id, 'termica')} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                                      <Download size={12} /> Baixar
                                    </button>
                                  )}
                                  {ponto.fotoTermicaUrl && (ponto as PontoComFotos).fotoTermicaSrc && (
                                    <button onClick={() => abrirCrop(ponto, 'termica')} className="text-xs text-green-600 hover:underline inline-flex items-center gap-1">
                                      <Scissors size={12} /> Recortar
                                    </button>
                                  )}
                                  </div>
                              {(ponto as PontoComFotos).fotoTermicaSrc
                                ? <img src={(ponto as PontoComFotos).fotoTermicaSrc!} alt="Foto termográfica" className="w-full h-56 object-cover rounded border" />
                                : ponto.fotoTermicaUrl
                                  ? <div className="h-56 rounded border flex items-center justify-center text-gray-400 text-sm">Carregando...</div>
                                  : <div className="h-56 rounded border flex items-center justify-center text-gray-400 text-sm">Sem foto</div>}
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

      {/* Editor de dados gerais */}
      {mostrarEditor && data && (
        <GeneralDataEditor
          relatorio={data}
          onSave={salvarDadosGerais}
          onClose={() => setMostrarEditor(false)}
        />
      )}
      {cropFile && (
        <PhotoCropDialog
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => { setCropFile(null); setCropPontoId(null); }}
        />
      )}
      {annotateFile && annotatePontoId && (
        <PhotoAnnotationDialog
          file={annotateFile}
          onConfirm={handleAnnotateConfirm}
          onCancel={() => { setAnnotateFile(null); setAnnotatePontoId(null); }}
        />
      )}
    </div>
  );
}
