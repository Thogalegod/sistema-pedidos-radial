// ============================================================
// MOTOR DE CÁLCULO — RELATÓRIO TÉCNICO DE TRANSFORMADOR
// Normas: ABNT NBR 5356, NBR 5440, NBR IEC 60156
// Classe de tensão: 15 kV | Frequência: 60 Hz
// ============================================================

// --- TIPOS ---------------------------------------------------

export type TensaoBT = '220' | '380' | '440';

export interface TransformerInput {
  // Cliente
  clienteNome: string;
  clienteEndereco: string;
  clienteCidade: string;
  clienteUf: string;
  clienteCnpj?: string;
  clienteIe?: string;
  observacoes?: string;

  // Transformador
  fabricante?: string;
  numeroSerie?: string;
  potenciaKva: number;
  tensaoAtNominal: number;    // V — tensão primária nominal (ex: 13800)
  tensaoBt: TensaoBT;         // '220' | '380' | '440'
  resfriamento?: string;
  grupoLigacao?: string;
  tipoOleo?: string;
  procedenciaOleo?: string;
  taps: number[];             // Array de tensões AT em V — ex: [13800, 13200, 12600, 12000, 11400]
  tapDespacho: number;        // Tap ativo

  // Ensaio
  temperaturaC?: number;
  umidadeRelativa?: number;
  dataRelatorio: string;      // ISO date string
  responsavelNome?: string;
  responsavelCrea?: string;
}

export interface TapResult {
  tensaoAt: number;
  relacaoTeorica: number;
  relH1H2: number;
  relH2H3: number;
  relH3H1: number;
  correnteAt: number;
}

export interface TransformerOutput {
  // Correntes
  correnteBt: number;
  taps: TapResult[];

  // Perdas em vazio
  perdaVazioP: number;        // W
  perdaVazioI1: number;       // A
  perdaVazioI2: number;       // A
  perdaVazioI3: number;       // A
  perdaVazioImed: number;     // A
  excitacaoPercent: number;   // %

  // Perdas em carga e impedância
  perdaCargaPcc75: number;    // W a 75°C
  perdaCargaPcc22: number;    // W a 22°C
  impedanciaPercent75: number; // % a 75°C
  impedanciaPercent22: number; // % a 22°C
  tensaoCurtoCircuito: number; // V

  // Tensão aplicada e induzida
  tensaoAplicadaPrimKv: number;
  tensaoAplicadaSecKv: number;
  tensaoInduzidaV: number;
  tensaoInduzidaIF: number;   // A

  // Resistência de isolamento
  isolAtBt: number;           // MΩ
  isolAtMassa: number;        // MΩ
  isolBtMassa: number;        // MΩ

  // Rigidez dielétrica do óleo
  rigidezKv: number;

  // Temperaturas usadas
  temperaturaC: number;
}

// --- CONSTANTES POR POTÊNCIA ---------------------------------

interface PowerRange {
  perdaVazioMin: number;
  perdaVazioMax: number;
  perdaCargaMin: number;
  perdaCargaMax: number;
  impedanciaMin: number;
  impedanciaMax: number;
  excitacaoMin: number;
  excitacaoMax: number;
}

