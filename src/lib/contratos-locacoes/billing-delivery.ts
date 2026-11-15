import 'server-only';

import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRecipientAllowed, loadBillingEmailConfig } from './billing-email-config';
import {
  buildDefaultRecipients,
  buildBillingEmailContent,
  buildBillingSender,
  parseBillingSendRequest,
} from './billing-email';
import {
  buildCanonicalRentalInvoiceContent,
  computeBoletoBytesGuard,
  computeCanonicalRentalInvoiceGuard,
  prepareBillingAttachments,
} from './billing-email-attachments.server';
import { buildRentalInvoiceSnapshot, type RentalInvoiceSnapshot } from './rental-invoice';
import type {
  BillingCycle,
  BillingDeliveryEvent,
  BillingDeliveryFinalizationInput,
  BillingLine,
  BillingSendRequest,
  BillingSendPreparation,
  BillingSendResult,
  Contract,
  ContractDocument,
  Customer,
  CustomerContact,
  CustomerSite,
  OrganizationMember,
  Payment,
  PreparedProviderEmail,
} from './types';

export type BillingDeliveryErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'invalid_request'
  | 'recipient_not_allowed'
  | 'boleto_required'
  | 'boleto_pending'
  | 'intent_conflict'
  | 'content_changed'
  | 'provider_failure';

const ERROR_MESSAGES: Record<BillingDeliveryErrorCode, string> = {
  forbidden: 'Usuário sem permissão para enviar cobranças',
  not_found: 'Cobrança não encontrada',
  invalid_request: 'Solicitação de envio inválida',
  recipient_not_allowed: 'Um ou mais destinatários não são permitidos neste ambiente',
  boleto_required: 'Anexe o boleto antes de enviar a cobrança.',
  boleto_pending: 'O boleto possui uma alteração pendente. Conclua o reparo antes de enviar.',
  intent_conflict: 'A intenção de envio já existe com dados diferentes',
  content_changed: 'O conteúdo da cobrança mudou durante a preparação. Revise e tente novamente.',
  provider_failure: 'O provedor de e-mail não confirmou o envio',
};

export class BillingDeliveryError extends Error {
  constructor(readonly code: BillingDeliveryErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BillingDeliveryError';
  }
}

export interface AuthorizedBillingDeliveryContext {
  membership: OrganizationMember;
  billing: BillingCycle;
  contract: Contract;
  customer: Customer;
  site: CustomerSite | null;
  contacts: CustomerContact[];
  billingLines: BillingLine[];
  payments: Payment[];
  boleto: ContractDocument;
}

export interface BillingDeliveryDependencies {
  loadContext(billingId: string): Promise<AuthorizedBillingDeliveryContext>;
  findEvent(sendRequestId: string): Promise<BillingDeliveryEvent | null>;
  downloadBoleto(document: ContractDocument): Promise<ArrayBuffer>;
  renderSnapshot(context: AuthorizedBillingDeliveryContext): Promise<RentalInvoiceSnapshot>;
  sendProviderEmail(payload: PreparedProviderEmail, idempotencyKey: string): Promise<{ id: string }>;
  finalize(input: BillingDeliveryFinalizationInput): Promise<BillingSendResult>;
  now?: () => Date;
}

export type { BillingSendPreparation } from './types';

