import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class BillingAuthError extends Error {
  readonly code = 'unauthorized' as const;

  constructor() {
    super('Autenticação necessária');
    this.name = 'BillingAuthError';
  }
}

function requirePublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new BillingAuthError();
  }
  return { url, key };
}

export function readBearerToken(header: string | null): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? '');
  if (!match) {
    throw new BillingAuthError();
  }
  return match[1];
}

export function createBearerSupabaseClient(accessToken: string): SupabaseClient {
  const { url, key } = requirePublicSupabaseConfig();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export async function authenticateBearerUser(
  accessToken: string
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createBearerSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new BillingAuthError();
  }
  return { client, userId: data.user.id };
}
