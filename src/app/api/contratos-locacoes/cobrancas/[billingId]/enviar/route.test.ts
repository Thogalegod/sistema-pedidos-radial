import { describe, expect, it, vi } from 'vitest';
import { BillingAuthError } from '@/lib/supabase-server';
import { BillingDeliveryError } from '@/lib/contratos-locacoes/billing-delivery';
import type { BillingSendResult } from '@/lib/contratos-locacoes/types';
import { createBillingSendRouteHandlers, type BillingSendRouteDependencies } from './route';

const params = { params: Promise.resolve({ billingId: 'billing-1' }) } as never;
const sentResult: BillingSendResult = {
  status: 'sent',
  event: {
    id: 'event-1', organization_id: 'org-1', billing_cycle_id: 'billing-1', sent_at: '2026-08-27T12:00:00Z',
    recipients: ['radial@radialenergia.com.br'], provider_message_id: 'provider-1', send_request_id: '550e8400-e29b-41d4-a716-446655440000',
    additional_message: null, created_by: 'user-1', created_at: '2026-08-27T12:00:01Z',
  },
  sent_at: '2026-08-27T12:00:00Z',
  needs_resend: false,
};

function request(method: 'GET' | 'POST', body?: unknown, token = 'fake.jwt.token') {
  return new Request('http://localhost/api/contratos-locacoes/cobrancas/billing-1/enviar', {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function dependencies(overrides: Partial<BillingSendRouteDependencies> = {}): BillingSendRouteDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue({ client: {}, userId: 'user-1' }),
    prepare: vi.fn().mockResolvedValue({
      contacts: [], defaultRecipients: [], allowedRecipients: ['radial@radialenergia.com.br'],
      mode: 'restricted', hasBoleto: true, invoiceFileName: 'fatura-R1.pdf', boletoFileName: 'boleto-billing-1.pdf',
    }),
    send: vi.fn().mockResolvedValue(sentResult),
    ...overrides,
  };
}

const validBody = {
  send_request_id: '550e8400-e29b-41d4-a716-446655440000',
  recipients: ['radial@radialenergia.com.br'],
  additional_message: null,
};

describe('billing send route', () => {
  it.each(['GET', 'POST'] as const)('returns 401 and no-store for missing bearer on %s', async (method) => {
    const handlers = createBillingSendRouteHandlers(dependencies());
    const response = await handlers[method](request(method, method === 'POST' ? validBody : undefined, ''), params);
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Autenticação necessária', code: 'unauthorized' });
  });

  it('returns 401 when remote token validation fails without exposing its token', async () => {
    const handlers = createBillingSendRouteHandlers(dependencies({
      authenticate: vi.fn().mockRejectedValue(new BillingAuthError()),
    }));
    const response = await handlers.GET(request('GET', undefined, 'secret.jwt.token'), params);
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('secret.jwt.token');
  });

  it.each([
    ['forbidden', 403],
    ['not_found', 404],
    ['intent_conflict', 409],
    ['content_changed', 409],
    ['boleto_pending', 409],
    ['invalid_request', 422],
    ['recipient_not_allowed', 422],
    ['boleto_required', 422],
    ['provider_failure', 502],
  ] as const)('maps %s to a sanitized %s response', async (code, status) => {
    const handlers = createBillingSendRouteHandlers(dependencies({
      send: vi.fn().mockRejectedValue(new BillingDeliveryError(code)),
    }));
    const response = await handlers.POST(request('POST', validBody), params);
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ code });
  });

  it('returns 422 for malformed JSON without calling send', async () => {
    const deps = dependencies();
    const handlers = createBillingSendRouteHandlers(deps);
    const malformed = new Request('http://localhost/api/x', {
      method: 'POST', headers: { Authorization: 'Bearer fake.jwt.token' }, body: '{',
    });
    const response = await handlers.POST(malformed, params);
    expect(response.status).toBe(422);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('prepares authorized current contacts without returning secrets', async () => {
    const deps = dependencies();
    const handlers = createBillingSendRouteHandlers(deps);
    const response = await handlers.GET(request('GET'), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({ mode: 'restricted', hasBoleto: true });
    expect(JSON.stringify(body)).not.toMatch(/api.?key|token|secret|provider/i);
    expect(deps.prepare).toHaveBeenCalledWith({}, 'user-1', 'billing-1');
  });

  it('returns 200 for success/reconciliation and 503 for indeterminate finalization', async () => {
    const success = createBillingSendRouteHandlers(dependencies());
    const successResponse = await success.POST(request('POST', validBody), params);
    expect(successResponse.status).toBe(200);
    expect(await successResponse.json()).toMatchObject({ status: 'sent' });

    const manualResult: BillingSendResult = {
      status: 'manual_reconciliation_required',
      send_request_id: validBody.send_request_id,
      review_required: true,
    };
    const indeterminate = createBillingSendRouteHandlers(dependencies({ send: vi.fn().mockResolvedValue(manualResult) }));
    const indeterminateResponse = await indeterminate.POST(request('POST', validBody), params);
    expect(indeterminateResponse.status).toBe(503);
    expect(await indeterminateResponse.json()).toEqual(manualResult);
  });
});
