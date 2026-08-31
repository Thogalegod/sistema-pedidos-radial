import { z } from 'zod';
import type { RentalInvoiceSnapshot } from './rental-invoice';
import type { BillingSendRequest, ContractCompany, CustomerContact } from './types';

const EMAIL_SCHEMA = z.email();
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECIPIENTS = 50;
const MAX_ADDITIONAL_MESSAGE_LENGTH = 2_000;

const BILLING_SEND_REQUEST_SCHEMA = z.object({
  send_request_id: z.string().regex(UUID_V4_PATTERN),
  recipients: z.array(z.string()).min(1).max(MAX_RECIPIENTS),
  additional_message: z.string().max(MAX_ADDITIONAL_MESSAGE_LENGTH).nullable(),
}).strict();

export function normalizeBillingRecipients(input: string[]): string[] {
  const recipients = [...new Set(input.map((email) => email.trim().toLowerCase()))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (
    recipients.length < 1 ||
    recipients.length > MAX_RECIPIENTS ||
    recipients.some((email) => !EMAIL_SCHEMA.safeParse(email).success)
  ) {
    throw new Error('Destinatários de cobrança inválidos');
  }
  return recipients;
}

export function buildDefaultRecipients(contacts: CustomerContact[]): string[] {
  const candidates = contacts
    .filter((contact) => contact.receives_billing && contact.email)
    .map((contact) => contact.email as string)
    .filter((email) => EMAIL_SCHEMA.safeParse(email.trim()).success);

  return candidates.length > 0 ? normalizeBillingRecipients(candidates) : [];
}

export function parseBillingSendRequest(value: unknown): BillingSendRequest {
  const parsed = BILLING_SEND_REQUEST_SCHEMA.parse(value);
  const additionalMessage = parsed.additional_message?.trim() || null;
  if (additionalMessage && additionalMessage.length > MAX_ADDITIONAL_MESSAGE_LENGTH) {
    throw new Error('Mensagem adicional excede o limite permitido');
  }

  return {
    send_request_id: parsed.send_request_id.toLowerCase(),
    recipients: normalizeBillingRecipients(parsed.recipients),
    additional_message: additionalMessage,
  };
}

export function buildBillingSender(company: ContractCompany): {
  from: string;
  replyTo: string;
  signature: string;
} {
  switch (company) {
    case 'fontes':
      return {
        from: 'Fontes Energia <radial@radialenergia.com.br>',
        replyTo: 'radial@radialenergia.com.br',
        signature: 'Fontes Energia',
      };
    case 'radial':
      return {
        from: 'Radial Equipamentos <radial@radialenergia.com.br>',
        replyTo: 'radial@radialenergia.com.br',
        signature: 'Radial Equipamentos',
      };
    default:
      throw new Error('Empresa do contrato inválida para envio');
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveBillingGreeting(
  contacts: CustomerContact[],
  recipients: string[]
): { html: string; text: string } {
  if (recipients.length !== 1) {
    return { html: '<p>Olá,</p>', text: 'Olá,' };
  }

  const recipient = recipients[0].trim().toLowerCase();
  const matchingContacts = contacts.filter((contact) =>
    contact.receives_billing &&
    contact.email?.trim().toLowerCase() === recipient &&
    Boolean(contact.name.trim())
  );
  if (matchingContacts.length !== 1) {
    return { html: '<p>Olá,</p>', text: 'Olá,' };
  }

  const firstName = matchingContacts[0].name.trim().split(/\s+/)[0];
  return {
    html: `<p>Olá, ${escapeHtml(firstName)},</p>`,
    text: `Olá, ${firstName},`,
  };
}

export function buildBillingEmailContent(input: {
  snapshot: RentalInvoiceSnapshot;
  additionalMessage: string | null;
  company: ContractCompany;
  contacts: CustomerContact[];
  recipients: string[];
}): { subject: string; html: string; text: string } {
  const { snapshot } = input;
  buildBillingSender(input.company);
  const message = input.additionalMessage?.trim() || null;
  if (message && message.length > MAX_ADDITIONAL_MESSAGE_LENGTH) {
    throw new Error('Mensagem adicional excede o limite permitido');
  }

  const subject = `Cobrança de locação – Fatura ${snapshot.invoiceNumber} – venc. ${snapshot.dueAtLabel}`;
  const greeting = resolveBillingGreeting(input.contacts, input.recipients);
  const summary = `Seguem anexos a fatura e o boleto referentes à locação do período de ${snapshot.period.label}, com vencimento em ${snapshot.dueAtLabel}.`;
  const htmlMessage = message
    ? `<p><strong>Mensagem adicional:</strong><br>${escapeHtml(message).replaceAll('\n', '<br>')}</p>`
    : '';
  const textMessage = message ? `Mensagem adicional:\n${message}` : '';

  return {
    subject,
    html: [
      greeting.html,
      `<p>${escapeHtml(summary)}</p>`,
      `<p><strong>Valor:</strong> ${escapeHtml(snapshot.totals.totalAmountLabel)}</p>`,
      htmlMessage,
      '<p>Em caso de dúvidas, permanecemos à disposição.</p>',
      '<p>Atenciosamente,<br>Radial Energia</p>',
    ].filter(Boolean).join(''),
    text: [
      greeting.text,
      '',
      summary,
      '',
      `Valor: ${snapshot.totals.totalAmountLabel}`,
      ...(textMessage ? ['', textMessage] : []),
      '',
      'Em caso de dúvidas, permanecemos à disposição.',
      'Atenciosamente,\nRadial Energia',
    ].join('\n'),
  };
}
