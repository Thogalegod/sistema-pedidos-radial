import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { chooseInitialFront, removeFront, saveFront } from './fronts';

function clientFor(response: unknown, status = 200) {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: String(url), method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json(response, { status });
    } },
  });
  return { client, requests };
}

const front = { id: 'front-a', orderId: 'order-a', name: 'Geral', position: 0 };

describe('Frentes do Pedido', () => {
  it('preselects the only Front, but requires a choice among several', () => {
    expect(chooseInitialFront([front], null)).toBe('front-a');
    expect(chooseInitialFront([front, { ...front, id: 'front-b' }], null)).toBeNull();
    expect(chooseInitialFront([front, { ...front, id: 'front-b' }], 'front-b')).toBe('front-b');
    expect(chooseInitialFront([front], 'missing')).toBeNull();
    expect(chooseInitialFront([], null)).toBeNull();
  });

  it('creates a Front scoped to the Pedido and returns its persisted identity', async () => {
    const { client, requests } = clientFor({ id: 'front-a', pedido_id: 'order-a', nome: 'Geral', ordem: 0 });
    await expect(saveFront(client, 'org-a', { ...front, id: '' })).resolves.toEqual({ ok: true, value: front });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toContain('/rest/v1/pedido_frentes');
    expect(requests[0].body).toMatchObject({ organization_id: 'org-a', pedido_id: 'order-a', nome: 'Geral' });
  });

  it('renames or reorders only the identified Front in this organization and Pedido', async () => {
    const { client, requests } = clientFor({ id: 'front-a', pedido_id: 'order-a', nome: 'Obra', ordem: 1 });
    await expect(saveFront(client, 'org-a', { ...front, name: 'Obra', position: 1 }))
      .resolves.toEqual({ ok: true, value: { ...front, name: 'Obra', position: 1 } });
    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].url).toContain('organization_id=eq.org-a');
    expect(requests[0].url).toContain('pedido_id=eq.order-a');
    expect(requests[0].url).toContain('id=eq.front-a');
  });

  it('moves referenced tasks and removes a Front in one RPC, preserving a failed source', async () => {
    const success = clientFor(null);
    await expect(removeFront(success.client, 'org-a', 'front-a', 'front-b'))
      .resolves.toEqual({ ok: true, value: undefined });
    expect(success.requests).toEqual([{ url: 'https://example.test/rest/v1/rpc/remove_pedido_front',
      method: 'POST', body: { p_org: 'org-a', p_front: 'front-a', p_destination: 'front-b' } }]);

    const refused = clientFor({ code: '23514', message: 'Front with tasks requires a destination' }, 400);
    await expect(removeFront(refused.client, 'org-a', 'front-a', null)).resolves.toMatchObject({
      ok: false, code: 'invalid',
    });
  });
});