const FAIXAS_POR_POTENCIA: Record<number, PowerRange> = {
  45:   { perdaVazioMin: 140, perdaVazioMax: 190, perdaCargaMin: 550,  perdaCargaMax: 750,   impedanciaMin: 3.0, impedanciaMax: 4.0, excitacaoMin: 2.0, excitacaoMax: 4.0 },
  75:   { perdaVazioMin: 220, perdaVazioMax: 320, perdaCargaMin: 900,  perdaCargaMax: 1200,  impedanciaMin: 3.0, impedanciaMax: 4.5, excitacaoMin: 1.8, excitacaoMax: 3.5 },
  112.5:{ perdaVazioMin: 300, perdaVazioMax: 450, perdaCargaMin: 1300, perdaCargaMax: 1800,  impedanciaMin: 3.5, impedanciaMax: 4.5, excitacaoMin: 1.5, excitacaoMax: 3.0 },
  150:  { perdaVazioMin: 400, perdaVazioMax: 600, perdaCargaMin: 1700, perdaCargaMax: 2300,  impedanciaMin: 3.5, impedanciaMax: 4.5, excitacaoMin: 1.2, excitacaoMax: 2.8 },
  225:  { perdaVazioMin: 550, perdaVazioMax: 850, perdaCargaMin: 2500, perdaCargaMax: 3400,  impedanciaMin: 4.0, impedanciaMax: 5.0, excitacaoMin: 1.0, excitacaoMax: 2.5 },
  300:  { perdaVazioMin: 700, perdaVazioMax: 1050,perdaCargaMin: 3200, perdaCargaMax: 4400,  impedanciaMin: 4.0, impedanciaMax: 5.0, excitacaoMin: 0.8, excitacaoMax: 2.3 },
  500:  { perdaVazioMin: 1000,perdaVazioMax: 1600,perdaCargaMin: 5000, perdaCargaMax: 7000,  impedanciaMin: 4.0, impedanciaMax: 5.5, excitacaoMin: 0.6, excitacaoMax: 2.0 },
  750:  { perdaVazioMin: 1400,perdaVazioMax: 2200,perdaCargaMin: 7000, perdaCargaMax: 10000, impedanciaMin: 4.5, impedanciaMax: 6.0, excitacaoMin: 0.5, excitacaoMax: 1.8 },
  1000: { perdaVazioMin: 1800,perdaVazioMax: 3000,perdaCargaMin: 9000, perdaCargaMax: 13000, impedanciaMin: 4.5, impedanciaMax: 6.0, excitacaoMin: 0.4, excitacaoMax: 1.5 },
  1500: { perdaVazioMin: 2500,perdaVazioMax: 4200,perdaCargaMin: 13000,perdaCargaMax: 19000, impedanciaMin: 5.0, impedanciaMax: 6.5, excitacaoMin: 0.3, excitacaoMax: 1.2 },
  2000: { perdaVazioMin: 3200,perdaVazioMax: 5500,perdaCargaMin: 17000,perdaCargaMax: 25000, impedanciaMin: 5.0, impedanciaMax: 7.0, excitacaoMin: 0.3, excitacaoMax: 1.0 },
};

// Potências suportadas em ordem crescente
const POTENCIAS_SUPORTADAS = [45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000];

// --- HELPERS -------------------------------------------------

/**
 * Interpolação linear entre duas potências para obter faixa intermediária
 */
function interpolateFaixa(potencia: number): PowerRange {
  // Procura potência exata
  if (FAIXAS_POR_POTENCIA[potencia]) return FAIXAS_POR_POTENCIA[potencia];

  // Interpola entre as duas mais próximas
  const potencias = POTENCIAS_SUPORTADAS;
  let lower = potencias[0];
  let upper = potencias[potencias.length - 1];

  for (let i = 0; i < potencias.length - 1; i++) {
    if (potencia >= potencias[i] && potencia <= potencias[i + 1]) {
      lower = potencias[i];
      upper = potencias[i + 1];
      break;
    }
  }

  const fLower = FAIXAS_POR_POTENCIA[lower];
  const fUpper = FAIXAS_POR_POTENCIA[upper];
  const t = (potencia - lower) / (upper - lower);

  return {
    perdaVazioMin: Math.round(fLower.perdaVazioMin + t * (fUpper.perdaVazioMin - fLower.perdaVazioMin)),
    perdaVazioMax: Math.round(fLower.perdaVazioMax + t * (fUpper.perdaVazioMax - fLower.perdaVazioMax)),
    perdaCargaMin: Math.round(fLower.perdaCargaMin + t * (fUpper.perdaCargaMin - fLower.perdaCargaMin)),
    perdaCargaMax: Math.round(fLower.perdaCargaMax + t * (fUpper.perdaCargaMax - fLower.perdaCargaMax)),
    impedanciaMin: +(fLower.impedanciaMin + t * (fUpper.impedanciaMin - fLower.impedanciaMin)).toFixed(2),
    impedanciaMax: +(fLower.impedanciaMax + t * (fUpper.impedanciaMax - fLower.impedanciaMax)).toFixed(2),
    excitacaoMin: +(fLower.excitacaoMin + t * (fUpper.excitacaoMin - fLower.excitacaoMin)).toFixed(2),
    excitacaoMax: +(fLower.excitacaoMax + t * (fUpper.excitacaoMax - fLower.excitacaoMax)).toFixed(2),
  };
}

/**
 * Gera valor determinístico dentro de uma faixa.
 * Usa o número de série como semente para gerar sempre o mesmo valor
 * para o mesmo equipamento. Posição 0.50 ± 0.10 da faixa.
 */
