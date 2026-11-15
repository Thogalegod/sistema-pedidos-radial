import type { JsonObject } from './types';

export type InspectionStatus = 'C' | 'N/C' | 'N/A';
export type FichaComplementarTableName =
  | 'manutencao_fichas_chave_seccionadora'
  | 'manutencao_fichas_para_raios'
  | 'manutencao_fichas_tc_tp'
  | 'manutencao_fichas_cabos_media_tensao'
  | 'manutencao_fichas_aterramento';

export type FichaComplementarTipo =
  | 'chave_seccionadora'
  | 'para_raios'
  | 'tc_tp'
  | 'cabo_media_tensao'
  | 'aterramento';

export interface FieldDefinition {
  key: string;
  label: string;
}

export interface FichaComplementarDefinition {
  tipo: FichaComplementarTipo;
  tableName: FichaComplementarTableName;
  routeSegment: string;
  title: string;
  equipmentLabel: string;
  createLabel: string;
  openLabel: string;
  identificationFields: FieldDefinition[];
  inspectionItems: FieldDefinition[];
  measurementFields: FieldDefinition[];
  conclusionFields: FieldDefinition[];
  minimumFields: FieldDefinition[];
  hasGroundingMeasurements?: boolean;
}

export interface AterramentoMeasurement {
  id: string;
  ponto: string;
  valorOhms: string;
  resultado: string;
  observacao: string;
}

