import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseContractsLocacoesMutationClient, recordBillingPayment } from './mutations';

const payload = { billing_cycle_id: 'bill-1', operation_id: '2f0c8c89-5023-47f8-9a83-78ffcc60da4b', paid_at: '2026-11-14', amount: '100', notes: null };
describe('atomic receipt adapter', () => {
  it('uses only one RPC to save a payment and passes the stable operation identity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { payment: { id: 'payment-1' } }, error: null });
    const from = vi.fn(() => { throw new Error('non-atomic table access'); });
    const client = createSupabaseContractsLocacoesMutationClient({ rpc, from } as unknown as SupabaseClient);
    client.getCurrentOrganizationId = async () => 'org-1';
    const result = await recordBillingPayment(client, 'bill-1', payload);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('record_rental_payment', {
      p_organization_id: 'org-1', p_billing_cycle_id: 'bill-1', p_operation_id: payload.operation_id,
      p_paid_at: payload.paid_at, p_amount: '100', p_notes: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(result.payment.id).toBe('payment-1');
  });
  it('does not fall back to direct inserts when the RPC fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL detail', code: '42501' } });
    const from = vi.fn();
    const client = createSupabaseContractsLocacoesMutationClient({ rpc, from } as unknown as SupabaseClient);
    client.getCurrentOrganizationId = async () => 'org-1';
    await expect(recordBillingPayment(client, 'bill-1', payload)).rejects.toThrow(/acesso/i);
    expect(from).not.toHaveBeenCalled();
  });
});
