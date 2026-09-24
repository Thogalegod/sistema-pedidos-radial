import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { listMembers, readCapabilities, resolveNamedMember } from './members';

let clientNumber = 0;
function clientWith(response: unknown, status = 200) {
  const requests: { path: string; body: unknown }[] = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `directory-test-${++clientNumber}` },
    global: { fetch: async (url, init) => {
      requests.push({ path: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  return { client, requests };
}

describe('organization member directory', () => {
  it('resolves a unique name, never an absent or ambiguous name', () => {
    const members = [{ userId: 'a', displayName: 'Thomás' }, { userId: 'b', displayName: 'Thomás' }];
    expect(resolveNamedMember(members, 'Thomás')).toBeNull();
    expect(resolveNamedMember([members[0]], '  THOMÁS ')).toBe('a');
    expect(resolveNamedMember([{ userId: 'a', displayName: null }], 'Thomás')).toBeNull();
    expect(resolveNamedMember([{ userId: 'a', displayName: ' ' }], '')).toBeNull();
  });
  it('uses the scoped directory RPC and preserves unnamed members', async () => {
    const { client, requests } = clientWith([{ user_id: 'a', display_name: null }]);
    expect(await listMembers(client, 'org-a')).toEqual([{ userId: 'a', displayName: null }]);
    expect(requests).toEqual([{ path: 'https://example.test/rest/v1/rpc/list_pedido_members', body: { p_org: 'org-a' } }]);
  });
  it('surfaces errors and malformed data instead of returning an empty directory', async () => {
    await expect(listMembers(clientWith({ message: 'denied' }, 403).client, 'org-a')).rejects.toThrow();
    await expect(listMembers(clientWith(null).client, 'org-a')).rejects.toThrow();
  });
  it('validates the scoped rollout capability without silently falling back', async () => {
    const { client, requests } = clientWith({ statusMode: 'legacy', timelineMode: 'copying' });
    expect(await readCapabilities(client, 'org-a')).toEqual({ statusMode: 'legacy', timelineMode: 'copying' });
    expect(requests[0].body).toEqual({ p_org: 'org-a' });
    await expect(readCapabilities(clientWith({ statusMode: 'unknown' }).client, 'org-a')).rejects.toThrow();
  });
});
