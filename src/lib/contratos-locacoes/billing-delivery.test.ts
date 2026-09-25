import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBillingCompanyProfile } from './company';
import type { RentalInvoiceSnapshot } from './rental-invoice';
import type {
  BillingCycle,
  BillingDeliveryEvent,
  BillingLine,
  BillingSendRequest,
  Contract,
  ContractDocument,
  Customer,
  CustomerContact,
  CustomerSite,
  OrganizationMember,
  Payment,
} from './types';

const { renderToBuffer } = vi.hoisted(() => ({ renderToBuffer: vi.fn() }));
vi.mock('@react-pdf/renderer', async () => {
  const actual = await vi.importActual<typeof import('@react-pdf/renderer')>('@react-pdf/renderer');
  return { ...actual, renderToBuffer };
});

import {
  BillingDeliveryError,
  sendBillingDelivery,
  type AuthorizedBillingDeliveryContext,
  type BillingDeliveryDependencies,
} from './billing-delivery';

const REQUEST: BillingSendRequest = {
  send_request_id: '550e8400-e29b-41d4-a716-446655440000',
  recipients: ['radial@radialenergia.com.br'],
  additional_message: 'Mensagem',
};
const INVOICE_BUFFER = Buffer.from('invoice-buffer');

function line(id: string, description: string): BillingLine {
  return {
    id, organization_id: 'org-1', billing_cycle_id: 'billing-1', rental_item_id: null,
    description, quantity: 1, unit_amount: '1000', total_amount: '1000', kind: 'recurring',
    created_at: '2026-08-27T10:00:00Z', updated_at: '2026-08-27T10:00:00Z',
  };
}

function context(overrides: Partial<AuthorizedBillingDeliveryContext> = {}): AuthorizedBillingDeliveryContext {
  return {
    membership: { organization_id: 'org-1', user_id: 'user-1', role: 'admin', can_manage_billing: false, created_at: '2026-08-01T00:00:00Z' } as OrganizationMember,
    billing: {
      id: 'billing-1', organization_id: 'org-1', contract_id: 'contract-1', content_revision: '7', boleto_change_pending: false,
      sent_at: null, needs_resend: false,
    } as BillingCycle,
    contract: { id: 'contract-1', organization_id: 'org-1', customer_id: 'customer-1', site_id: 'site-1', contract_company: 'fontes' } as Contract,
    customer: { id: 'customer-1', organization_id: 'org-1', legal_name: 'Cliente Exemplo' } as Customer,
    site: { id: 'site-1', organization_id: 'org-1', customer_id: 'customer-1', name: 'Obra' } as CustomerSite,
    contacts: [] as CustomerContact[],
    billingLines: [line('line-a', 'Linha A'), line('line-b', 'Linha B')],
    payments: [] as Payment[],
    boleto: {
      id: 'boleto-1', organization_id: 'org-1', contract_id: 'contract-1', billing_cycle_id: 'billing-1',
      kind: 'boleto', storage_path: 'org-1/contract-1/boleto/billing-1.pdf', content_type: 'application/pdf',
    } as ContractDocument,
    ...overrides,
  };
}

function snapshot(lines = ['Linha A', 'Linha B']): RentalInvoiceSnapshot {
  return {
    invoiceNumber: 'R000008001', fileName: 'fatura-R000008001.pdf', issuedAtLabel: '01/08/2026', dueAtLabel: '31/08/2026',
    period: { start: '2026-08-01', end: '2026-08-31', label: '01/08/2026 a 31/08/2026', sequenceNumber: 1 },
    company: getBillingCompanyProfile('fontes'),
    contract: { id: 'contract-1', internalNumber: '8', legacyOrderNumber: null, kind: 'rental', notes: null },
    customer: { name: 'Cliente Exemplo', tradeName: 'Cliente', taxId: null, stateRegistration: null },
    site: { name: 'Obra', addressLabel: 'Rua Um' }, remittanceInvoice: null,
    lines: lines.map((description, index) => ({ id: `line-${index}`, description, quantity: 1, kind: 'recurring' as const, unitAmountLabel: 'R$ 10,00', totalAmountLabel: 'R$ 10,00' })),
    totals: {
      baseAmount: '2000', discountAmount: '0', surchargeAmount: '0', exemptionAmount: '0', totalAmount: '2000',
      baseAmountLabel: 'R$ 20,00', discountAmountLabel: 'R$ 0,00', surchargeAmountLabel: 'R$ 0,00', exemptionAmountLabel: 'R$ 0,00',
      totalAmountLabel: 'R$ 20,00', totalAmountInWords: 'vinte reais',
    },
    financialStatus: { paidAmount: '0', balanceAmount: '2000', paidAmountLabel: 'R$ 0,00', balanceAmountLabel: 'R$ 20,00' }, notes: null,
  };
}

