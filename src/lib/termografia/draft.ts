import type {
  FotoUploadStatus,
  TermografiaDadosGerais,
  TermografiaPonto,
  TermografiaRelatorio,
} from './types';

export type PontoTransitorio = TermografiaPonto & {
  fotoDigitalSrc?: string | null;
  fotoTermicaSrc?: string | null;
  _fotoDigitalFile?: File;
  _fotoTermicaFile?: File;
};

export type RascunhoLocalSnapshot = {
  relatorio: Pick<TermografiaRelatorio, 'id' | 'numero_relatorio' | 'status' | 'criado_em' | 'atualizado_em'>;
  dados: TermografiaDadosGerais;
  pontos: TermografiaPonto[];
  salvoEm: string;
};

export const RASCUNHO_LOCAL_KEY = 'termografia:rascunho-local:v1';

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

export function carregarRascunhoLocal(): RascunhoLocalSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const bruto = window.localStorage.getItem(RASCUNHO_LOCAL_KEY);
    if (!bruto) return null;
    const snapshot = JSON.parse(bruto) as RascunhoLocalSnapshot;
    if (!snapshot?.relatorio?.id || !Array.isArray(snapshot?.pontos) || !snapshot?.dados) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function salvarRascunhoLocal(snapshot: RascunhoLocalSnapshot) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RASCUNHO_LOCAL_KEY, JSON.stringify(snapshot));
}

export function limparRascunhoLocal() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RASCUNHO_LOCAL_KEY);
}
