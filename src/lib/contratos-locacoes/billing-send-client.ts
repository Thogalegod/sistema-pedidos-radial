import { normalizeBillingRecipients } from './billing-email';
import type {
  BillingSendPreparation,
  BillingSendRequest,
  BillingSendResult,
} from './types';

export interface BillingSendClient {
  prepare(billingId: string): Promise<BillingSendPreparation>;
  send(billingId: string, request: BillingSendRequest): Promise<BillingSendResult>;
}

interface BillingSendClientOptions {
  getAccessToken: () => Promise<string | null>;
  fetchImpl: typeof fetch;
}

async function getCurrentAccessToken(): Promise<string | null> {
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'Não foi possível processar o envio da cobrança';
    throw new Error(message);
  }
  return body as T;
}

export function createBillingSendClient(options: Partial<BillingSendClientOptions> = {}): BillingSendClient {
  const getAccessToken = options.getAccessToken ?? getCurrentAccessToken;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(billingId: string, init: RequestInit): Promise<T> {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Sessão expirada. Entre novamente para enviar a cobrança.');
    }
    const response = await fetchImpl(
      `/api/contratos-locacoes/cobrancas/${encodeURIComponent(billingId)}/enviar`,
      {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      }
    );
    return readResponse<T>(response);
  }

  return {
    prepare(billingId) {
      return request<BillingSendPreparation>(billingId, { method: 'GET' });
    },
    send(billingId, payload) {
      return request<BillingSendResult>(billingId, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  };
}

export function createBillingSendIntent(
  input: { recipients: string[]; additionalMessage: string | null },
  randomUUID: () => string = () => crypto.randomUUID()
): BillingSendRequest {
  return {
    send_request_id: randomUUID(),
    recipients: normalizeBillingRecipients(input.recipients),
    additional_message: input.additionalMessage?.trim() || null,
  };
}

export const billingSendClient = createBillingSendClient();
