import { describe, expect, it, vi } from 'vitest';
import { createBillingSendClient, createBillingSendIntent } from './billing-send-client';

describe('billing send client', () => {
  it('uses the current access token for preparation and sending', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'sent' }), { status: 200 }));
    const client = createBillingSendClient({
      getAccessToken: vi.fn().mockResolvedValue('current-token'),
      fetchImpl,
    });
    const request = {
      send_request_id: '11111111-1111-4111-8111-111111111111',
      recipients: ['billing@example.com'],
      additional_message: null,
    };

    await client.prepare('billing-1');
    await client.send('billing-1', request);

    expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/contratos-locacoes/cobrancas/billing-1/enviar', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer current-token' }), cache: 'no-store',
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/contratos-locacoes/cobrancas/billing-1/enviar', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer current-token' }), body: JSON.stringify(request),
    }));
  });

  it('creates a fresh UUID only when an intent is requested and normalizes its payload', () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

    const first = createBillingSendIntent({
      recipients: [' B@EXAMPLE.COM ', 'a@example.com', 'b@example.com'],
      additionalMessage: '  Olá  ',
    }, randomUUID);
    const second = createBillingSendIntent({ recipients: ['a@example.com'], additionalMessage: '' }, randomUUID);

    expect(first).toEqual({
      send_request_id: '11111111-1111-4111-8111-111111111111',
      recipients: ['a@example.com', 'b@example.com'],
      additional_message: 'Olá',
    });
    expect(second.send_request_id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('surfaces the server message without leaking the access token', async () => {
    const client = createBillingSendClient({
      getAccessToken: vi.fn().mockResolvedValue('secret-token'),
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Envio bloqueado' }), { status: 422 })),
    });

    await expect(client.prepare('billing-1')).rejects.toThrow('Envio bloqueado');
    await expect(client.prepare('billing-1')).rejects.not.toThrow('secret-token');
  });
});
