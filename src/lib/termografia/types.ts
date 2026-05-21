export type TermografiaClassificacao =
  | 'Normal'
  | 'Observação'
  | 'Intervenção Programada'
  | 'Intervenção Imediata'
  | 'Crítico';

export type TermografiaRisco = 'Baixo' | 'Médio' | 'Alto';

export interface TermografiaPonto {
  id: string;
  setor: string;
  local: string;
  inspecionado: boolean;
  ocorrencia: boolean;
  componente?: string;
  temperatura?: string;
  dataHoraFoto?: string;
  classificacao?: TermografiaClassificacao;
  risco?: TermografiaRisco;
  conclusao?: string;
  fotoDigitalUrl?: string | null;
  fotoTermicaUrl?: string | null;
}

export interface TermografiaRelatorio {
  id: string;
  numero_relatorio: string;
  criado_em: string;
  status: string;
  cliente_nome: string;
  cliente_endereco: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_cep?: string | null;
  cliente_cnpj?: string | null;
  data_execucao: string;
  objetivo: string;
  equipamento: string;
  responsavel_nome: string;
  responsavel_crea: string;
  revisao: number;
  pontos: TermografiaPonto[];
}

export const conclusoesPadrao: Record<TermografiaClassificacao, string> = {
  Normal: 'Ponto inspecionado sem anomalia térmica relevante no momento da medição.',
  Observação: 'Acompanhar a evolução térmica do componente em inspeções futuras.',
  'Intervenção Programada': 'Desconectar, limpar e reconectar. Reapertar conexão em parada programada.',
  'Intervenção Imediata': 'Programar intervenção em curto prazo, com avaliação operacional do circuito.',
  Crítico: 'Realizar intervenção urgente e monitorar a carga até a normalização.',
};

export function gerarIdPonto() {
  return `ponto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pontosAquecidosPorSetorLocal(pontos: TermografiaPonto[]) {
  const mapa = new Map<string, { setor: string; local: string; pontosAquecidos: number }>();

  pontos.forEach((ponto) => {
    const chave = `${ponto.setor}|||${ponto.local}`;
    const atual = mapa.get(chave) ?? { setor: ponto.setor, local: ponto.local, pontosAquecidos: 0 };
    if (ponto.ocorrencia) atual.pontosAquecidos += 1;
    mapa.set(chave, atual);
  });

  return Array.from(mapa.values());
}

export function formatarDataHora(valor?: string) {
  if (!valor) return { data: '', hora: '' };
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return { data: '', hora: '' };
  return {
    data: data.toLocaleDateString('pt-BR'),
    hora: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}
