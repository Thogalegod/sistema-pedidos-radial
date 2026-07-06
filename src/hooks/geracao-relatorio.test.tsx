/**
 * Testes de geração de relatório termográfico — fluxo completo.
 *
 * Cobrem: criação de rascunho → preenchimento → pontos → fotos → finalização.
 * Usa mocks do Supabase Client (mesmo padrão dos testes existentes).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { useTermografiaDraft, type TermografiaDraftClient } from './useTermografiaDraft';

/* ── Helpers ─────────────────────────────────────────────────────── */

const pontoBase = {
  id: 'p1',
  setor: 'QGBT',
  local: 'Disjuntor 1',
  inspecionado: true,
  ocorrencia: false,
};

const relatorioBase = {
  id: 'r1',
  numero_relatorio: 'RT-202607-001',
  criado_em: '2026-07-02T12:00:00Z',
  atualizado_em: '2026-07-02T12:00:00Z',
  status: 'rascunho',
  cliente_nome: '',
  cliente_cnpj: '',
  cliente_endereco: '',
  cliente_cidade: '',
  cliente_uf: 'SP',
  cliente_cep: '',
  data_execucao: '2026-07-02',
  objetivo: '',
  equipamento: '',
  responsavel_nome: '',
  responsavel_crea: '',
  revisao: 0,
  pontos: [] as typeof pontoBase[],
};

type Call = { op: string; payload?: unknown; filters: unknown[] };

function criarClienteFake(draft: typeof relatorioBase | null = relatorioBase) {
  const calls: Call[] = [];
  let updateError: Error | null = null;
  let holdUpdates = false;
  const updateResolvers: Array<(v: unknown) => void> = [];

  const client = {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
      ),
    },
    rpc: vi.fn(async (name: string) => {
      calls.push({ op: `rpc:${name}`, filters: [] });
      return {
        data: { ...relatorioBase, id: 'novo', numero_relatorio: 'RT-202607-003' },
        error: null,
      };
    }),
    from: vi.fn(() => {
      const call: Call = { op: '', filters: [] };
      const query = {
        select: (...a: unknown[]) => { call.op ||= 'select'; call.filters.push(['select', ...a]); return query; },
        eq: (...a: unknown[]) => { call.filters.push(['eq', ...a]); return query; },
        gte: (...a: unknown[]) => { call.filters.push(['gte', ...a]); return query; },
        order: (...a: unknown[]) => { call.filters.push(['order', ...a]); return query; },
        limit: (...a: unknown[]) => { call.filters.push(['limit', ...a]); return query; },
        maybeSingle: async () => { calls.push(call); return { data: draft, error: null }; },
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; calls.push(call); return query; },
        single: async () => ({ data: { ...relatorioBase, ...(call.payload as object), id: 'novo' }, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (call.op === 'update' && holdUpdates) {
            return new Promise((done) => updateResolvers.push(done)).then(resolve);
          }
          return Promise.resolve({ data: null, error: updateError }).then(resolve);
        },
      };
      return query;
    }),
  } as unknown as TermografiaDraftClient;

  return {
    client,
    calls,
    falharUpdates(e: Error | null) { updateError = e; },
    segurarUpdates() { holdUpdates = true; },
    resolverUpdate(i: number) { updateResolvers[i]?.({ data: null, error: null }); },
  };
}

async function montar(fake = criarClienteFake()) {
  const hook = renderHook(() => useTermografiaDraft({ client: fake.client }));
  await waitFor(() => expect(hook.result.current.carregando).toBe(false));
  return { ...fake, hook };
}