export interface FichaComplementarSnapshot {
  data: Record<string, string>;
  inspectionStatus: Record<string, InspectionStatus>;
  measurements: AterramentoMeasurement[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const conclusionFields = [
  { key: 'situacaoFinal', label: 'Situação final' },
  { key: 'servicosExecutados', label: 'Serviços executados' },
  { key: 'irregularidades', label: 'Irregularidades' },
  { key: 'recomendacoes', label: 'Recomendações' },
  { key: 'observacoes', label: 'Observações' },
];

export const fichaComplementarDefinitions: FichaComplementarDefinition[] = [
  {
    tipo: 'chave_seccionadora',
    tableName: 'manutencao_fichas_chave_seccionadora',
    routeSegment: 'ficha-chave-seccionadora',
    title: 'Ficha de Chave Seccionadora',
    equipmentLabel: 'Chave seccionadora',
    createLabel: 'Salvar chave seccionadora',
    openLabel: 'Abrir ficha da chave seccionadora',
    minimumFields: [
      { key: 'tag', label: 'TAG da chave seccionadora' },
      { key: 'fabricante', label: 'Fabricante da chave seccionadora' },
      { key: 'modelo', label: 'Modelo da chave seccionadora' },
      { key: 'tensaoNominal', label: 'Tensão nominal' },
      { key: 'correnteNominal', label: 'Corrente nominal' },
    ],
    identificationFields: [
      { key: 'tag', label: 'TAG / identificação' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'serie', label: 'Número de série' },
      { key: 'tensaoNominal', label: 'Tensão nominal' },
      { key: 'correnteNominal', label: 'Corrente nominal' },
      { key: 'anoFabricacao', label: 'Ano de fabricação' },
      { key: 'instalacao', label: 'Instalação interna ou externa' },
      { key: 'tipoAcionamento', label: 'Tipo de acionamento' },
      { key: 'numeroPolos', label: 'Número de polos' },
    ],
    inspectionItems: [
      { key: 'estadoGeral', label: 'Estado geral' },
      { key: 'limpeza', label: 'Limpeza' },
      { key: 'aquecimento', label: 'Sinais de aquecimento' },
      { key: 'corrosao', label: 'Oxidação ou corrosão' },
      { key: 'isoladores', label: 'Condição dos isoladores' },
      { key: 'laminas', label: 'Condição das lâminas' },
      { key: 'contatos', label: 'Condição dos contatos' },
      { key: 'alinhamento', label: 'Alinhamento' },
      { key: 'pressaoContato', label: 'Pressão de contato' },
      { key: 'conexoes', label: 'Conexões' },
      { key: 'mecanismoAcionamento', label: 'Mecanismo de acionamento' },
      { key: 'operacaoManual', label: 'Operação manual' },
      { key: 'operacaoMotorizada', label: 'Operação motorizada, quando aplicável' },
      { key: 'intertravamentos', label: 'Intertravamentos' },
      { key: 'aterramentoEstrutura', label: 'Aterramento da estrutura' },
      { key: 'lubrificacao', label: 'Lubrificação' },
    ],
    measurementFields: [
      { key: 'resistenciaIsolamento', label: 'Resistência de isolamento' },
      { key: 'resistenciaContatoA', label: 'Resistência de contato fase A' },
      { key: 'resistenciaContatoB', label: 'Resistência de contato fase B' },
      { key: 'resistenciaContatoC', label: 'Resistência de contato fase C' },
      { key: 'continuidadeAterramento', label: 'Continuidade do aterramento' },
    ],
    conclusionFields,
  },
  {
    tipo: 'para_raios',
    tableName: 'manutencao_fichas_para_raios',
    routeSegment: 'ficha-para-raios',
    title: 'Ficha de Para-raios',
    equipmentLabel: 'Para-raios',
    createLabel: 'Salvar para-raios',
    openLabel: 'Abrir ficha de para-raios',
    minimumFields: [
      { key: 'tag', label: 'TAG do para-raios' },
      { key: 'fabricante', label: 'Fabricante do para-raios' },
      { key: 'modelo', label: 'Modelo do para-raios' },
      { key: 'tensaoNominal', label: 'Tensão nominal' },
    ],
    identificationFields: [
      { key: 'tag', label: 'TAG / identificação' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'serie', label: 'Número de série' },
      { key: 'tensaoNominal', label: 'Tensão nominal' },
      { key: 'tensaoOperacaoContinua', label: 'Tensão de operação contínua' },
      { key: 'correnteDescarga', label: 'Corrente nominal de descarga' },
      { key: 'classe', label: 'Classe' },
      { key: 'anoFabricacao', label: 'Ano de fabricação' },
      { key: 'fasePosicao', label: 'Fase ou posição' },
    ],
    inspectionItems: [
      { key: 'estadoGeral', label: 'Estado geral' },
      { key: 'limpeza', label: 'Limpeza' },
      { key: 'trincasDanos', label: 'Trincas ou danos' },
      { key: 'vedacao', label: 'Vedação' },
      { key: 'corrosao', label: 'Oxidação ou corrosão' },
      { key: 'conexoesSuperiores', label: 'Conexões superiores' },
      { key: 'conexaoAterramento', label: 'Conexão de aterramento' },
      { key: 'caboAterramento', label: 'Cabo de aterramento' },
      { key: 'desligadorAutomatico', label: 'Desligador automático' },
      { key: 'contadorDescargas', label: 'Contador de descargas, quando existente' },
      { key: 'fixacao', label: 'Fixação' },
      { key: 'distanciaPosicionamento', label: 'Distância e posicionamento' },
    ],
    measurementFields: [
      { key: 'resistenciaIsolamento', label: 'Resistência de isolamento' },
      { key: 'correnteFuga', label: 'Corrente de fuga, quando informada' },
      { key: 'medicaoFaseA', label: 'Medição fase A' },
      { key: 'medicaoFaseB', label: 'Medição fase B' },
      { key: 'medicaoFaseC', label: 'Medição fase C' },
    ],
    conclusionFields,
  },
  {
    tipo: 'tc_tp',
    tableName: 'manutencao_fichas_tc_tp',
    routeSegment: 'ficha-tc-tp',
    title: 'Ficha de TC/TP',
    equipmentLabel: 'TC/TP',
    createLabel: 'Salvar TC/TP',
    openLabel: 'Abrir ficha de TC/TP',
    minimumFields: [
      { key: 'tag', label: 'TAG do TC/TP' },
      { key: 'tipoInstrumento', label: 'Tipo TC ou TP' },
      { key: 'fabricante', label: 'Fabricante do TC/TP' },
      { key: 'modelo', label: 'Modelo do TC/TP' },
      { key: 'relacao', label: 'Relação' },
    ],
    identificationFields: [
      { key: 'tag', label: 'TAG / identificação' },
      { key: 'tipoInstrumento', label: 'Tipo TC ou TP' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'serie', label: 'Número de série' },
      { key: 'fase', label: 'Fase' },
      { key: 'tensaoNominal', label: 'Tensão nominal' },
      { key: 'relacaoTransformacao', label: 'Relação de transformação' },
      { key: 'correntePrimariaSecundaria', label: 'Corrente primária e secundária, quando TC' },
      { key: 'tensaoPrimariaSecundaria', label: 'Tensão primária e secundária, quando TP' },
      { key: 'classeExatidao', label: 'Classe de exatidão' },
      { key: 'potenciaCargaNominal', label: 'Potência ou carga nominal' },
      { key: 'frequencia', label: 'Frequência' },
      { key: 'nivelIsolamento', label: 'Nível de isolamento' },
      { key: 'anoFabricacao', label: 'Ano de fabricação' },
    ],
    inspectionItems: [
      { key: 'estadoGeral', label: 'Estado geral' },
      { key: 'limpeza', label: 'Limpeza' },
      { key: 'isoladores', label: 'Isoladores' },
      { key: 'trincas', label: 'Trincas' },
      { key: 'vazamentos', label: 'Vazamentos, quando aplicável' },
      { key: 'terminaisPrimarios', label: 'Terminais primários' },
      { key: 'terminaisSecundarios', label: 'Terminais secundários' },
      { key: 'conexoes', label: 'Conexões' },
      { key: 'identificacaoTerminais', label: 'Identificação dos terminais' },
      { key: 'aterramentoSecundario', label: 'Aterramento do secundário' },
      { key: 'aterramentoEstrutura', label: 'Aterramento da estrutura' },
      { key: 'caixaBornes', label: 'Caixa de bornes' },
      { key: 'fusiveisTp', label: 'Fusíveis do TP, quando aplicável' },
      { key: 'corrosao', label: 'Oxidação ou corrosão' },
    ],
    measurementFields: [
      { key: 'resistenciaIsolamento', label: 'Resistência de isolamento' },
      { key: 'relacaoTransformacaoEnsaio', label: 'Relação de transformação' },
      { key: 'polaridade', label: 'Polaridade' },
      { key: 'continuidadeSecundario', label: 'Continuidade do secundário' },
      { key: 'medicaoFaseA', label: 'Medição fase A' },
      { key: 'medicaoFaseB', label: 'Medição fase B' },
      { key: 'medicaoFaseC', label: 'Medição fase C' },
    ],
    conclusionFields,
  },
  {
    tipo: 'cabo_media_tensao',
    tableName: 'manutencao_fichas_cabos_media_tensao',
    routeSegment: 'ficha-cabos-media-tensao',
    title: 'Ficha de Cabos de Média Tensão',
    equipmentLabel: 'Cabos de média tensão',
    createLabel: 'Salvar cabos de média tensão',
    openLabel: 'Abrir ficha de cabos de média tensão',
    minimumFields: [
      { key: 'tag', label: 'TAG ou circuito' },
      { key: 'origem', label: 'Origem' },
      { key: 'destino', label: 'Destino' },
      { key: 'classeTensao', label: 'Classe de tensão' },
      { key: 'secaoNominal', label: 'Seção nominal' },
    ],
    identificationFields: [
      { key: 'tag', label: 'TAG ou circuito' },
      { key: 'origem', label: 'Origem' },
      { key: 'destino', label: 'Destino' },
      { key: 'fabricante', label: 'Fabricante' },
      { key: 'tipoCabo', label: 'Tipo do cabo' },
      { key: 'classeTensao', label: 'Classe de tensão' },
      { key: 'materialCondutor', label: 'Material do condutor' },
      { key: 'secaoNominal', label: 'Seção nominal' },
      { key: 'comprimentoAproximado', label: 'Comprimento aproximado' },
      { key: 'anoInstalacao', label: 'Ano de instalação' },
      { key: 'quantidadeCabosFase', label: 'Quantidade de cabos por fase' },
    ],
    inspectionItems: [
      { key: 'estadoGeral', label: 'Estado geral' },
      { key: 'identificacaoFases', label: 'Identificação das fases' },
      { key: 'cobertura', label: 'Condição da cobertura' },
      { key: 'terminacoes', label: 'Condição das terminações' },
      { key: 'emendas', label: 'Condição das emendas' },
      { key: 'blindagem', label: 'Blindagem' },
      { key: 'aterramentoBlindagem', label: 'Aterramento da blindagem' },
      { key: 'conexoes', label: 'Conexões' },
      { key: 'curvatura', label: 'Curvatura' },
      { key: 'fixacao', label: 'Fixação' },
      { key: 'aquecimento', label: 'Sinais de aquecimento' },
      { key: 'umidade', label: 'Umidade' },
      { key: 'corrosao', label: 'Oxidação ou corrosão' },
      { key: 'limpeza', label: 'Limpeza' },
      { key: 'distanciaAcomodacao', label: 'Distância e acomodação' },
    ],
    measurementFields: [
      { key: 'resistenciaIsolamentoA', label: 'Resistência de isolamento fase A' },
      { key: 'resistenciaIsolamentoB', label: 'Resistência de isolamento fase B' },
      { key: 'resistenciaIsolamentoC', label: 'Resistência de isolamento fase C' },
      { key: 'tensaoEnsaio', label: 'Tensão de ensaio, quando informada' },
      { key: 'tempoEnsaio', label: 'Tempo de ensaio, quando informado' },
      { key: 'correnteFuga', label: 'Corrente de fuga, quando informada' },
      { key: 'continuidadeBlindagem', label: 'Continuidade da blindagem' },
      { key: 'resultadoFaseA', label: 'Resultado fase A' },
      { key: 'resultadoFaseB', label: 'Resultado fase B' },
      { key: 'resultadoFaseC', label: 'Resultado fase C' },
    ],
    conclusionFields,
  },
  {
    tipo: 'aterramento',
    tableName: 'manutencao_fichas_aterramento',
    routeSegment: 'ficha-aterramento',
    title: 'Ficha de Aterramento',
    equipmentLabel: 'Aterramento',
    createLabel: 'Salvar aterramento',
    openLabel: 'Abrir ficha de aterramento',
    hasGroundingMeasurements: true,
    minimumFields: [
      { key: 'tag', label: 'Identificação' },
      { key: 'local', label: 'Local ou ponto' },
      { key: 'tipoAterramento', label: 'Tipo de aterramento' },
    ],
    identificationFields: [
      { key: 'tag', label: 'Identificação do sistema' },
      { key: 'local', label: 'Local ou ponto' },
      { key: 'tipoAterramento', label: 'Tipo de aterramento' },
      { key: 'instrumentoUtilizado', label: 'Instrumento utilizado' },
      { key: 'serieInstrumento', label: 'Número de série do instrumento' },
      { key: 'dataCalibracao', label: 'Data da calibração, quando informada' },
      { key: 'metodoMedicao', label: 'Método de medição' },
      { key: 'condicaoSolo', label: 'Condição do solo' },
      { key: 'condicaoClimatica', label: 'Condição climática' },
      { key: 'valorReferencia', label: 'Valor de referência, quando informado' },
    ],
    inspectionItems: [
      { key: 'estadoGeral', label: 'Estado geral' },
      { key: 'condutores', label: 'Condutores de aterramento' },
      { key: 'conexoes', label: 'Conexões' },
      { key: 'barramentos', label: 'Barramentos' },
      { key: 'caixasInspecao', label: 'Caixas de inspeção' },
      { key: 'hastes', label: 'Hastes' },
      { key: 'soldasExotermicas', label: 'Soldas exotérmicas' },
      { key: 'conectores', label: 'Conectores' },
      { key: 'corrosao', label: 'Corrosão' },
      { key: 'continuidade', label: 'Continuidade' },
      { key: 'equipotencializacao', label: 'Equipotencialização' },
      { key: 'aterramentoEstruturas', label: 'Aterramento das estruturas' },
      { key: 'identificacao', label: 'Identificação' },
      { key: 'acessibilidade', label: 'Acessibilidade dos pontos' },
    ],
    measurementFields: [
      { key: 'continuidadeGeral', label: 'Continuidade geral' },
      { key: 'menorValorMedido', label: 'Menor valor medido' },
      { key: 'maiorValorMedido', label: 'Maior valor medido' },
      { key: 'valorMedio', label: 'Valor médio' },
    ],
    conclusionFields,
  },
];

export const emptyFichaComplementarSnapshot: FichaComplementarSnapshot = {
  data: {},
  inspectionStatus: {},
  measurements: [],
};

export function isValidFichaComplementarId(value: string) {
  return UUID_REGEX.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyPersistedValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value == null) return '';
  return null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const normalized = stringifyPersistedValue(entry);
      return normalized == null ? [] : [[key, normalized]];
    })
  );
}

