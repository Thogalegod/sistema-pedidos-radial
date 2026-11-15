import { describe, expect, it } from 'vitest';
import { createContractWithOptionalRemittance } from './contract-creation';
import type { ContractMutationResult } from './mutations';
import type { ContractDocument } from './types';

function buildCreationResult(): ContractMutationResult {
  return {
    contract: {
      id: 'contract-1',
      organization_id: 'org-1',
      internal_number: '123',
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: null,
      transport_notes: null,
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-123',
      remittance_invoice_issuer: 'Fontes',
      remittance_invoice_amount: '150000',
      remittance_invoice_issue_date: '2026-08-18',
      start_date: '2026-08-18',
      end_date: null,
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: null,
      status: 'active',
      pause_started_at: null,
      pause_reason: null,
      notes: null,
      created_at: '2026-08-18T12:00:00.000Z',
      updated_at: '2026-08-18T12:00:00.000Z',
    },
    items: [],
  };
}

function buildDocument(): ContractDocument {
  return {
    id: 'document-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    billing_cycle_id: null,
    payment_id: null,
    inspection_id: null,
    kind: 'remittance_nf',
    storage_path: 'org-1/contract-1/remittance_nf/nf.pdf',
    file_name: 'nf.pdf',
    content_type: 'application/pdf',
    created_by: 'user-1',
    created_at: '2026-08-18T12:01:00.000Z',
  };
}

describe('createContractWithOptionalRemittance', () => {
  it('creates the rental without attempting upload when no file was selected', async () => {
    const creation = buildCreationResult();

    const outcome = await createContractWithOptionalRemittance({
      createContract: async () => creation,
      remittanceInvoiceFile: null,
      uploadRemittanceDocument: async () => {
        throw new Error('upload must not run');
      },
    });

    expect(outcome.creation).toBe(creation);
    expect(outcome.remittanceDocument).toBeNull();
    expect(outcome.remittanceUploadError).toBeNull();
  });

  it('creates the rental before uploading the selected remittance invoice', async () => {
    const events: string[] = [];
    const creation = buildCreationResult();
    const document = buildDocument();
    const file = new File(['pdf'], 'nf.pdf', { type: 'application/pdf' });

    const outcome = await createContractWithOptionalRemittance({
      createContract: async () => {
        events.push('create');
        return creation;
      },
      remittanceInvoiceFile: file,
      uploadRemittanceDocument: async (contract, selectedFile) => {
        events.push('upload');
        expect(contract.id).toBe('contract-1');
        expect(selectedFile).toBe(file);
        return document;
      },
    });

    expect(events).toEqual(['create', 'upload']);
    expect(outcome.creation).toBe(creation);
    expect(outcome.remittanceDocument).toBe(document);
    expect(outcome.remittanceUploadError).toBeNull();
  });

  it('preserves the created rental when the remittance invoice upload fails', async () => {
    const creation = buildCreationResult();
    const uploadError = new Error('storage indisponível');

    const outcome = await createContractWithOptionalRemittance({
      createContract: async () => creation,
      remittanceInvoiceFile: new File(['pdf'], 'nf.pdf', { type: 'application/pdf' }),
      uploadRemittanceDocument: async () => {
        throw uploadError;
      },
    });

    expect(outcome.creation).toBe(creation);
    expect(outcome.remittanceDocument).toBeNull();
    expect(outcome.remittanceUploadError).toBe(uploadError);
  });
});
