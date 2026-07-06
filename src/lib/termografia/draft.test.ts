import { describe, expect, it } from 'vitest';
import {
  RASCUNHO_LOCAL_KEY,
  carregarRascunhoLocal,
  deveAplicarResposta,
  limparPontoPersistido,
  limparRascunhoLocal,
  podeFinalizar,
  salvarRascunhoLocal,
} from './draft';
import type { PontoTransitorio } from './draft';

describe('limparPontoPersistido', () => {
  it('remove dados locais da foto digital e preserva a URL persistida', () => {
    const arquivo = new File(['foto'], 'foto.jpg', { type: 'image/jpeg' });
    const ponto = {
      id: 'ponto-1',
      setor: 'Painel',
      local: 'Entrada',
      inspecionado: true,
      ocorrencia: false,
      fotoDigitalUrl: 'https://exemplo.com/foto.jpg',
      fotoTermicaUrl: 'https://exemplo.com/termica.jpg',
      fotoDigitalSrc: 'blob:foto-local',
      fotoTermicaSrc: 'data:image/jpeg;base64,termica',
      _fotoDigitalFile: arquivo,
      _fotoTermicaFile: arquivo,
    };

    expect(limparPontoPersistido(ponto)).toEqual({
      id: 'ponto-1',
      setor: 'Painel',
      local: 'Entrada',
      inspecionado: true,
      ocorrencia: false,
      fotoDigitalUrl: 'https://exemplo.com/foto.jpg',
      fotoTermicaUrl: 'https://exemplo.com/termica.jpg',
    });
  });

  it('remove fontes locais nulas', () => {
    const ponto: PontoTransitorio = {
      id: 'ponto-2',
      setor: 'Painel',
      local: 'Saída',
      inspecionado: false,
      ocorrencia: false,
      fotoDigitalSrc: null,
      fotoTermicaSrc: null,
    };

    expect(limparPontoPersistido(ponto)).toEqual({
      id: 'ponto-2',
      setor: 'Painel',
      local: 'Saída',
      inspecionado: false,
      ocorrencia: false,
    });
  });
});

describe('podeFinalizar', () => {
  it('bloqueia finalização com upload pendente ou falho', () => {
    expect(podeFinalizar([{ digital: 'enviando', termica: 'salva' }])).toBe(false);
    expect(podeFinalizar([{ digital: 'erro', termica: 'vazia' }])).toBe(false);
    expect(podeFinalizar([{ digital: 'salva', termica: 'local' }])).toBe(false);
    expect(podeFinalizar([{ digital: 'salva', termica: 'vazia' }])).toBe(true);
  });
});

describe('deveAplicarResposta', () => {
  it.each([
    [4, 5, false],
    [5, 5, true],
    [6, 5, true],
  ])('compara a versão %i com a última aplicada %i', (resposta, ultimaAplicada, esperado) => {
    expect(deveAplicarResposta(resposta, ultimaAplicada)).toBe(esperado);
  });
});

describe('rascunho local', () => {
  it('salva e carrega o backup local do rascunho', () => {
    salvarRascunhoLocal({
      relatorio: {
        id: 'r1',
        numero_relatorio: 'RT-202607-001',
        status: 'rascunho',
        criado_em: '2026-07-06T10:00:00Z',
        atualizado_em: '2026-07-06T10:05:00Z',
      },
      dados: {
        cliente_nome: 'Radial',
        cliente_cnpj: '',
        cliente_endereco: '',
        cliente_cidade: '',
        cliente_uf: 'SP',
        cliente_cep: '',
        data_execucao: '2026-07-06',
        objetivo: 'Inspeção',
        equipamento: 'Flir',
        responsavel_nome: 'Roberto',
        responsavel_crea: '1',
      },
      pontos: [{
        id: 'p1',
        setor: 'QGBT',
        local: 'Entrada',
        inspecionado: true,
        ocorrencia: false,
      }],
      salvoEm: '2026-07-06T10:05:00Z',
    });

    expect(carregarRascunhoLocal()).toEqual(expect.objectContaining({
      relatorio: expect.objectContaining({ id: 'r1' }),
      dados: expect.objectContaining({ cliente_nome: 'Radial' }),
      pontos: [expect.objectContaining({ id: 'p1' })],
    }));
  });

  it('ignora json inválido e permite limpar o backup local', () => {
    window.localStorage.setItem(RASCUNHO_LOCAL_KEY, '{');
    expect(carregarRascunhoLocal()).toBeNull();

    salvarRascunhoLocal({
      relatorio: {
        id: 'r1',
        numero_relatorio: 'RT-202607-001',
        status: 'rascunho',
        criado_em: '2026-07-06T10:00:00Z',
        atualizado_em: '2026-07-06T10:05:00Z',
      },
      dados: {
        cliente_nome: 'Radial',
        cliente_cnpj: '',
        cliente_endereco: '',
        cliente_cidade: '',
        cliente_uf: 'SP',
        cliente_cep: '',
        data_execucao: '2026-07-06',
        objetivo: 'Inspeção',
        equipamento: 'Flir',
        responsavel_nome: 'Roberto',
        responsavel_crea: '1',
      },
      pontos: [],
      salvoEm: '2026-07-06T10:05:00Z',
    });

    limparRascunhoLocal();
    expect(window.localStorage.getItem(RASCUNHO_LOCAL_KEY)).toBeNull();
  });
});