function event(overrides: Partial<BillingDeliveryEvent> = {}): BillingDeliveryEvent {
  return {
    id: 'event-1', organization_id: 'org-1', billing_cycle_id: 'billing-1', sent_at: '2026-08-27T12:00:00Z',
    recipients: ['radial@radialenergia.com.br'], provider_message_id: 'provider-1', send_request_id: REQUEST.send_request_id,
    additional_message: 'Mensagem', created_by: 'user-1', created_at: '2026-08-27T12:00:01Z', ...overrides,
  };
}

function dependencies(overrides: Partial<BillingDeliveryDependencies> = {}): BillingDeliveryDependencies {
  const first = context();
  const second = context();
  const sentEvent = event();
  return {
    loadContext: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    findEvent: vi.fn().mockResolvedValue(null),
    downloadBoleto: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    renderSnapshot: vi.fn().mockResolvedValue(snapshot()),
    sendProviderEmail: vi.fn().mockResolvedValue({ id: 'provider-1' }),
    finalize: vi.fn().mockResolvedValue({ status: 'sent', event: sentEvent, sent_at: sentEvent.sent_at, needs_resend: false }),
    now: () => new Date('2026-08-27T12:00:00Z'),
    ...overrides,
  };
}

describe('billing delivery orchestration A-H and K-N', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderToBuffer.mockResolvedValue(INVOICE_BUFFER);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://iurqgskfuupslrghgtej.supabase.co';
    process.env.RESEND_API_KEY = 're_test_only';
    process.env.BILLING_EMAIL_MODE = 'restricted';
    process.env.BILLING_EMAIL_ALLOWED_RECIPIENTS = 'thomas@radialenergia.com.br,radial@radialenergia.com.br';
  });

  it('A blocks unauthorized users before rendering, provider or finalization', async () => {
    const memberContext = context({ membership: { ...context().membership, role: 'member', can_manage_billing: false } });
    const deps = dependencies({ loadContext: vi.fn().mockResolvedValue(memberContext) });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).rejects.toMatchObject({ code: 'forbidden' });
    expect(renderToBuffer).not.toHaveBeenCalled();
    expect(deps.sendProviderEmail).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it('H blocks a new send while boleto change is pending', async () => {
    const pending = context({ billing: { ...context().billing, boleto_change_pending: true } });
    const deps = dependencies({ loadContext: vi.fn().mockResolvedValue(pending) });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).rejects.toMatchObject({ code: 'boleto_pending' });
    expect(deps.sendProviderEmail).not.toHaveBeenCalled();
  });

  it('A-F render once, revalidate in total order and send the second boleto bytes', async () => {
    const first = context();
    const second = context();
    const snapshots = [snapshot(), snapshot()];
    const boleto1 = Uint8Array.from([1, 2, 3]).buffer;
    const boleto2 = Uint8Array.from([1, 2, 3]).buffer;
    const deps = dependencies({
      loadContext: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
      renderSnapshot: vi.fn().mockResolvedValueOnce(snapshots[0]).mockResolvedValueOnce(snapshots[1]),
      downloadBoleto: vi.fn().mockResolvedValueOnce(boleto1).mockResolvedValueOnce(boleto2),
    });

    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).resolves.toMatchObject({ status: 'sent' });
    expect(deps.loadContext).toHaveBeenCalledTimes(2);
    expect(deps.renderSnapshot).toHaveBeenNthCalledWith(1, first);
    expect(deps.renderSnapshot).toHaveBeenNthCalledWith(2, second);
    expect(first.billingLines.map((entry) => entry.id)).toEqual(['line-a', 'line-b']);
    expect(second.billingLines.map((entry) => entry.id)).toEqual(['line-a', 'line-b']);
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    expect(deps.downloadBoleto).toHaveBeenCalledTimes(2);
    expect(deps.sendProviderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['radial@radialenergia.com.br'],
        attachments: [
          { filename: 'fatura-R000008001.pdf', content: INVOICE_BUFFER.toString('base64') },
          { filename: 'boleto-billing-1.pdf', content: Buffer.from(boleto2).toString('base64') },
        ],
      }),
      REQUEST.send_request_id
    );
    expect(deps.finalize).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', billingCycleId: 'billing-1', providerMessageId: 'provider-1', expectedContentRevision: '7',
    }));
    expect((deps.sendProviderEmail as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((deps.finalize as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it.each([
    ['G revision', context({ billing: { ...context().billing, content_revision: '8' } }), snapshot(), Uint8Array.from([1, 2, 3]).buffer, 'content_changed'],
    ['G semantic content', context(), snapshot(['Linha alterada', 'Linha B']), Uint8Array.from([1, 2, 3]).buffer, 'content_changed'],
    ['H boleto bytes', context(), snapshot(), Uint8Array.from([1, 2, 4]).buffer, 'content_changed'],
  ] as const)('aborts before provider on %s divergence', async (_label, second, secondSnapshot, secondBoleto, code) => {
    const deps = dependencies({
      loadContext: vi.fn().mockResolvedValueOnce(context()).mockResolvedValueOnce(second),
      renderSnapshot: vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(secondSnapshot),
      downloadBoleto: vi.fn().mockResolvedValueOnce(Uint8Array.from([1, 2, 3]).buffer).mockResolvedValueOnce(secondBoleto),
    });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).rejects.toMatchObject({ code });
    expect(deps.sendProviderEmail).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
    expect(renderToBuffer).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['provider error', vi.fn().mockRejectedValue(new Error('timeout'))],
    ['missing provider id', vi.fn().mockResolvedValue({ id: '' })],
  ])('B does not finalize after %s', async (_label, sendProviderEmail) => {
    const deps = dependencies({ sendProviderEmail });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).rejects.toMatchObject({ code: 'provider_failure' });
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it('C returns an indeterminate result when provider succeeded but finalization failed', async () => {
    const deps = dependencies({ finalize: vi.fn().mockRejectedValue(new Error('database unavailable')) });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).resolves.toEqual({
      status: 'manual_reconciliation_required', send_request_id: REQUEST.send_request_id, review_required: true,
    });
    expect(deps.sendProviderEmail).toHaveBeenCalledTimes(1);
  });

  it('D/K-M reconciles an existing compatible event before pending checks and never calls provider', async () => {
    const changed = context({ billing: { ...context().billing, boleto_change_pending: true, needs_resend: true, content_revision: '9' } });
    const existing = event();
    const reconciled = { status: 'reconciled' as const, event: existing, sent_at: existing.sent_at, needs_resend: true, review_required: true };
    const deps = dependencies({
      loadContext: vi.fn().mockResolvedValue(changed),
      findEvent: vi.fn().mockResolvedValue(existing),
      finalize: vi.fn().mockResolvedValue(reconciled),
    });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).resolves.toEqual(reconciled);
    expect(deps.sendProviderEmail).not.toHaveBeenCalled();
    expect(renderToBuffer).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledWith(expect.objectContaining({
      providerMessageId: 'provider-1', expectedContentRevision: '9',
    }));
  });

  it('E rejects a replay whose normalized intent differs', async () => {
    const deps = dependencies({ findEvent: vi.fn().mockResolvedValue(event({ recipients: ['thomas@radialenergia.com.br'] })) });
    await expect(sendBillingDelivery(deps, 'billing-1', REQUEST)).rejects.toMatchObject({ code: 'intent_conflict' });
    expect(deps.sendProviderEmail).not.toHaveBeenCalled();
    expect(deps.finalize).not.toHaveBeenCalled();
  });

  it('N treats a new request id as a deliberate new send', async () => {
    const nextRequest = { ...REQUEST, send_request_id: '650e8400-e29b-41d4-a716-446655440000' };
    const deps = dependencies();
    await sendBillingDelivery(deps, 'billing-1', nextRequest);
    expect(deps.findEvent).toHaveBeenCalledWith(nextRequest.send_request_id);
    expect(deps.sendProviderEmail).toHaveBeenCalledWith(expect.anything(), nextRequest.send_request_id);
  });

  it('passes the selected billing contact to the provider content greeting', async () => {
    const namedContact = {
      id: 'contact-1', organization_id: 'org-1', customer_id: 'customer-1', site_id: null,
      name: 'João da Silva', email: 'radial@radialenergia.com.br', receives_billing: true,
    } as CustomerContact;
    const current = context({ contacts: [namedContact] });
    const deps = dependencies({ loadContext: vi.fn().mockResolvedValue(current) });

    await sendBillingDelivery(deps, 'billing-1', REQUEST);

    expect(vi.mocked(deps.sendProviderEmail).mock.calls[0][0].text).toMatch(/^Olá, João,/);
  });
});

describe('BillingDeliveryError', () => {
  it('does not include sensitive causes in its public message', () => {
    expect(new BillingDeliveryError('provider_failure').message).not.toContain('secret');
  });
});
