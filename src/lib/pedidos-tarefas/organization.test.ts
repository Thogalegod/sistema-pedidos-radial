import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentOrganizationId } from './organization';

function createClient(result: {
  data: { organization_id: string } | null;
  error: { message: string } | null;
}) {
  const single = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    limit,
    single,
  };
}

describe('getCurrentOrganizationId', () => {
  it('returns the first organization visible through the authenticated membership policy', async () => {
    const fixture = createClient({
      data: { organization_id: '0f4239ca-2266-4b2f-a0a3-767791053c46' },
      error: null,
    });

    await expect(getCurrentOrganizationId(fixture.client)).resolves.toBe(
      '0f4239ca-2266-4b2f-a0a3-767791053c46'
    );
    expect(fixture.from).toHaveBeenCalledWith('organization_members');
    expect(fixture.select).toHaveBeenCalledWith('organization_id');
    expect(fixture.limit).toHaveBeenCalledWith(1);
    expect(fixture.single).toHaveBeenCalledOnce();
  });

  it('throws a clear error when the user has no visible membership', async () => {
    const fixture = createClient({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned' },
    });

    await expect(getCurrentOrganizationId(fixture.client)).rejects.toThrow(
      'Não foi possível identificar a organização atual'
    );
  });
});