/* ── Suite ───────────────────────────────────────────────────────── */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('Geração de relatório — fluxo completo', () => {

  /* ── 1. Criação do rascunho ──────────────────────────────── */

  it('cria rascunho via RPC quando não existe rascunho aberto', async () => {
    const fake = criarClienteFake(null);
    const { hook, calls } = await montar(fake);

    expect(calls.some((c) => c.op === 'rpc:criar_rascunho_termografia')).toBe(true);
    expect(hook.result.current.relatorio?.id).toBe('novo');
    expect(hook.result.current.saveStatus).toBe('salvo');
  });

  it('retoma rascunho existente sem criar novo', async () => {
    const { hook, calls } = await montar();

    expect(calls.filter((c) => c.op === 'rpc:criar_rascunho_termografia')).toHaveLength(0);
    expect(hook.result.current.relatorio?.id).toBe('r1');
  });

  /* ── 2. Preenchimento dos dados gerais ────────────────────── */

  it('preenche dados do cliente e agenda save automático', async () => {
    const { hook, calls } = await montar();

    act(() => {
      hook.result.current.atualizarDados({
        cliente_nome: 'Empresa Teste',
        cliente_cnpj: '12.345.678/0001-90',
        data_execucao: '2026-07-03',
      });
    });

    expect(hook.result.current.dados.cliente_nome).toBe('Empresa Teste');
    expect(hook.result.current.dados.cliente_cnpj).toBe('12.345.678/0001-90');
    expect(hook.result.current.saveStatus).toBe('salvando');

    await act(async () => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));

    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual(
      expect.objectContaining({ cliente_nome: 'Empresa Teste' }),
    );
  });

  it('preenche dados do responsável técnico', async () => {
    const { hook, calls } = await montar();

    act(() => {
      hook.result.current.atualizarDados({
        responsavel_nome: 'João Silva',
        responsavel_crea: '123456',
      });
    });

    await act(async () => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));

    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual(
      expect.objectContaining({ responsavel_nome: 'João Silva', responsavel_crea: '123456' }),
    );
  });

  /* ── 3. Gerenciamento de pontos ───────────────────────────── */

  it('adiciona pontos e serializa no save', async () => {
    const { hook, calls } = await montar();

    act(() => {
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: 'Disjuntor 1', inspecionado: true, ocorrencia: false },
        { id: 'p2', setor: 'QGBT', local: 'Disjuntor 2', inspecionado: true, ocorrencia: true },
      ]);
    });

    expect(hook.result.current.pontos).toHaveLength(2);

    await act(async () => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));

    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual(
      expect.objectContaining({
        pontos: expect.arrayContaining([
          expect.objectContaining({ setor: 'QGBT' }),
        ]),
      }),
    );
  });

  it('atualiza ponto existente (setor/local/ocorrência)', async () => {
    const { hook } = await montar();

    act(() => {
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: 'Disjuntor 1', inspecionado: true, ocorrencia: false },
      ]);
    });

    act(() => {
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QA', local: 'Chave Geral', inspecionado: true, ocorrencia: true },
      ]);
    });

    expect(hook.result.current.pontos[0].setor).toBe('QA');
    expect(hook.result.current.pontos[0].local).toBe('Chave Geral');
    expect(hook.result.current.pontos[0].ocorrencia).toBe(true);
  });

  /* ── 4. Upload de fotos (simulado) ────────────────────────── */

  it('serializa fotos src/blob no payload e limpa ao salvar', async () => {
    const { hook, calls } = await montar();

    act(() => {
      hook.result.current.atualizarPontos([
        {
          ...pontoBase,
          fotoDigitalSrc: 'blob:fake-digital',
          _fotoDigitalFile: new File([], 'foto-digital.jpg'),
          fotoTermicaSrc: 'blob:fake-termica',
          _fotoTermicaFile: new File([], 'foto-termica.jpg'),
        },
      ]);
    });

    await act(async () => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));

    const update = calls.find((c) => c.op === 'update');
    const pontoSalvo = (update?.payload as { pontos: Array<Record<string, unknown>> })?.pontos?.[0];

    // Campos transitórios devem ser limpos do payload
    expect(pontoSalvo).toBeDefined();
    expect(pontoSalvo.fotoDigitalSrc).toBeUndefined();
    expect(pontoSalvo._fotoDigitalFile).toBeUndefined();
    expect(pontoSalvo.fotoTermicaSrc).toBeUndefined();
    expect(pontoSalvo._fotoTermicaFile).toBeUndefined();
  });

  /* ── 5. Validação antes de finalizar ──────────────────────── */

  it('rejeita finalização sem cliente', async () => {
    const { hook } = await montar();
    await expect(hook.result.current.finalizar()).rejects.toThrow('cliente');
  });

  it('rejeita finalização sem pontos', async () => {
    const { hook } = await montar();
    act(() => hook.result.current.atualizarDados({ cliente_nome: 'Teste' }));
    await expect(hook.result.current.finalizar()).rejects.toThrow('ponto');
  });

  it('rejeita finalização com ponto sem setor', async () => {
    const { hook } = await montar();
    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Teste' });
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: '', local: 'X', inspecionado: true, ocorrencia: false },
      ]);
    });
    await expect(hook.result.current.finalizar()).rejects.toThrow('setor');
  });

  it('rejeita finalização com ponto sem local', async () => {
    const { hook } = await montar();
    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Teste' });
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: '', inspecionado: true, ocorrencia: false },
      ]);
    });
    await expect(hook.result.current.finalizar()).rejects.toThrow('setor');
  });

  it('rejeita finalização com uploads pendentes', async () => {
    const fake = criarClienteFake();
    const hook = renderHook(() =>
      useTermografiaDraft({ client: fake.client, uploadPendente: () => true }),
    );
    await waitFor(() => expect(hook.result.current.carregando).toBe(false));
    await expect(hook.result.current.finalizar()).rejects.toThrow('uploads pendentes');
  });

  /* ── 6. Finalização com sucesso ───────────────────────────── */

  it('finaliza relatório: preenche dados → adiciona ponto → finaliza', async () => {
    const { hook, calls } = await montar();

    // 1. Preenche dados do cliente
    act(() => {
      hook.result.current.atualizarDados({
        cliente_nome: 'Empresa Final',
        responsavel_nome: 'Roberto',
        responsavel_crea: '0601049229',
      });
    });

    // 2. Adiciona ponto
    act(() => {
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: 'Disjuntor 1', inspecionado: true, ocorrencia: false },
      ]);
    });

    // 3. Finaliza
    let id: string | undefined;
    await act(async () => {
      id = await hook.result.current.finalizar();
    });

    expect(id).toBe('r1');

    // Deve ter 2 updates: save dos dados + status='gerado'
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates).toHaveLength(2);
    expect(updates[0].payload).toEqual(
      expect.objectContaining({ cliente_nome: 'Empresa Final' }),
    );
    expect(updates[1].payload).toEqual(
      expect.objectContaining({ status: 'gerado' }),
    );
  });

  it('finaliza com ponto de ocorrência e dados extras', async () => {
    const { hook, calls } = await montar();

    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Ocorrencia Teste' });
      hook.result.current.atualizarPontos([
        {
          id: 'p1',
          setor: 'QGBT',
          local: 'Disjuntor 1',
          inspecionado: true,
          ocorrencia: true,
          componente: 'Disjuntor Principal',
          temperatura: '76,2 ºC',
          classificacao: 'Intervenção Programada',
          risco: 'Médio',
          conclusao: 'Substituir disjuntor',
        },
      ]);
    });

    let id: string | undefined;
    await act(async () => { id = await hook.result.current.finalizar(); });

    expect(id).toBe('r1');
    const updates = calls.filter((c) => c.op === 'update');
    expect(updates[1].payload).toEqual(
      expect.objectContaining({ status: 'gerado' }),
    );
  });

  /* ── 7. Race condition: dirtyRef ──────────────────────────── */

  it('finaliza mesmo quando dirtyRef ficou true por race condition', async () => {
    const fake = criarClienteFake();
    fake.segurarUpdates();
    const { hook, calls } = await montar(fake);

    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Race' });
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: 'X', inspecionado: true, ocorrencia: false },
      ]);
    });

    const finalizacao = hook.result.current.finalizar();

    // Espera o primeiro update (save dos dados)
    await waitFor(() =>
      expect(calls.filter((c) => c.op === 'update')).toHaveLength(1),
    );

    // Resolve o save — mas simula que versãoRef ficou defasado
    // (dirtyRef não foi limpo pelo salvarAgora)
    await act(async () => fake.resolverUpdate(0));

    // Espera o segundo update (status='gerado')
    await waitFor(() =>
      expect(calls.filter((c) => c.op === 'update')).toHaveLength(2),
    );
    await act(async () => fake.resolverUpdate(1));

    await expect(finalizacao).resolves.toBe('r1');
  });

  /* ── 8. Bloqueio durante finalização ──────────────────────── */

  it('ignora alterações iniciadas durante a finalização', async () => {
    const { hook, calls } = await montar();

    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Bloquear' });
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: 'X', inspecionado: true, ocorrencia: false },
      ]);
    });

    const finalizacao = hook.result.current.finalizar();

    // Tenta editar durante finalização — deve ser ignorado
    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Ignorado' });
    });

    await act(async () => { await finalizacao; });

    // O nome deve permanecer 'Bloquear'
    expect(hook.result.current.dados.cliente_nome).toBe('Bloquear');
  });

  /* ── 9. Persistência de dados entre saves ─────────────────── */

  it('preserva dados do relatório após save bem-sucedido', async () => {
    const { hook } = await montar();

    act(() => {
      hook.result.current.atualizarDados({ cliente_nome: 'Persistente' });
      hook.result.current.atualizarPontos([
        { id: 'p1', setor: 'QGBT', local: 'Teste', inspecionado: true, ocorrencia: false },
      ]);
    });

    await act(async () => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('salvo'));

    // Verifica que dados permanecem após save
    expect(hook.result.current.dados.cliente_nome).toBe('Persistente');
    expect(hook.result.current.pontos).toHaveLength(1);
    expect(hook.result.current.pontos[0].setor).toBe('QGBT');
    expect(hook.result.current.relatorio?.status).toBe('rascunho');
  });

  /* ── 10. Número do relatório ──────────────────────────────── */

  it('gera número do relatório no formato RT-YYYYMM-NNN', async () => {
    const { hook } = await montar(criarClienteFake(null));

    expect(hook.result.current.relatorio?.numero_relatorio).toMatch(/^RT-\d{6}-\d{3}$/);
  });
});
