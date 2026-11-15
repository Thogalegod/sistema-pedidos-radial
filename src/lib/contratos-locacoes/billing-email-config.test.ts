import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isRecipientAllowed, loadBillingEmailConfig } from './billing-email-config';

const IURQ_URL = 'https://iurqgskfuupslrghgtej.supabase.co';
const MISFY_URL = 'https://misfyiznwnuvldoccciw.supabase.co';

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: IURQ_URL,
    RESEND_API_KEY: 're_test_only_not_a_secret',
    BILLING_EMAIL_MODE: 'restricted',
    BILLING_EMAIL_ALLOWED_RECIPIENTS:
      'thomas@radialenergia.com.br,radial@radialenergia.com.br',
    ...overrides,
  };
}

describe('billing email server configuration', () => {
  it.each([
    ['API key', { RESEND_API_KEY: '' }],
    ['mode', { BILLING_EMAIL_MODE: '' }],
    ['allowlist', { BILLING_EMAIL_ALLOWED_RECIPIENTS: '' }],
    ['Supabase URL', { NEXT_PUBLIC_SUPABASE_URL: '' }],
  ])('fails closed when %s is missing', (_label, override) => {
    expect(() => loadBillingEmailConfig(validEnv(override))).toThrow();
  });

  it('rejects unknown mode, invalid recipients and unknown project refs', () => {
    expect(() => loadBillingEmailConfig(validEnv({ BILLING_EMAIL_MODE: 'preview' }))).toThrow(
      /modo/i
    );
    expect(() =>
      loadBillingEmailConfig(validEnv({ BILLING_EMAIL_ALLOWED_RECIPIENTS: 'not-an-email' }))
    ).toThrow(/allowlist/i);
    expect(() =>
      loadBillingEmailConfig(
        validEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://unknown-project.supabase.co' })
      )
    ).toThrow(/projeto/i);
  });

  it('rejects production mode in IURQ and every configuration in protected MISFY', () => {
    expect(() => loadBillingEmailConfig(validEnv({ BILLING_EMAIL_MODE: 'production' }))).toThrow(
      /IURQ/i
    );
    expect(() => loadBillingEmailConfig(validEnv({ NEXT_PUBLIC_SUPABASE_URL: MISFY_URL }))).toThrow(
      /MISFY/i
    );
  });

  it('accepts only the approved IURQ recipients and normalizes duplicates', () => {
    const config = loadBillingEmailConfig(
      validEnv({
        BILLING_EMAIL_ALLOWED_RECIPIENTS:
          ' THOMAS@radialenergia.com.br, radial@radialenergia.com.br,thomas@radialenergia.com.br ',
      })
    );

    expect(config.mode).toBe('restricted');
    expect(config.supabaseProjectRef).toBe('iurqgskfuupslrghgtej');
    expect([...config.allowedRecipients]).toEqual([
      'thomas@radialenergia.com.br',
      'radial@radialenergia.com.br',
    ]);
    expect(config.resendApiKey).toBe('re_test_only_not_a_secret');
    expect(isRecipientAllowed(config, ' THOMAS@RADIALENERGIA.COM.BR ')).toBe(true);
    expect(isRecipientAllowed(config, 'financeiro@example.com')).toBe(false);
  });

  it('rejects an IURQ allowlist containing any non-approved recipient', () => {
    expect(() =>
      loadBillingEmailConfig(
        validEnv({
          BILLING_EMAIL_ALLOWED_RECIPIENTS:
            'thomas@radialenergia.com.br,outsider@example.com',
        })
      )
    ).toThrow(/allowlist/i);
  });
});