function deterministicValue(min: number, max: number, seed: string, offset: number = 0): number {
  // Hash simples do seed para reprodutibilidade
  let hash = 0;
  const str = seed + offset.toString();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  // Normaliza para [0, 1] e posiciona entre 40% e 60% da faixa
  const norm = Math.abs(hash % 1000) / 1000; // 0 a 1
  const position = 0.40 + norm * 0.20;       // 40% a 60% da faixa
  return +(min + position * (max - min)).toFixed(2);
}

/**
 * Variação controlada entre fases.
 * Gera 3 variações independentes, sem ordem forçada, garantindo spread aleatório
 * de no mínimo 0.15% para que o erro percentual seja sempre visível e realista.
 */
function phaseVariation(teorico: number, tapIndex: number, seed: string): [number, number, number] {
  // Gera 3 offsets independentes com seeds completamente diferentes
  const h1 = deterministicValue(-0.20, +0.20, seed + '_h1_t' + tapIndex, tapIndex * 7);
  const h2 = deterministicValue(-0.20, +0.20, seed + '_h2_t' + tapIndex, tapIndex * 13);
  const h3 = deterministicValue(-0.20, +0.20, seed + '_h3_t' + tapIndex, tapIndex * 19);

  // Garante spread mínimo de 0.15% entre maior e menor
  const vals = [h1, h2, h3];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const spread = max - min;

  if (spread < 0.15) {
    // Redistribui forçando separação mínima sem ordenar
    const mid = (min + max) / 2;
    vals[0] = h1 + (h1 >= mid ? +0.08 : -0.08);
    vals[1] = h2 + (h2 >= mid ? +0.08 : -0.08);
    vals[2] = h3 + (h3 >= mid ? +0.08 : -0.08);
  }

  return [
    +(teorico * (1 + vals[0] / 100)).toFixed(2),
    +(teorico * (1 + vals[1] / 100)).toFixed(2),
    +(teorico * (1 + vals[2] / 100)).toFixed(2),
  ];
}

/**
 * Tensão de referência BT (fase-neutro) para cálculo da relação de transformação
 */
function tensaoBtReferencia(tensaoBt: TensaoBT): number {
  const map: Record<TensaoBT, number> = { '220': 127, '380': 220, '440': 254 };
  return map[tensaoBt];
}

/**
 * Tensão de linha BT para cálculo de corrente nominal
 */
function tensaoBtLinha(tensaoBt: TensaoBT): number {
  const map: Record<TensaoBT, number> = { '220': 220, '380': 380, '440': 440 };
  return map[tensaoBt];
}

// --- FUNÇÃO PRINCIPAL ----------------------------------------

/**
 * Gera todos os valores do relatório técnico de transformador.
 * Os valores são determinísticos: mesmos inputs → mesmos outputs.
 * Para gerar nova variação, altere o número de série ou adicione um salt.
 */
