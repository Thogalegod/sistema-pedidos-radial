/**
 * Generates a receipt number in the format R######NNN, e.g. R260121001.
 * 
 * @param reference A 6-character short reference of the rental or order (typically YYMMDD).
 * @param sequence An integer sequence number from 1 to 999.
 * @returns The formatted 10-character receipt number string.
 */
export function receiptNumber(reference: string, sequence: number): string {
  // Validate reference: exactly 6 alphanumeric characters
  const refRegex = /^[a-zA-Z0-9]{6}$/;
  if (!refRegex.test(reference)) {
    throw new Error('Reference must be exactly 6 alphanumeric characters');
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

/**
 * Validates whether a string matches the standard receipt format (R######NNN).
 */
export function isValidReceiptNumber(docNum: string): boolean {
  const receiptRegex = /^R[a-zA-Z0-9]{6}\d{3}$/;
  return receiptRegex.test(docNum);
}
