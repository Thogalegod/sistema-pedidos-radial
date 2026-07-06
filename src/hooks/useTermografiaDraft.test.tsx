import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { useTermografiaDraft, type TermografiaDraftClient } from './useTermografiaDraft';
import { RASCUNHO_LOCAL_KEY } from '@/lib/termografia/draft';

const ponto = { id: 'p1', setor: 'QGBT', local: 'Disjuntor', inspecionado: true, ocorrencia: false };
const relatorio = {
  id: 'r1', numero_relatorio: 'RT-202607-001', criado_em: '2026-07-02T12:00:00Z',
  atualizado_em: '2026-07-02T12:00:00Z', status: 'rascunho', cliente_nome: 'Radial',
  cliente_cnpj: '', cliente_endereco: '', cliente_cidade: '', cliente_uf: 'SP', cliente_cep: '',
  data_execucao: '2026-07-02', objetivo: 'Inspeção', equipamento: 'Flir',
  responsavel_nome: 'Roberto', responsavel_crea: '1', revisao: 0, pontos: [ponto],
};

type Call = { op: string; payload?: unknown; filters: unknown[] };
type FakeQuery = PromiseLike<unknown> & {
  select(...args: unknown[]): FakeQuery; eq(...args: unknown[]): FakeQuery;
  gte(...args: unknown[]): FakeQuery; order(...args: unknown[]): FakeQuery;
  limit(...args: unknown[]): FakeQuery; maybeSingle(): Promise<unknown>;
  insert(payload: unknown): FakeQuery; update(payload: unknown): FakeQuery;
  single(): Promise<unknown>;
};

function clienteFake(draft: typeof relatorio | null = relatorio) {
  const calls: Call[] = [];
  const updateResolvers: Array<(value: unknown) => void> = [];
  let updateError: Error | null = null;
  let holdUpdates = false;
  let authError: Error | null = null;
  let holdAuth = false;
  let authResolver: ((value: unknown) => void) | undefined;

  const client = {
    auth: { getUser: vi.fn(() => holdAuth
      ? new Promise((resolve) => { authResolver = resolve; })
      : Promise.resolve({ data: { user: authError ? null : { id: 'u1' } }, error: authError })) },
    rpc: vi.fn(async (name: string, payload?: unknown) => {
      calls.push({ op: `rpc:${name}`, payload, filters: [] });
      return { data: { ...relatorio, id: 'novo', numero_relatorio: 'RT-202607-003' }, error: null };
    }),
    from: vi.fn(() => {
      const call: Call = { op: '', filters: [] };
      const query: FakeQuery = {
        select: (...args) => { call.op ||= 'select'; call.filters.push(['select', ...args]); return query; },
        eq: (...args) => { call.filters.push(['eq', ...args]); return query; },
        gte: (...args) => { call.filters.push(['gte', ...args]); return query; },
        order: (...args) => { call.filters.push(['order', ...args]); return query; },
        limit: (...args) => { call.filters.push(['limit', ...args]); return query; },
        maybeSingle: async () => { calls.push(call); return { data: draft, error: null }; },
        insert: (payload) => { call.op = 'insert'; call.payload = payload; calls.push(call); return query; },
        update: (payload) => { call.op = 'update'; call.payload = payload; calls.push(call); return query; },
        single: async () => ({ data: { ...relatorio, ...(call.payload as object), id: 'novo' }, error: null }),
        then: (resolve) => {
          if (call.op === 'select') { calls.push(call); return Promise.resolve({ count: 2, data: null, error: null }).then(resolve); }
          if (call.op === 'update' && holdUpdates) return new Promise((done) => updateResolvers.push(done)).then(resolve);
          return Promise.resolve({ data: null, error: updateError }).then(resolve);
        },
      };
      return query;
    }),
  } as unknown as TermografiaDraftClient;

  return {
    client, calls,
    falharUpdates(error: Error | null) { updateError = error; },
    falharAuth(error: Error | null) { authError = error; },
    segurarAuth() { holdAuth = true; },
    resolverAuth() { holdAuth = false; authResolver?.({ data: { user: { id: 'u1' } }, error: null }); },
    segurarUpdates() { holdUpdates = true; },
    resolverUpdate(index: number) { updateResolvers[index]?.({ data: null, error: null }); },
  };
}

async function montar(fake = clienteFake()) {
  const hook = renderHook(() => useTermografiaDraft({ client: fake.client }));
  await waitFor(() => expect(hook.result.current.carregando).toBe(false));
  return { ...fake, hook };
}

