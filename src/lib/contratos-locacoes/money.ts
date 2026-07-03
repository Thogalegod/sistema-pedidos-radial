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
 * Formats a cent value to a BRL currency string (e.g., 10050 -> "R$ 100,50")
 */
export function formatBRL(cents: number): string {
  const negative = cents < 0;
  const absCents = Math.abs(cents);
  const reals = Math.floor(absCents / 100);
  const fraction = absCents % 100;
  
  const realsFormatted = reals.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fractionFormatted = fraction.toString().padStart(2, '0');
  
  return `${negative ? '-' : ''}R$ ${realsFormatted},${fractionFormatted}`;
}

/**
 * Parses a BRL input string back to cents, handling dots, commas and currency symbol.
 */
export function parseBRL(value: string): number {
  if (!value) return 0;
  
  // Remove R$, spaces and dots
  let cleanValue = value.replace(/R\$\s?/g, '')
                        .replace(/\s/g, '')
                        .replace(/\./g, '');
                        
  // Replace comma with dot for parsing
  cleanValue = cleanValue.replace(',', '.');
  
  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed)) return 0;
  
  // Convert to cents, rounding to avoid floating point issues
  return Math.round(parsed * 100);
}
