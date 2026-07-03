'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { limparPontoPersistido, type PontoTransitorio } from '@/lib/termografia/draft';
import type { TermografiaDadosGerais, TermografiaRelatorio } from '@/lib/termografia/types';
import type { SaveStatus } from '@/components/termografia/SaveStatusBanner';

type Query = PromiseLike<{ data?: unknown; error?: unknown; count?: number | null }> & {
  select(...args: unknown[]): Query;
  eq(...args: unknown[]): Query;
  gte(...args: unknown[]): Query;
  order(...args: unknown[]): Query;
  limit(...args: unknown[]): Query;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  single(): Promise<{ data: unknown; error: unknown }>;
  insert(payload: unknown): Query;
  update(payload: unknown): Query;
};

export type TermografiaDraftClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error?: unknown }> };
  from(table: string): Query;
  rpc(name: string, args?: Record<string, never>): Promise<{ data: unknown; error: unknown }>;
};

type UploadPendente = boolean | (() => boolean);

export type UseTermografiaDraftOptions = {
  client?: TermografiaDraftClient;
  uploadPendente?: UploadPendente;
};

export interface UseTermografiaDraftResult {
  relatorio: TermografiaRelatorio | null;
  dados: TermografiaDadosGerais;
  pontos: PontoTransitorio[];
  saveStatus: SaveStatus;
  salvoEm: Date | null;
  carregando: boolean;
  atualizarDados(patch: Partial<TermografiaDadosGerais>): void;
  atualizarPontos(pontos: PontoTransitorio[]): void;
  salvarAgora(): Promise<void>;
  repetir(): Promise<void>;
  finalizar(): Promise<string>;
}

const dadosIniciais = (): TermografiaDadosGerais => ({
  cliente_nome: '', cliente_cnpj: '', cliente_endereco: '', cliente_cidade: '', cliente_uf: 'SP',
  cliente_cep: '', data_execucao: new Date().toISOString().slice(0, 10),
  objetivo: 'Estudo Termográfico da subestação primária e dos painéis elétricos',
  equipamento: 'Flir InfraCAM SD', responsavel_nome: 'Roberto Fontes Lopes', responsavel_crea: '0601049229',
});

function extrairDados(relatorio: TermografiaRelatorio): TermografiaDadosGerais {
  return {
    cliente_nome: relatorio.cliente_nome, cliente_cnpj: relatorio.cliente_cnpj ?? '',
    cliente_endereco: relatorio.cliente_endereco, cliente_cidade: relatorio.cliente_cidade,
    cliente_uf: relatorio.cliente_uf, cliente_cep: relatorio.cliente_cep ?? '',
    data_execucao: relatorio.data_execucao, objetivo: relatorio.objetivo, equipamento: relatorio.equipamento,
    responsavel_nome: relatorio.responsavel_nome, responsavel_crea: relatorio.responsavel_crea,
  };
}

function temUploadPendente(valor: UploadPendente | undefined) {
  return typeof valor === 'function' ? valor() : Boolean(valor);
}