describe('useTermografiaDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('retoma o rascunho mais recente do usuário', async () => {
    const { hook, calls } = await montar();
    expect(hook.result.current.relatorio?.id).toBe('r1');
    expect(hook.result.current.salvoEm).toEqual(new Date('2026-07-02T12:00:00Z'));
    expect(calls[0].filters).toEqual(expect.arrayContaining([
      ['eq', 'criado_por', 'u1'], ['eq', 'status', 'rascunho'],
      ['order', 'atualizado_em', { ascending: false }], ['limit', 1],
    ]));
  });

  it('não anuncia salvo antes da confirmação da inicialização', async () => {
    const fake = clienteFake(); fake.segurarAuth();
    const hook = renderHook(() => useTermografiaDraft({ client: fake.client }));
    expect(hook.result.current.saveStatus).toBe('salvando');
    expect(hook.result.current.salvoEm).toBeNull();
    await act(async () => fake.resolverAuth());
    await waitFor(() => expect(hook.result.current.carregando).toBe(false));
    expect(hook.result.current.saveStatus).toBe('salvo');
  });

  it('repetir refaz a inicialização após falha de autenticação', async () => {
    const fake = clienteFake(); fake.falharAuth(new Error('auth'));
    const hook = renderHook(() => useTermografiaDraft({ client: fake.client }));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('erro'));
    expect(hook.result.current.relatorio).toBeNull();
    fake.falharAuth(null);
    await act(async () => hook.result.current.repetir());
    expect(hook.result.current.relatorio?.id).toBe('r1');
    expect(hook.result.current.saveStatus).toBe('salvo');
  });

  it('delega a criação idempotente e atômica do rascunho à RPC', async () => {
    const { hook, calls } = await montar(clienteFake(null));
    expect(calls.filter((call) => call.op === 'rpc:criar_rascunho_termografia')).toHaveLength(1);
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
    expect(hook.result.current.relatorio?.id).toBe('novo');
    expect(hook.result.current.salvoEm).toEqual(new Date('2026-07-02T12:00:00Z'));
  });

  it('ignora uma inicialização antiga quando uma nova execução vence no StrictMode', async () => {
    const antigo = clienteFake(); antigo.segurarAuth();
    const novo = clienteFake({ ...relatorio, id: 'r2', cliente_nome: 'Novo' });
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const hook = renderHook(({ client }) => useTermografiaDraft({ client }), {
      initialProps: { client: antigo.client }, wrapper,
    });
    hook.rerender({ client: novo.client });
    await waitFor(() => expect(hook.result.current.relatorio?.id).toBe('r2'));
    await act(async () => antigo.resolverAuth());
    expect(hook.result.current.relatorio?.id).toBe('r2');
  });

  it('agrupa alterações em 800ms e limpa campos transitórios', async () => {
    const { hook, calls } = await montar();
    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'A' });
      hook.result.current.atualizarDados({ cliente_nome: 'B' });
      hook.result.current.atualizarPontos([{ ...ponto, fotoDigitalSrc: 'blob:x', _fotoDigitalFile: new File([], 'x') }]);
    });
    await act(async () => vi.advanceTimersByTimeAsync(799));
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));
    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual(expect.objectContaining({ cliente_nome: 'B', pontos: [ponto] }));
    expect(window.localStorage.getItem(RASCUNHO_LOCAL_KEY)).toContain('"cliente_nome":"B"');
  });

  it('serializa saves e preserva a ordem das versões', async () => {
    const fake = clienteFake(); fake.segurarUpdates();
    const { hook, calls, resolverUpdate } = await montar(fake);
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'primeiro' }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'segundo' }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
    await act(async () => resolverUpdate(0));
    await waitFor(() => expect(calls.filter((c) => c.op === 'update')).toHaveLength(2));
    expect(calls.filter((c) => c.op === 'update').map((c) => (c.payload as { cliente_nome: string }).cliente_nome))
      .toEqual(['primeiro', 'segundo']);
    await act(async () => resolverUpdate(1));
  });

  it('expõe erro e repetir confirma o salvamento', async () => {
    const fake = clienteFake(); fake.falharUpdates(new Error('rede'));
    const { hook } = await montar(fake);
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'X' }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('erro'));
    fake.falharUpdates(null);
    await act(async () => hook.result.current.repetir());
    expect(hook.result.current.saveStatus).toBe('salvo');
  });

  it('aguarda a volta da conexão e protege descarregamento apenas quando pendente', async () => {
    const fake = clienteFake();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { hook, calls } = await montar(fake);
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'offline' }));
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await act(async () => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));
  });

  it('restaura o backup local mais novo que o banco e sincroniza quando online', async () => {
    window.localStorage.setItem(RASCUNHO_LOCAL_KEY, JSON.stringify({
      relatorio: {
        id: 'r1',
        numero_relatorio: 'RT-202607-001',
        status: 'rascunho',
        criado_em: '2026-07-02T12:00:00Z',
        atualizado_em: '2026-07-02T12:00:00Z',
      },
      dados: {
        cliente_nome: 'Local',
        cliente_cnpj: '',
        cliente_endereco: '',
        cliente_cidade: '',
        cliente_uf: 'SP',
        cliente_cep: '',
        data_execucao: '2026-07-02',
        objetivo: 'Inspeção',
        equipamento: 'Flir',
        responsavel_nome: 'Roberto',
        responsavel_crea: '1',
      },
      pontos: [{ ...ponto, local: 'Backup local' }],
      salvoEm: '2026-07-02T12:05:00Z',
    }));

    const { hook, calls } = await montar();
    expect(hook.result.current.dados.cliente_nome).toBe('Local');
    expect(hook.result.current.pontos[0].local).toBe('Backup local');
    await waitFor(() => expect(calls.some((call) => call.op === 'update')).toBe(true));
  });

  it('abre em modo offline a partir do backup local quando a inicialização falha', async () => {
    window.localStorage.setItem(RASCUNHO_LOCAL_KEY, JSON.stringify({
      relatorio: {
        id: 'r1',
        numero_relatorio: 'RT-202607-001',
        status: 'rascunho',
        criado_em: '2026-07-02T12:00:00Z',
        atualizado_em: '2026-07-02T12:00:00Z',
      },
      dados: {
        cliente_nome: 'Offline',
        cliente_cnpj: '',
        cliente_endereco: '',
        cliente_cidade: '',
        cliente_uf: 'SP',
        cliente_cep: '',
        data_execucao: '2026-07-02',
        objetivo: 'Inspeção',
        equipamento: 'Flir',
        responsavel_nome: 'Roberto',
        responsavel_crea: '1',
      },
      pontos: [ponto],
      salvoEm: '2026-07-02T12:05:00Z',
    }));

    const fake = clienteFake();
    fake.falharAuth(new Error('sem rede'));
    const hook = renderHook(() => useTermografiaDraft({ client: fake.client }));
    await waitFor(() => expect(hook.result.current.carregando).toBe(false));
    expect(hook.result.current.saveStatus).toBe('offline');
    expect(hook.result.current.dados.cliente_nome).toBe('Offline');
  });

  it('remove listeners no cleanup e considera upload pendente', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const fake = clienteFake();
    const hook = renderHook(() => useTermografiaDraft({ client: fake.client, uploadPendente: true }));
    await waitFor(() => expect(hook.result.current.carregando).toBe(false));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    hook.unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('finalizar força save, valida uploads e retorna o id', async () => {
    const fake = clienteFake();
    const { hook, calls } = await montar(fake);
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'Final' }));
    let id: string | undefined;
    await act(async () => { id = await hook.result.current.finalizar(); });
    expect(id).toBe('r1');
    expect(calls.filter((c) => c.op === 'update').map((c) => c.payload)).toEqual([
      expect.objectContaining({ cliente_nome: 'Final' }),
      expect.objectContaining({ status: 'gerado' }),
    ]);
  });

  it('bloqueia edições iniciadas durante a finalização e encerra sem save pendente', async () => {
    const fake = clienteFake(); fake.segurarUpdates();
    const { hook, calls } = await montar(fake);
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'Final' }));
    const finalizacao = hook.result.current.finalizar();
    await waitFor(() => expect(calls.filter((call) => call.op === 'update')).toHaveLength(1));
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'Tardio' }));
    await act(async () => fake.resolverUpdate(0));
    await waitFor(() => expect(calls.filter((call) => call.op === 'update')).toHaveLength(2));
    await act(async () => fake.resolverUpdate(1));
    await expect(finalizacao).resolves.toBe('r1');
    expect(hook.result.current.dados.cliente_nome).toBe('Final');
    expect(calls.filter((call) => call.op === 'update')).toHaveLength(2);
  });

  it.each([
    [{ cliente_nome: '   ' }, [ponto], 'cliente'],
    [{ data_execucao: '' }, [ponto], 'data'],
    [{}, [], 'ponto'],
    [{}, [{ ...ponto, setor: '' }], 'setor e local'],
  ])('não gera relatório inválido (%s)', async (dados, pontos, mensagem) => {
    const { hook, calls } = await montar();
    act(() => {
      hook.result.current.atualizarDados({
        cliente_nome: 'Cliente base',
        data_execucao: '2026-07-02',
        ...dados,
      });
      hook.result.current.atualizarPontos(pontos);
    });
    await expect(hook.result.current.finalizar()).rejects.toThrow(mensagem);
    expect(calls.some((call) => (call.payload as { status?: string })?.status === 'gerado')).toBe(false);
  });

  it('bloqueia finalizar se houver upload pendente', async () => {
    const fake = clienteFake();
    const hook = renderHook(() => useTermografiaDraft({ client: fake.client, uploadPendente: () => true }));
    await waitFor(() => expect(hook.result.current.carregando).toBe(false));
    await expect(hook.result.current.finalizar()).rejects.toThrow('uploads pendentes');
  });

  it('revalida uploads depois do save forçado e antes de gerar', async () => {
    const fake = clienteFake(); fake.segurarUpdates();
    let upload = false;
    const hook = renderHook(() => useTermografiaDraft({ client: fake.client, uploadPendente: () => upload }));
    await waitFor(() => expect(hook.result.current.carregando).toBe(false));
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'corrida' }));
    const finalizacao = hook.result.current.finalizar();
    const rejeicao = expect(finalizacao).rejects.toThrow('uploads pendentes');
    await waitFor(() => expect(fake.calls.filter((c) => c.op === 'update')).toHaveLength(1));
    upload = true;
    await act(async () => fake.resolverUpdate(0));
    await rejeicao;
    expect(fake.calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });
});