function isInspectionStatus(value: unknown): value is InspectionStatus {
  return value === 'C' || value === 'N/C' || value === 'N/A';
}

function inspectionStatusRecord(value: unknown): Record<string, InspectionStatus> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, InspectionStatus] => (
      typeof entry[0] === 'string' && isInspectionStatus(entry[1])
    ))
  );
}

function normalizeMeasurements(value: unknown): AterramentoMeasurement[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry) || !entry.id) return [];
    const id = stringifyPersistedValue(entry.id);
    if (!id) return [];

    return [{
      id,
      ponto: stringifyPersistedValue(entry.ponto) ?? '',
      valorOhms: stringifyPersistedValue(entry.valorOhms) ?? '',
      resultado: stringifyPersistedValue(entry.resultado) ?? '',
      observacao: stringifyPersistedValue(entry.observacao) ?? '',
    }];
  });
}

export function normalizeFichaComplementarSnapshot(value: unknown): FichaComplementarSnapshot {
  if (!isRecord(value)) return emptyFichaComplementarSnapshot;

  return {
    data: stringRecord(value.data),
    inspectionStatus: inspectionStatusRecord(value.inspectionStatus),
    measurements: normalizeMeasurements(value.measurements),
  };
}

export function fichaComplementarSnapshotToJson(snapshot: FichaComplementarSnapshot): JsonObject {
  return snapshot as unknown as JsonObject;
}

