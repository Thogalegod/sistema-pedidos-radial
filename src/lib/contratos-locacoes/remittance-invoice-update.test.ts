import { describe, expect, it, vi } from 'vitest';
import type { ContractsLocacoesMutationClient } from './mutations';
import { updateRemittanceInvoice } from './remittance-invoice-update';
import type { Contract } from './types';

function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    organization_id: 'org-1',
    internal_number: '123',
    kind: 'rental',
    contract_company: 'radial',
    customer_id: 'customer-1',
    site_id: 'site-1',
    legacy_order_number: null,
    transport_notes: null,
    has_remittance_invoice: true,
    remittance_invoice_number: 'NF-OLD',
    remittance_invoice_issuer: 'Radial',
    remittance_invoice_amount: '10000',
    remittance_invoice_issue_date: '2026-08-01',
    start_date: '2026-08-01',
    end_date: null,
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '10000',
    percentage_rate: null,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
    notes: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function buildClient(updatedContract: Contract) {
  return {
    getCurrentOrganizationId: vi.fn().mockResolvedValue('org-1'),
    updateContract: vi.fn().mockResolvedValue(updatedContract),
  } as unknown as ContractsLocacoesMutationClient;
}

describe('updateRemittanceInvoice', () => {
  it('updates metadata and derives the issuer even when an NF document is attached', async () => {
    const updatedContract = buildContract({
      remittance_invoice_number: 'NF-NEW',
      remittance_invoice_amount: '90050',
      remittance_invoice_issue_date: '2026-08-18',
    });
    const client = buildClient(updatedContract);

    const result = await updateRemittanceInvoice(
      client,
      buildContract(),
      {
        has_remittance_invoice: true,
        remittance_invoice_number: 'NF-NEW',
        remittance_invoice_amount: '90050',
        remittance_invoice_issue_date: '2026-08-18',
      },
      { hasAttachedDocument: true }
    );

    expect(result).toBe(updatedContract);
    expect(client.updateContract).toHaveBeenCalledWith('contract-1', {
      organization_id: 'org-1',
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-NEW',
      remittance_invoice_issuer: 'Radial',
      remittance_invoice_amount: '90050',
      remittance_invoice_issue_date: '2026-08-18',
    });
  });

  it('clears all remittance metadata when disabling an NF without an attachment', async () => {
    const updatedContract = buildContract({
      has_remittance_invoice: false,
      remittance_invoice_number: null,
      remittance_invoice_issuer: null,
      remittance_invoice_amount: null,
      remittance_invoice_issue_date: null,
    });
    const client = buildClient(updatedContract);

    await updateRemittanceInvoice(
      client,
      buildContract(),
      {
        has_remittance_invoice: false,
        remittance_invoice_number: null,
        remittance_invoice_amount: null,
        remittance_invoice_issue_date: null,
      },
      { hasAttachedDocument: false }
    );

    expect(client.updateContract).toHaveBeenCalledWith('contract-1', {
      organization_id: 'org-1',
      has_remittance_invoice: false,
      remittance_invoice_number: null,
      remittance_invoice_issuer: null,
      remittance_invoice_amount: null,
      remittance_invoice_issue_date: null,
    });
  });

  it('refuses to disable the NF while a document remains attached', async () => {
    const client = buildClient(buildContract());

    await expect(
      updateRemittanceInvoice(
        client,
        buildContract(),
        {
          has_remittance_invoice: false,
          remittance_invoice_number: null,
          remittance_invoice_amount: null,
          remittance_invoice_issue_date: null,
        },
        { hasAttachedDocument: true }
      )
    ).rejects.toThrow('Não é possível marcar como sem NF de remessa enquanto existir um arquivo anexado.');

    expect(client.updateContract).not.toHaveBeenCalled();
  });

  it('requires number, amount and issue date when enabling remittance metadata', async () => {
    const client = buildClient(buildContract());

    await expect(
      updateRemittanceInvoice(
        client,
        buildContract({ has_remittance_invoice: false }),
        {
          has_remittance_invoice: true,
          remittance_invoice_number: '',
          remittance_invoice_amount: '',
          remittance_invoice_issue_date: '',
        },
        { hasAttachedDocument: false }
      )
    ).rejects.toThrow('Preencha número, valor e data de emissão da NF de remessa.');

    expect(client.updateContract).not.toHaveBeenCalled();
  });
});