export function useTermografiaDraft(options: UseTermografiaDraftOptions = {}): UseTermografiaDraftResult {
  const client = (options.client ?? supabase) as unknown as TermografiaDraftClient;
  const [relatorio, setRelatorio] = useState<TermografiaRelatorio | null>(null);
  const [dados, setDados] = useState<TermografiaDadosGerais>(dadosIniciais);
  const [pontos, setPontos] = useState<PontoTransitorio[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('salvando');
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [carregando, setCarregando] = useState(true);
  const relatorioRef = useRef<TermografiaRelatorio | null>(null);
  const dadosRef = useRef(dados);
  const pontosRef = useRef(pontos);
  const dirtyRef = useRef(false);
  const onlineRef = useRef(typeof navigator === 'undefined' || navigator.onLine);
  const versaoRef = useRef(0);
  const ultimaAplicadaRef = useRef(0);
  const filaRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montadoRef = useRef(true);
  const inicializacaoRef = useRef(0);
  const finalizandoRef = useRef(false);
  const finalizacaoRef = useRef<Promise<string> | null>(null);

  const salvarAgora = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const atual = relatorioRef.current;
    if (!atual || !dirtyRef.current) return filaRef.current;
    if (!onlineRef.current) { setSaveStatus('offline'); return; }

    const versao = versaoRef.current;
    const payload = { ...dadosRef.current, pontos: pontosRef.current.map(limparPontoPersistido) };
    setSaveStatus('salvando');
    const operacao = async () => {
      const { error } = await client.from('relatorios_termografia').update(payload).eq('id', atual.id);
      if (error) {
        dirtyRef.current = true;
        if (montadoRef.current) setSaveStatus('erro');
        throw error;
      }
      ultimaAplicadaRef.current = Math.max(ultimaAplicadaRef.current, versao);
      if (montadoRef.current && versao === versaoRef.current) {
        dirtyRef.current = false;
        const agora = new Date();
        setSalvoEm(agora); setSaveStatus('salvo');
        setRelatorio((valor) => valor ? { ...valor, ...payload, atualizado_em: agora.toISOString() } : valor);
      }
    };
    filaRef.current = filaRef.current.catch(() => undefined).then(operacao);
    return filaRef.current;
  }, [client]);

  const agendar = useCallback(() => {
    if (finalizandoRef.current) return;
    dirtyRef.current = true; versaoRef.current += 1;
    if (!onlineRef.current) { setSaveStatus('offline'); return; }
    setSaveStatus('salvando');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void salvarAgora().catch(() => undefined); }, 800);
  }, [salvarAgora]);

  const atualizarDados = useCallback((patch: Partial<TermografiaDadosGerais>) => {
    if (finalizandoRef.current) return;
    const valor = { ...dadosRef.current, ...patch }; dadosRef.current = valor; setDados(valor); agendar();
  }, [agendar]);
  const atualizarPontos = useCallback((valor: PontoTransitorio[]) => {
    if (finalizandoRef.current) return;
    pontosRef.current = valor; setPontos(valor); agendar();
  }, [agendar]);

  const inicializar = useCallback(async () => {
    const geracao = ++inicializacaoRef.current;
    setCarregando(true); setSaveStatus('salvando');
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error('Não autenticado');
      const busca = await client.from('relatorios_termografia').select('*')
        .eq('criado_por', auth.user.id).eq('status', 'rascunho')
        .order('atualizado_em', { ascending: false }).limit(1).maybeSingle();
      if (busca.error) throw busca.error;
      let valor = busca.data as TermografiaRelatorio | null;
      if (!valor) {
        const criado = await client.rpc('criar_rascunho_termografia');
        if (criado.error) throw criado.error;
        valor = criado.data as TermografiaRelatorio;
      }
      if (!montadoRef.current || geracao !== inicializacaoRef.current) return;
      relatorioRef.current = valor; dadosRef.current = extrairDados(valor); pontosRef.current = valor.pontos ?? [];
      setRelatorio(valor); setDados(dadosRef.current); setPontos(pontosRef.current); setSaveStatus('salvo');
      if (valor.atualizado_em) setSalvoEm(new Date(valor.atualizado_em));
    } catch (error) {
      if (montadoRef.current && geracao === inicializacaoRef.current) setSaveStatus('erro');
      throw error;
    } finally {
      if (montadoRef.current && geracao === inicializacaoRef.current) setCarregando(false);
    }
  }, [client]);

  const repetir = useCallback(async () => {
    if (!relatorioRef.current) { await inicializar(); return; }
    dirtyRef.current = true; await salvarAgora();
  }, [inicializar, salvarAgora]);

  const finalizar = useCallback(() => {
    if (finalizacaoRef.current) return finalizacaoRef.current;
    finalizandoRef.current = true;
    const finalizacao = (async () => {
      try {
        if (temUploadPendente(options.uploadPendente)) throw new Error('Não é possível finalizar com uploads pendentes.');
        await salvarAgora();
        await filaRef.current;
        if (temUploadPendente(options.uploadPendente)) throw new Error('Não é possível finalizar com uploads pendentes.');
        // dirtyRef pode ficar true por race condition entre versão e re-render.
        // Se chegamos aqui, o save já foi aplicado — força limpar.
        dirtyRef.current = false;
        if (!dadosRef.current.cliente_nome.trim()) throw new Error('Informe o nome do cliente antes de finalizar.');
        if (!dadosRef.current.data_execucao.trim()) throw new Error('Informe a data de execução antes de finalizar.');
        if (pontosRef.current.length === 0) throw new Error('Adicione pelo menos um ponto antes de finalizar.');
        if (pontosRef.current.some((ponto) => !ponto.setor.trim() || !ponto.local.trim())) {
          throw new Error('Preencha setor e local de todos os pontos antes de finalizar.');
        }
        const atual = relatorioRef.current;
        if (!atual) throw new Error('Rascunho ainda não carregado.');
        const operacao = async () => {
          const { error } = await client.from('relatorios_termografia').update({ status: 'gerado' }).eq('id', atual.id);
          if (error) { if (montadoRef.current) setSaveStatus('erro'); throw error; }
          if (montadoRef.current) setRelatorio((valor) => valor ? { ...valor, status: 'gerado' } : valor);
        };
        filaRef.current = filaRef.current.catch(() => undefined).then(operacao);
        await filaRef.current;
        return atual.id;
      } finally {
        finalizandoRef.current = false;
        finalizacaoRef.current = null;
      }
    })();
    finalizacaoRef.current = finalizacao;
    return finalizacao;
  }, [client, options.uploadPendente, salvarAgora]);

  useEffect(() => {
    montadoRef.current = true;
    void Promise.resolve().then(inicializar).catch(() => undefined);
    return () => {
      montadoRef.current = false; inicializacaoRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inicializar]);

  useEffect(() => {
    const online = () => { onlineRef.current = true; if (dirtyRef.current) void salvarAgora().catch(() => undefined); };
    const offline = () => { onlineRef.current = false; if (dirtyRef.current) setSaveStatus('offline'); };
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || temUploadPendente(options.uploadPendente)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('online', online); window.addEventListener('offline', offline); window.addEventListener('beforeunload', beforeunload);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('beforeunload', beforeunload); };
  }, [options.uploadPendente, salvarAgora]);

  return { relatorio, dados, pontos, saveStatus, salvoEm, carregando, atualizarDados, atualizarPontos, salvarAgora, repetir, finalizar };
}
