import { describe, expect, it } from 'vitest';
import { deveAplicarResposta, limparPontoPersistido, podeFinalizar } from './draft';
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
