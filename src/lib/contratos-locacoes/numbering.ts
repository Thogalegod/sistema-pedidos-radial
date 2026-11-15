/**
 * Generates a receipt number in the format R######NNN, e.g. R260121001.
 * 
 * @param reference A 6-digit short reference of the rental or order (typically YYMMDD).
 * @param sequence An integer sequence number from 1 to 999.
 * @returns The formatted 10-character receipt number string.
 */
export function receiptNumber(reference: string, sequence: number): string {
  // Validate reference: exactly 6 digits from the approved short reference rule
  const refRegex = /^\d{6}$/;
  if (!refRegex.test(reference)) {
    throw new Error('Reference must be exactly 6 digits');
  }

  // Validate sequence: between 1 and 999 inclusive
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error('Sequence number must be an integer between 1 and 999');
  }

  const seqStr = sequence.toString().padStart(3, '0');
  const result = `R${reference}${seqStr}`;

  if (result.length !== 10) {
    throw new Error('Generated receipt number must be exactly 10 characters long');
  }

  return result;
}

export function buildReceiptReferenceFromInternalNumber(
  internalNumber: string | number
): string {
  const rawValue = String(internalNumber).trim();

  if (!/^\d+$/.test(rawValue)) {
    throw new Error('Internal number must contain apenas dígitos');
  }

  const numericValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 999999) {
    throw new Error('Internal number must be between 1 e 999999');
  }

  return rawValue.padStart(6, '0');
}

export function receiptNumberFromInternalNumber(
  internalNumber: string | number,
  sequence: number
): string {
  return receiptNumber(buildReceiptReferenceFromInternalNumber(internalNumber), sequence);
}

/**
 * Validates whether a string matches the standard receipt format (R######NNN).
 */
export function isValidReceiptNumber(docNum: string): boolean {
  const receiptRegex = /^R\d{6}\d{3}$/;
  return receiptRegex.test(docNum);
}
