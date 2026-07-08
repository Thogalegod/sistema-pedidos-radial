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
