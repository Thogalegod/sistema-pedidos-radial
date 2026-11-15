import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import {
  BillingAuthError,
  authenticateBearerUser,
  createBearerSupabaseClient,
  readBearerToken,
} from './supabase-server';

describe('Supabase bearer server client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://iurqgskfuupslrghgtej.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'must-never-be-used';
  });

  it.each([null, '', 'Basic abc', 'Bearer', 'Bearer   ', 'Bearer token with-spaces'])(
    'rejects a missing or malformed authorization header: %s',
    (header) => {
      expect(() => readBearerToken(header)).toThrow(BillingAuthError);
    }
  );

  it('reads a bearer token without leaking it in errors', () => {
    expect(readBearerToken('Bearer fake.jwt.token')).toBe('fake.jwt.token');
    try {
      readBearerToken('Token super-secret-value');
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });

  it('creates a stateless client with the public key and caller authorization', () => {
    const client = { auth: { getUser: vi.fn() } };
    createClient.mockReturnValue(client);

    expect(createBearerSupabaseClient('fake.jwt.token')).toBe(client);
    expect(createClient).toHaveBeenCalledWith(
      'https://iurqgskfuupslrghgtej.supabase.co',
      'public-anon-test-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { headers: { Authorization: 'Bearer fake.jwt.token' } },
      }
    );
    expect(createClient).not.toHaveBeenCalledWith(
      expect.anything(),
      'must-never-be-used',
      expect.anything()
    );
  });

  it('validates the supplied token remotely and returns its user id', async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const client = { auth: { getUser } };
    createClient.mockReturnValue(client);

    await expect(authenticateBearerUser('fake.jwt.token')).resolves.toEqual({
      client,
      userId: 'user-1',
    });
    expect(getUser).toHaveBeenCalledWith('fake.jwt.token');
  });

  it('fails closed when remote validation rejects the token', async () => {
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'invalid JWT fake.jwt.token' },
        }),
      },
    });

    await expect(authenticateBearerUser('fake.jwt.token')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(authenticateBearerUser('fake.jwt.token')).rejects.not.toThrow(/fake\.jwt\.token/);
  });
});