function assertAuthorizedContext(
  context: AuthorizedBillingDeliveryContext,
  billingId: string
): void {
  const { membership, billing, contract, customer, boleto } = context;
  if (!membership || (membership.role !== 'admin' && !membership.can_manage_billing)) {
    throw new BillingDeliveryError('forbidden');
  }
  if (
    billing.id !== billingId ||
    membership.organization_id !== billing.organization_id ||
    contract.id !== billing.contract_id ||
    contract.organization_id !== billing.organization_id ||
    customer.id !== contract.customer_id ||
    customer.organization_id !== billing.organization_id
  ) {
    throw new BillingDeliveryError('not_found');
  }
  if (
    !boleto ||
    boleto.kind !== 'boleto' ||
    boleto.organization_id !== billing.organization_id ||
    boleto.contract_id !== contract.id ||
    boleto.billing_cycle_id !== billing.id ||
    boleto.content_type !== 'application/pdf'
  ) {
    throw new BillingDeliveryError('boleto_required');
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertCompatibleEvent(
  event: BillingDeliveryEvent,
  context: AuthorizedBillingDeliveryContext,
  request: BillingSendRequest
): void {
  if (
    event.organization_id !== context.billing.organization_id ||
    event.billing_cycle_id !== context.billing.id ||
    !arraysEqual(event.recipients, request.recipients) ||
    event.additional_message !== request.additional_message
  ) {
    throw new BillingDeliveryError('intent_conflict');
  }
}

async function finalizeSafely(
  deps: BillingDeliveryDependencies,
  input: BillingDeliveryFinalizationInput
): Promise<BillingSendResult> {
  try {
    return await deps.finalize(input);
  } catch {
    return {
      status: 'manual_reconciliation_required',
      send_request_id: input.sendRequestId,
      review_required: true,
    };
  }
}

export async function sendBillingDelivery(
  deps: BillingDeliveryDependencies,
  billingId: string,
  requestValue: BillingSendRequest
): Promise<BillingSendResult> {
  let request: BillingSendRequest;
  try {
    request = parseBillingSendRequest(requestValue);
  } catch {
    throw new BillingDeliveryError('invalid_request');
  }

  const config = loadBillingEmailConfig(process.env);
  if (request.recipients.some((email) => !isRecipientAllowed(config, email))) {
    throw new BillingDeliveryError('recipient_not_allowed');
  }

  const initial = await deps.loadContext(billingId);
  assertAuthorizedContext(initial, billingId);

  const existingEvent = await deps.findEvent(request.send_request_id);
  if (existingEvent) {
    assertCompatibleEvent(existingEvent, initial, request);
    return finalizeSafely(deps, {
      organizationId: initial.billing.organization_id,
      billingCycleId: initial.billing.id,
      sentAt: existingEvent.sent_at,
      recipients: request.recipients,
      providerMessageId: existingEvent.provider_message_id,
      sendRequestId: request.send_request_id,
      additionalMessage: request.additional_message,
      expectedContentRevision: initial.billing.content_revision,
    });
  }

  if (initial.billing.boleto_change_pending) {
    throw new BillingDeliveryError('boleto_pending');
  }

  const expectedContentRevision = initial.billing.content_revision;
  const initialSnapshot = await deps.renderSnapshot(initial);
  const initialBoletoBytes = await deps.downloadBoleto(initial.boleto);
  const prepared = await prepareBillingAttachments({
    snapshot: initialSnapshot,
    boletoBytes: initialBoletoBytes,
    billingCycleId: billingId,
  });

  const revalidated = await deps.loadContext(billingId);
  assertAuthorizedContext(revalidated, billingId);
  if (
    revalidated.billing.boleto_change_pending ||
    revalidated.billing.content_revision !== expectedContentRevision
  ) {
    throw new BillingDeliveryError('content_changed');
  }

  const revalidatedSnapshot = await deps.renderSnapshot(revalidated);
  const revalidatedInvoiceGuard = computeCanonicalRentalInvoiceGuard(
    buildCanonicalRentalInvoiceContent(revalidatedSnapshot)
  );
  const revalidatedBoletoBytes = await deps.downloadBoleto(revalidated.boleto);
  const revalidatedBoleto = Buffer.from(revalidatedBoletoBytes);
  if (
    revalidatedInvoiceGuard !== prepared.invoiceSemanticGuard ||
    computeBoletoBytesGuard(revalidatedBoleto) !== prepared.boletoBytesGuard
  ) {
    throw new BillingDeliveryError('content_changed');
  }

  const sender = buildBillingSender(initial.contract.contract_company);
  const content = buildBillingEmailContent({
    snapshot: initialSnapshot,
    additionalMessage: request.additional_message,
    company: initial.contract.contract_company,
    contacts: initial.contacts,
    recipients: request.recipients,
  });
  const providerPayload: PreparedProviderEmail = {
    from: sender.from,
    replyTo: sender.replyTo,
    to: request.recipients,
    subject: content.subject,
    html: content.html,
    text: content.text,
    attachments: [
      { filename: prepared.invoiceFileName, content: prepared.invoice.toString('base64') },
      { filename: prepared.boletoFileName, content: revalidatedBoleto.toString('base64') },
    ],
  };

  let providerMessageId: string;
  try {
    const providerResult = await deps.sendProviderEmail(
      providerPayload,
      request.send_request_id
    );
    providerMessageId = providerResult.id?.trim();
    if (!providerMessageId) {
      throw new Error('missing provider id');
    }
  } catch {
    throw new BillingDeliveryError('provider_failure');
  }

  const sentAt = (deps.now ?? (() => new Date()))().toISOString();
  return finalizeSafely(deps, {
    organizationId: initial.billing.organization_id,
    billingCycleId: initial.billing.id,
    sentAt,
    recipients: request.recipients,
    providerMessageId,
    sendRequestId: request.send_request_id,
    additionalMessage: request.additional_message,
    expectedContentRevision,
  });
}

function ensureQueryData<T>(
  data: T | null,
  error: { message: string } | null,
  code: BillingDeliveryErrorCode = 'not_found'
): T {
  if (error || data == null) {
    throw new BillingDeliveryError(code);
  }
  return data;
}

export function createSupabaseBillingDeliveryDependencies(
  client: SupabaseClient,
  userId: string
): BillingDeliveryDependencies {
  const config = loadBillingEmailConfig(process.env);
  const resend = new Resend(config.resendApiKey);

  const findEvent = async (sendRequestId: string): Promise<BillingDeliveryEvent | null> => {
    const { data, error } = await client
      .from('billing_delivery_events')
      .select('*')
      .eq('send_request_id', sendRequestId)
      .maybeSingle();
    if (error) {
      throw new BillingDeliveryError('not_found');
    }
    return data as BillingDeliveryEvent | null;
  };

  const deps: BillingDeliveryDependencies = {
    async loadContext(billingId) {
      const { data: billingData, error: billingError } = await client
        .from('billing_cycles')
        .select('*')
        .eq('id', billingId)
        .single();
      const billing = ensureQueryData(
        billingData as BillingCycle | null,
        billingError,
        'not_found'
      );

      const [{ data: membershipData, error: membershipError }, { data: contractData, error: contractError }] = await Promise.all([
        client.from('organization_members').select('organization_id, user_id, role, can_manage_billing, created_at')
          .eq('organization_id', billing.organization_id).eq('user_id', userId).single(),
        client.from('contracts').select('*').eq('organization_id', billing.organization_id)
          .eq('id', billing.contract_id).single(),
      ]);
      const membership = ensureQueryData(
        membershipData as OrganizationMember | null,
        membershipError,
        'forbidden'
      );
      const contract = ensureQueryData(contractData as Contract | null, contractError);

      const [customerResult, siteResult, contactsResult, linesResult, paymentsResult, boletoResult] = await Promise.all([
        client.from('customers').select('*').eq('organization_id', billing.organization_id)
          .eq('id', contract.customer_id).single(),
        client.from('customer_sites').select('*').eq('organization_id', billing.organization_id)
          .eq('id', contract.site_id).maybeSingle(),
        client.from('customer_contacts').select('*').eq('organization_id', billing.organization_id)
          .eq('customer_id', contract.customer_id).order('name', { ascending: true }),
        client.from('billing_lines').select('*').eq('organization_id', billing.organization_id)
          .eq('billing_cycle_id', billing.id).order('created_at', { ascending: true }).order('id', { ascending: true }),
        client.from('payments').select('*').eq('organization_id', billing.organization_id)
          .eq('billing_cycle_id', billing.id).order('paid_at', { ascending: true }),
        client.from('contract_documents').select('*').eq('organization_id', billing.organization_id)
          .eq('contract_id', contract.id).eq('billing_cycle_id', billing.id).eq('kind', 'boleto').maybeSingle(),
      ]);

      const customer = ensureQueryData(customerResult.data as Customer | null, customerResult.error);
      if (siteResult.error || contactsResult.error || linesResult.error || paymentsResult.error) {
        throw new BillingDeliveryError('not_found');
      }
      const boleto = ensureQueryData(
        boletoResult.data as ContractDocument | null,
        boletoResult.error,
        'boleto_required'
      );

      return {
        membership,
        billing,
        contract,
        customer,
        site: siteResult.data as CustomerSite | null,
        contacts: (contactsResult.data ?? []) as CustomerContact[],
        billingLines: (linesResult.data ?? []) as BillingLine[],
        payments: (paymentsResult.data ?? []) as Payment[],
        boleto,
      };
    },
    findEvent,
    async downloadBoleto(document) {
      const { data, error } = await client.storage
        .from('contratos-locacoes-docs')
        .download(document.storage_path);
      if (error || !data) {
        throw new BillingDeliveryError('boleto_required');
      }
      return data.arrayBuffer();
    },
    async renderSnapshot(current) {
      return buildRentalInvoiceSnapshot({
        billing: current.billing,
        contract: current.contract,
        customer: current.customer,
        site: current.site,
        billingLines: current.billingLines,
        payments: current.payments,
      });
    },
    async sendProviderEmail(payload, idempotencyKey) {
      const { data, error } = await resend.emails.send({
        from: payload.from,
        replyTo: payload.replyTo,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments,
      }, { idempotencyKey });
      if (error || !data?.id) {
        throw new BillingDeliveryError('provider_failure');
      }
      return { id: data.id };
    },
    async finalize(input) {
      const { data, error } = await client.rpc('finalize_billing_delivery', {
        p_organization_id: input.organizationId,
        p_billing_cycle_id: input.billingCycleId,
        p_sent_at: input.sentAt,
        p_recipients: input.recipients,
        p_provider_message_id: input.providerMessageId,
        p_send_request_id: input.sendRequestId,
        p_additional_message: input.additionalMessage,
        p_expected_content_revision: input.expectedContentRevision,
      });
      if (error) {
        throw new Error('billing delivery finalization failed');
      }
      const row = (Array.isArray(data) ? data[0] : data) as {
        effective_sent_at: string;
        needs_resend: boolean;
        inserted_event: boolean;
        review_required: boolean;
      } | null;
      if (!row) {
        throw new Error('billing delivery finalization returned no row');
      }
      const finalizedEvent = await findEvent(input.sendRequestId);
      if (!finalizedEvent) {
        throw new Error('billing delivery event not visible after finalization');
      }
      if (!row.inserted_event) {
        return {
          status: 'reconciled',
          event: finalizedEvent,
          sent_at: row.effective_sent_at,
          needs_resend: row.needs_resend,
          review_required: row.review_required,
        };
      }
      if (row.needs_resend) {
        return {
          status: 'sent_content_changed',
          event: finalizedEvent,
          sent_at: row.effective_sent_at,
          needs_resend: true,
          review_required: true,
        };
      }
      return {
        status: 'sent',
        event: finalizedEvent,
        sent_at: row.effective_sent_at,
        needs_resend: false,
      };
    },
  };

  return deps;
}

export async function prepareBillingDelivery(
  deps: BillingDeliveryDependencies,
  billingId: string
): Promise<BillingSendPreparation> {
  const config = loadBillingEmailConfig(process.env);
  const current = await deps.loadContext(billingId);
  assertAuthorizedContext(current, billingId);
  if (current.billing.boleto_change_pending) {
    throw new BillingDeliveryError('boleto_pending');
  }
  const invoice = await deps.renderSnapshot(current);
  const defaultRecipients = buildDefaultRecipients(current.contacts)
    .filter((email) => isRecipientAllowed(config, email));
  return {
    contacts: current.contacts,
    defaultRecipients,
    allowedRecipients: [...config.allowedRecipients],
    mode: config.mode,
    hasBoleto: true,
    invoiceFileName: invoice.fileName,
    boletoFileName: `boleto-${billingId}.pdf`,
  };
}
