export type TermografiaClassificacao =
  | 'Normal'
  | 'Observação'
  | 'Intervenção Programada'
  | 'Intervenção Imediata'
  | 'Crítico';

export type TermografiaRisco = 'Baixo' | 'Médio' | 'Alto';
export type TermografiaStatus = 'gerado' | 'revisado' | 'emitido' | 'cancelado';
export type TermografiaArquivoTipo = 'digital' | 'termica';

export interface TermografiaReportRow {
  id: string;
  organization_id: string;
  legacy_id?: string | null;
  numero_relatorio: string;
  report_year: number;
  sequence_number: number;
  criado_em: string;
  updated_at: string;
  created_by?: string | null;
  status: TermografiaStatus;
  customer_id?: string | null;
  site_id?: string | null;
  contact_id?: string | null;
  cliente_nome: string;
  cliente_endereco?: string | null;
  cliente_cidade?: string | null;
  cliente_uf?: string | null;
  cliente_cep?: string | null;
  cliente_cnpj?: string | null;
  data_execucao: string;
  objetivo?: string | null;
  equipamento?: string | null;
  responsavel_nome?: string | null;
  responsavel_crea?: string | null;
  revisao: number;
}

export interface TermografiaPointRow {
  id: string;
  organization_id: string;
  report_id: string;
  ordem: number;
  setor: string;
  local: string;
  equipamento?: string | null;
  componente?: string | null;
  inspecionado: boolean;
  ocorrencia: boolean;
  temperatura?: string | null;
  data_hora_foto?: string | null;
  classificacao?: TermografiaClassificacao | null;
  risco?: TermografiaRisco | null;
  diagnostico?: string | null;
  recomendacao?: string | null;
  conclusao?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface TermografiaFileRow {
  id: string;
  organization_id: string;
  report_id: string;
  point_id: string;
  tipo: TermografiaArquivoTipo;
  storage_path: string;
  file_name: string;
  content_type: string;
  tamanho_bytes?: number | null;
  created_at: string;
  created_by?: string | null;
}

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
  fotoDigitalArquivoId?: string | null;
  fotoTermicaArquivoId?: string | null;
}

export interface TermografiaRelatorio {
  id: string;
  organization_id: string;
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
