import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  assignLegacyTasks,
  formatMemberLabel,
  listMembers,
  listUnassignedLegacyTasks,
  readCurrentMembershipRole,
  readCapabilities,
  resolveNamedMember,
  setMemberDisplayName,
} from './members';

let clientNumber = 0;
function clientWith(response: unknown, status = 200) {
  const requests: { path: string; body: unknown }[] = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `directory-test-${++clientNumber}` },
    global: { fetch: async (url, init) => {
      requests.push({
        path: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
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

  it('formats unnamed members without inventing an identity', () => {
    expect(formatMemberLabel({ userId: '12345678-aaaa', displayName: null }))
      .toBe('Membro sem nome · 12345678');
    expect(formatMemberLabel({ userId: '12345678-aaaa', displayName: 'Roberto' }))
      .toBe('Roberto');
  });

  it('lists only unassigned legacy tasks in the active organization', async () => {
    const { client, requests } = clientWith([
      { id: 'task-a', responsavel: 'Roberto' },
      { id: 'task-b', responsavel: 'Katlyn' },
    ]);

    await expect(listUnassignedLegacyTasks(client, 'org-a')).resolves.toEqual([
      { taskId: 'task-a', label: 'Roberto' },
      { taskId: 'task-b', label: 'Katlyn' },
    ]);
    expect(requests[0].path).toContain('/rest/v1/tarefas?');
    expect(requests[0].path).toContain('organization_id=eq.org-a');
    expect(requests[0].path).toContain('responsavel_user_id=is.null');
  });

  it('writes names and assignments only through the scoped administrative RPCs', async () => {
    const setName = clientWith(null);
    await expect(
      setMemberDisplayName(setName.client, 'org-a', 'user-a', 'Roberto')
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(setName.requests[0].body).toEqual({
      p_org: 'org-a', p_member: 'user-a', p_name: 'Roberto',
    });

    const assign = clientWith(2);
    await expect(
      assignLegacyTasks(assign.client, 'org-a', ['task-a', 'task-b'], 'user-a')
    ).resolves.toEqual({ ok: true, value: 2 });
    expect(assign.requests[0].body).toEqual({
      p_org: 'org-a', p_task_ids: ['task-a', 'task-b'], p_member: 'user-a',
    });
  });

  it('returns a failure result when an administrative RPC refuses the write', async () => {
    const denied = clientWith({ code: '42501', message: 'Organization admin required' }, 403);

    await expect(
      assignLegacyTasks(denied.client, 'org-a', ['task-a'], 'user-a')
    ).resolves.toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('reads the current user role from the scoped membership row', async () => {
    const { client, requests } = clientWith({ role: 'admin' });

    await expect(readCurrentMembershipRole(client, 'org-a', 'user-a')).resolves.toBe('admin');
    expect(requests[0].path).toContain('/rest/v1/organization_members?');
    expect(requests[0].path).toContain('organization_id=eq.org-a');
    expect(requests[0].path).toContain('user_id=eq.user-a');
  });
});
