import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseBillingDeliveryDependencies,
  BillingDeliveryError,
  prepareBillingDelivery,
  sendBillingDelivery,
  type BillingSendPreparation,
} from '@/lib/contratos-locacoes/billing-delivery';
import type { BillingSendRequest, BillingSendResult } from '@/lib/contratos-locacoes/types';
import {
  authenticateBearerUser,
  BillingAuthError,
  readBearerToken,
} from '@/lib/supabase-server';

export const runtime = 'nodejs';

type BillingRouteContext = { params: Promise<{ billingId: string }> };

export interface BillingSendRouteDependencies {
  authenticate(accessToken: string): Promise<{ client: unknown; userId: string }>;
  prepare(client: unknown, userId: string, billingId: string): Promise<BillingSendPreparation>;
  send(
    client: unknown,
    userId: string,
    billingId: string,
    request: BillingSendRequest
  ): Promise<BillingSendResult>;
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE_HEADERS });
}

const STATUS_BY_DELIVERY_ERROR: Record<BillingDeliveryError['code'], number> = {
  forbidden: 403,
  not_found: 404,
  invalid_request: 422,
  recipient_not_allowed: 422,
  boleto_required: 422,
  boleto_pending: 409,
  intent_conflict: 409,
  content_changed: 409,
  provider_failure: 502,
};

function errorResponse(error: unknown): Response {
  if (error instanceof BillingAuthError) {
    return json({ error: error.message, code: error.code }, 401);
  }
  if (error instanceof BillingDeliveryError) {
    return json({ error: error.message, code: error.code }, STATUS_BY_DELIVERY_ERROR[error.code]);
  }
  return json(
    { error: 'Serviço de envio de cobrança indisponível', code: 'service_unavailable' },
    503
  );
}

async function authenticateRequest(
  request: Request,
  deps: BillingSendRouteDependencies
): Promise<{ client: unknown; userId: string }> {
  const token = readBearerToken(request.headers.get('authorization'));
  return deps.authenticate(token);
}

export function createBillingSendRouteHandlers(deps: BillingSendRouteDependencies) {
  return {
    async GET(request: Request, context: BillingRouteContext): Promise<Response> {
      try {
        const auth = await authenticateRequest(request, deps);
        const { billingId } = await context.params;
        return json(await deps.prepare(auth.client, auth.userId, billingId));
      } catch (error) {
        return errorResponse(error);
      }
    },

    async POST(request: Request, context: BillingRouteContext): Promise<Response> {
      try {
        const auth = await authenticateRequest(request, deps);
        const { billingId } = await context.params;
        let payload: BillingSendRequest;
        try {
          payload = await request.json() as BillingSendRequest;
        } catch {
          throw new BillingDeliveryError('invalid_request');
        }
        const result = await deps.send(auth.client, auth.userId, billingId, payload);
        return json(result, result.status === 'manual_reconciliation_required' ? 503 : 200);
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

const defaultHandlers = createBillingSendRouteHandlers({
  authenticate: authenticateBearerUser,
  async prepare(client, userId, billingId) {
    return prepareBillingDelivery(
      createSupabaseBillingDeliveryDependencies(client as SupabaseClient, userId),
      billingId
    );
  },
  async send(client, userId, billingId, request) {
    return sendBillingDelivery(
      createSupabaseBillingDeliveryDependencies(client as SupabaseClient, userId),
      billingId,
      request
    );
  },
});

export async function GET(
  request: Request,
  context: RouteContext<'/api/contratos-locacoes/cobrancas/[billingId]/enviar'>
): Promise<Response> {
  return defaultHandlers.GET(request, context);
}

export async function POST(
  request: Request,
  context: RouteContext<'/api/contratos-locacoes/cobrancas/[billingId]/enviar'>
): Promise<Response> {
  return defaultHandlers.POST(request, context);
}
