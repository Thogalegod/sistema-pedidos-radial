import type { FotoUploadStatus, TermografiaPonto } from './types';

export type PontoTransitorio = TermografiaPonto & {
  fotoDigitalSrc?: string | null;
  fotoTermicaSrc?: string | null;
  _fotoDigitalFile?: File;
  _fotoTermicaFile?: File;
};

export function limparPontoPersistido(ponto: PontoTransitorio): TermografiaPonto {
  const persistido = { ...ponto };
  delete persistido.fotoDigitalSrc;
  delete persistido.fotoTermicaSrc;
  delete persistido._fotoDigitalFile;
  delete persistido._fotoTermicaFile;

  return persistido;
}

export function podeFinalizar(
  status: Array<{ digital: FotoUploadStatus; termica: FotoUploadStatus }>,
): boolean {
  const bloqueados: FotoUploadStatus[] = ['local', 'enviando', 'erro'];

  return status.every(
    ({ digital, termica }) => !bloqueados.includes(digital) && !bloqueados.includes(termica),
  );
}

export function deveAplicarResposta(resposta: number, ultimaAplicada: number): boolean {
  return resposta >= ultimaAplicada;
}