function parseMeasurement(value: string) {
  const normalized = value.trim().replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : null;
}

export function calculateAterramentoMeasurementSummary(measurements: AterramentoMeasurement[]) {
  const values = measurements
    .map((measurement) => parseMeasurement(measurement.valorOhms))
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (!values.length) {
    return { menorValorMedido: '', maiorValorMedido: '', valorMedio: '' };
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return {
    menorValorMedido: Math.min(...values).toFixed(2),
    maiorValorMedido: Math.max(...values).toFixed(2),
    valorMedio: (sum / values.length).toFixed(2),
  };
}

export function buildFichaComplementarSearchParams(input: {
  manutencaoId: string;
  equipamentoId: string;
  fichaId?: string;
}) {
  if (!isValidFichaComplementarId(input.manutencaoId)) {
    throw new Error('manutencaoId inválido');
  }

  if (!isValidFichaComplementarId(input.equipamentoId)) {
    throw new Error('equipamentoId inválido');
  }

  if (input.fichaId && !isValidFichaComplementarId(input.fichaId)) {
    throw new Error('fichaId inválido');
  }

  const params = new URLSearchParams({
    manutencaoId: input.manutencaoId,
    equipamentoId: input.equipamentoId,
  });

  if (input.fichaId) params.set('fichaId', input.fichaId);
  return params.toString();
}

export function getFichaComplementarDefinition(tableName: FichaComplementarTableName) {
  return fichaComplementarDefinitions.find((definition) => definition.tableName === tableName);
}
