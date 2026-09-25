import 'server-only';

import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import type { RentalInvoiceSnapshot } from './rental-invoice';
import {
  buildRentalInvoiceDocumentContent,
  RentalInvoiceDocument,
} from './pdf/RentalInvoiceDocument';

const RESEND_MAX_ENCODED_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export type CanonicalRentalInvoiceContent = readonly [
  title: string,
  number: string,
  issuerName: string,
  issuerLines: readonly string[],
  recipientLines: readonly string[],
  invoiceDataRows: readonly (readonly [label: string, value: string])[],
  description: string,
  tableHeaders: readonly string[],
  tableRows: readonly (readonly [quantity: string, description: string, unitAmount: string, totalAmount: string])[],
  adjustmentRows: readonly (readonly [label: string, value: string])[],
  totalLabel: string,
  totalInWords: string,
  notes: string | null,
  fiscalNotice: string,
];

export interface PreparedBillingAttachments {
  invoice: Buffer;
  invoiceFileName: string;
  boleto: Buffer;
  boletoFileName: string;
  invoiceSemanticGuard: string;
  boletoBytesGuard: string;
}

export function buildCanonicalRentalInvoiceContent(
  snapshot: RentalInvoiceSnapshot
): CanonicalRentalInvoiceContent {
  const content = buildRentalInvoiceDocumentContent(snapshot);
  return [
    content.title,
    content.number,
    content.issuerName,
    content.issuerLines,
    content.recipientLines,
    content.invoiceDataRows.map((row) => [row.label, row.value] as const),
    content.description,
    content.tableHeaders,
    content.tableRows.map((row) => [
      row.quantity,
      row.description,
      row.unitAmount,
      row.totalAmount,
    ] as const),
    content.adjustmentRows.map((row) => [row.label, row.value] as const),
    content.totalLabel,
    content.totalInWords,
    content.notes,
    content.fiscalNotice,
  ];
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function computeCanonicalRentalInvoiceGuard(
  content: CanonicalRentalInvoiceContent
): string {
  return sha256(JSON.stringify(content));
}

export async function renderRentalInvoiceBuffer(
  snapshot: RentalInvoiceSnapshot
): Promise<Buffer> {
  return renderToBuffer(<RentalInvoiceDocument snapshot={snapshot} />);
}

export function computeBoletoBytesGuard(boleto: Uint8Array): string {
  return sha256(boleto);
}

function base64EncodedLength(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

export async function prepareBillingAttachments(input: {
  snapshot: RentalInvoiceSnapshot;
  boletoBytes: ArrayBuffer;
  billingCycleId: string;
}): Promise<PreparedBillingAttachments> {
  const invoiceSemanticGuard = computeCanonicalRentalInvoiceGuard(
    buildCanonicalRentalInvoiceContent(input.snapshot)
  );
  const invoice = await renderRentalInvoiceBuffer(input.snapshot);
  const boleto = Buffer.from(input.boletoBytes);
  const encodedSize = base64EncodedLength(invoice.byteLength) + base64EncodedLength(boleto.byteLength);
  if (encodedSize > RESEND_MAX_ENCODED_ATTACHMENT_BYTES) {
    throw new Error('Os anexos excedem o limite combinado de 40 MB do provedor');
  }

  return {
    invoice,
    invoiceFileName: input.snapshot.fileName,
    boleto,
    boletoFileName: `boleto-${input.billingCycleId}.pdf`,
    invoiceSemanticGuard,
    boletoBytesGuard: computeBoletoBytesGuard(boleto),
  };
}
