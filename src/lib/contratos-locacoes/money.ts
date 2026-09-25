export interface BillingCalculationInput {
  base: number;      // in cents
  discount: number;  // in cents
  surcharge: number; // in cents
  exemption: number; // in cents
}

/**
 * Calculates the total billing amount in cents.
 * base - discount - exemption + surcharge.
 * Cannot be lower than zero.
 */
export function calculateBilling({
  base,
  discount,
  surcharge,
  exemption,
}: BillingCalculationInput): number {
  const total = base - discount - exemption + surcharge;
  return Math.max(0, total);
}

/**
 * Formats a cent value to a BRL currency string (e.g., 10050 -> "R$ 100,50").
 */
export function formatBRL(value: number | string | null | undefined): string {
  const numericValue = typeof value === 'string' ? Number.parseInt(value, 10) : value ?? 0;
  const cents = Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0;
  const negative = cents < 0;
  const absCents = Math.abs(cents);
  const reals = Math.floor(absCents / 100);
  const fraction = absCents % 100;

  const realsFormatted = reals.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fractionFormatted = fraction.toString().padStart(2, '0');

  return `${negative ? '-' : ''}R$ ${realsFormatted},${fractionFormatted}`;
}

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

export function formatBRLInWords(value: number | string): string {
  const cents = Math.max(0, Math.trunc(typeof value === 'string' ? Number.parseInt(value, 10) : value));
  const reais = Math.floor(cents / 100);
  const fraction = cents % 100;
  const reaisText = reais === 1 ? 'um real' : numberToPortugueseWords(reais) + ' reais';
  const centsText = fraction === 1 ? 'um centavo' : numberToPortugueseWords(fraction) + ' centavos';
  const result = fraction === 0 ? reaisText : reais === 0 ? centsText : reaisText + ' e ' + centsText;

  return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Parses a BRL input string back to cents.
 * Plain digit strings are treated as reais, not centavos.
 */
export function parseBRL(value: string): number {
  if (!value) return 0;

  const trimmed = value.trim();
  if (trimmed === '') return 0;

  const negative = trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9,.-]/g, '').replace(/-/g, '');

  if (cleaned === '') return 0;

  let cents = 0;

  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);

    if (Number.isNaN(parsed)) {
      return 0;
    }

    cents = Math.round(parsed * 100);
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    const lastPart = parts[parts.length - 1] ?? '';

    if (parts.length === 2 && /^\d{1,2}$/.test(lastPart)) {
      const parsed = Number.parseFloat(`${parts[0]}.${lastPart}`);

      if (Number.isNaN(parsed)) {
        return 0;
      }

      cents = Math.round(parsed * 100);
    } else {
      const digitsOnly = cleaned.replace(/\./g, '');
      const parsed = Number.parseInt(digitsOnly, 10);

      if (Number.isNaN(parsed)) {
        return 0;
      }

      cents = parsed * 100;
    }
  } else {
    const parsed = Number.parseInt(cleaned, 10);

    if (Number.isNaN(parsed)) {
      return 0;
    }

    cents = parsed * 100;
  }

  return negative ? -cents : cents;
}

function numberToPortugueseWords(value: number): string {
  if (value < 10) return UNITS[value] ?? '';
  if (value < 20) return TEENS[value - 10] ?? '';
  if (value < 100) {
    const remainder = value % 10;
    return (TENS[Math.floor(value / 10)] ?? '') + (remainder ? ' e ' + numberToPortugueseWords(remainder) : '');
  }
  if (value === 100) return 'cem';
  if (value < 1000) {
    const remainder = value % 100;
    return (HUNDREDS[Math.floor(value / 100)] ?? '') + (remainder ? ' e ' + numberToPortugueseWords(remainder) : '');
  }
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    const prefix = thousands === 1 ? 'mil' : numberToPortugueseWords(thousands) + ' mil';
    const separator = remainder === 0 ? '' : remainder < 100 || remainder % 100 === 0 ? ' e ' : ' ';
    return prefix + separator + (remainder ? numberToPortugueseWords(remainder) : '');
  }

  const millions = Math.floor(value / 1_000_000);
  const remainder = value % 1_000_000;
  const prefix = numberToPortugueseWords(millions) + (millions === 1 ? ' milhão' : ' milhões');
  const separator = remainder === 0 ? '' : remainder < 100 || remainder % 100 === 0 ? ' e ' : ' ';
  return prefix + separator + (remainder ? numberToPortugueseWords(remainder) : '');
}