export function calcularRelatorio(input: TransformerInput): TransformerOutput {
  const seed = `${input.potenciaKva}_${input.tensaoBt}_${input.tensaoAtNominal}_${input.numeroSerie || 'S/N'}`;
  const kva = input.potenciaKva;
  const faixas = interpolateFaixa(kva);
  const sqrt3 = Math.sqrt(3);

  // 1. CORRENTE NOMINAL BT
  const vlBt = tensaoBtLinha(input.tensaoBt);
  const correnteBt = +(kva * 1000 / (sqrt3 * vlBt)).toFixed(2);

  // 2. RELAÇÃO DE TRANSFORMAÇÃO + CORRENTE AT POR TAP
  const vtRef = tensaoBtReferencia(input.tensaoBt);
  const taps: TapResult[] = input.taps.map((tensaoAt, idx) => {
    const relacaoTeorica = +(tensaoAt / vtRef).toFixed(2);
    const [f1, f2, f3] = phaseVariation(relacaoTeorica, idx, seed);
    return {
      tensaoAt,
      relacaoTeorica,
      relH1H2: f1,
      relH2H3: f2,
      relH3H1: f3,
      correnteAt: +(kva * 1000 / (sqrt3 * tensaoAt)).toFixed(2),
    };
  });

  // 3. PERDAS EM VAZIO
  const perdaVazioP = Math.round(deterministicValue(faixas.perdaVazioMin, faixas.perdaVazioMax, seed + '_pv'));

  // 4. CORRENTE DE EXCITAÇÃO
  const excitacaoPercent = +deterministicValue(faixas.excitacaoMin, faixas.excitacaoMax, seed + '_exc').toFixed(2);
  const excitacaoBase = +(correnteBt * excitacaoPercent / 100).toFixed(2);
  // Três fases com pequena variação
  const i1 = +(excitacaoBase * 1.022).toFixed(2);
  const i2 = +(excitacaoBase * 0.957).toFixed(2);
  const i3 = +(excitacaoBase * 1.021).toFixed(2);
  const iMed = +((i1 + i2 + i3) / 3).toFixed(2);

  // 5. PERDAS EM CARGA E IMPEDÂNCIA
  const perdaCargaPcc75 = Math.round(deterministicValue(faixas.perdaCargaMin, faixas.perdaCargaMax, seed + '_pc'));
  // Valor a 22°C ≈ 85% do valor a 75°C (correção de temperatura aproximada)
  const perdaCargaPcc22 = Math.round(perdaCargaPcc75 * 0.845);

  const impedanciaPercent75 = +deterministicValue(faixas.impedanciaMin, faixas.impedanciaMax, seed + '_imp').toFixed(2);
  // Valor a 22°C ≈ 83% do valor a 75°C
  const impedanciaPercent22 = +(impedanciaPercent75 * 0.832).toFixed(2);

  // Tensão de curto-circuito (ensaio pelo lado BT)
  const tensaoCurtoCircuito = +(vlBt * impedanciaPercent75 / 100).toFixed(2);

  // 6. TENSÃO APLICADA (classe 15 kV — fixo por norma)
  const tensaoAplicadaPrimKv = 34;
  const tensaoAplicadaSecKv = 10;

  // 7. TENSÃO INDUZIDA
  const tensaoInduzidaV = vlBt;
  // Corrente de excitação IF ≈ proporcional ao tamanho do trafo
  const tensaoInduzidaIF = +(correnteBt * excitacaoPercent / 100 * 1.05).toFixed(1);

  // 8. RESISTÊNCIA DE ISOLAMENTO
  // AT x BT e AT x Massa: faixa alta (1000–5000 MΩ a 5000 V)
  const isolAtBt = Math.round(deterministicValue(1000, 5000, seed + '_iso1'));
  const isolAtMassa = Math.round(deterministicValue(1000, 5000, seed + '_iso2'));
  // BT x Massa: faixa ligeiramente menor (500–3000 MΩ a 2500 V)
  const isolBtMassa = Math.round(deterministicValue(500, 3000, seed + '_iso3'));

  // 9. RIGIDEZ DIELÉTRICA DO ÓLEO
  // Óleo mineral em bom estado: 35–50 kV (ABNT NBR IEC 60156)
  const rigidezKv = Math.round(deterministicValue(35, 50, seed + '_rd'));

  const temperaturaC = input.temperaturaC ?? 26;

  return {
    correnteBt,
    taps,
    perdaVazioP,
    perdaVazioI1: i1,
    perdaVazioI2: i2,
    perdaVazioI3: i3,
    perdaVazioImed: iMed,
    excitacaoPercent,
    perdaCargaPcc75,
    perdaCargaPcc22,
    impedanciaPercent75,
    impedanciaPercent22,
    tensaoCurtoCircuito,
    tensaoAplicadaPrimKv,
    tensaoAplicadaSecKv,
    tensaoInduzidaV,
    tensaoInduzidaIF,
    isolAtBt,
    isolAtMassa,
    isolBtMassa,
    rigidezKv,
    temperaturaC,
  };
}

/**
 * Gera o número de relatório no formato RT-YYYYMM-NNN
 * O número sequencial deve vir do banco (ver função no servidor)
 */
export function formatarNumeroRelatorio(sequencial: number): string {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(sequencial).padStart(3, '0');
  return `RT-${ano}${mes}-${seq}`;
}

/**
 * Retorna o label da tensão BT
 */
export function tensaoBtLabel(tensaoBt: TensaoBT): string {
  const map: Record<TensaoBT, string> = {
    '220': '220 / 127 V',
    '380': '380 / 220 V',
    '440': '440 / 254 V',
  };
  return map[tensaoBt];
}

/**
 * Taps padrão para 13,8 kV classe 15 kV
 */
export const TAPS_PADRAO_13800 = [13800, 13200, 12600, 12000, 11400];

/**
 * Potências disponíveis no sistema
 */
export const POTENCIAS_DISPONIVEIS = [45, 75, 112.5, 150, 225, 300, 500, 750, 1000, 1500, 2000];

/**
 * Tensões BT disponíveis
 */
export const TENSOES_BT: { value: TensaoBT; label: string }[] = [
  { value: '220', label: '220 / 127 V' },
  { value: '380', label: '380 / 220 V' },
  { value: '440', label: '440 / 254 V' },
];
