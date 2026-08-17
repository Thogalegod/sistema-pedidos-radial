import { describe, expect, it } from 'vitest';
import {
  PAYMENT_PROOF_DOCUMENT_BUCKET,
  buildPaymentProofStoragePath,
  savePaymentProofDocument,
  type ContractsLocacoesPaymentProofClient,
} from './payment-proofs';
import type { BillingCycle, Contract, ContractDocument, Payment } from './types';

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    organization_id: 'org-1',
    internal_number: '42',
    kind: 'rental',
    contract_company: 'radial',
    customer_id: 'customer-1',
    site_id: 'site-1',
    legacy_order_number: 'OS-42',
    transport_notes: null,
    has_remittance_invoice: false,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
    start_date: '2026-08-08',
    end_date: null,
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '300000',
    percentage_rate: null,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
    notes: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function makeBilling(overrides: Partial<BillingCycle> = {}): BillingCycle {
  return {
    id: 'billing-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    sequence_number: 1,
    period_start: '2026-08-08',
    period_end: '2026-09-07',
    issue_date: '2026-08-08',
    due_date: '2026-08-15',
    base_amount: '300000',
    discount_amount: '0',
    surcharge_amount: '0',
    exemption_amount: '0',
    total_amount: '300000',
    document_type: 'receipt',
    document_number: 'R000042001',
    status: 'issued',
    sent_at: null,
    notes: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: 'org-1',
    billing_cycle_id: 'billing-1',
    paid_at: '2026-08-14T12:00:00.000Z',
    amount: '300000',
    notes: 'Pago',
    created_at: '2026-08-14T12:00:00.000Z',
    updated_at: '2026-08-14T12:00:00.000Z',
    ...overrides,
  };
}

class FakePaymentProofClient implements ContractsLocacoesPaymentProofClient {
  public uploaded: { bucket: string; path: string; contentType: string } | null = null;
  public inserted: Omit<ContractDocument, 'id' | 'created_at'> | null = null;
  public existingDocuments: ContractDocument[] = [];

  async getCurrentOrganizationId() {
    return 'org-1';
  }

  async getCurrentUserId() {
    return 'user-1';
  }

  async listContractDocuments() {
    return this.existingDocuments;
  }

  async uploadObject(bucket: string, path: string, _file: File, options: { contentType: string }) {
    this.uploaded = { bucket, path, contentType: options.contentType };
  }

  async removeObject(): Promise<void> {
  }

  async createSignedUrl(): Promise<string> {
    return 'https://signed.example/proof.pdf';
  }

  async insertContractDocument(record: Omit<ContractDocument, 'id' | 'created_at'>) {
    this.inserted = record;

    return {
      id: 'document-1',
      created_at: '2026-08-14T12:00:00.000Z',
      ...record,
    };
  }
}

describe('payment proof documents', () => {
  it('builds the approved storage path with the payment id and sanitized file name', () => {
    const path = buildPaymentProofStoragePath({
      organizationId: 'org-1',
      contractId: 'contract-1',
      paymentId: '123e4567-e89b-12d3-a456-426614174000',
      fileName: 'Comprovante Agosto 2026.PDF',
      now: new Date('2026-08-14T12:34:56.789Z'),
    });

    expect(path).toBe('org-1/contract-1/payment_proof/123e4567-e89b-12d3-a456-426614174000-20260814T123456789Z-comprovante-agosto-2026.pdf');
  });

  it('rejects mismatched contract, billing cycle and payment records before uploading', async () => {
    const client = new FakePaymentProofClient();
    const file = new File(['proof'], 'comprovante.pdf', { type: 'application/pdf' });

    await expect(savePaymentProofDocument(
      client,
      makeContract(),
      makeBilling({ contract_id: 'contract-2' }),
      makePayment(),
      file
    )).rejects.toThrow('A cobrança informada não pertence à locação.');

    expect(client.uploaded).toBeNull();
    expect(client.inserted).toBeNull();
  });

  it('uploads a supported proof and persists it with payment_id, billing_cycle_id and contract_id', async () => {
    const client = new FakePaymentProofClient();
    const file = new File(['proof'], 'comprovante.png', { type: 'image/png' });

    const document = await savePaymentProofDocument(
      client,
      makeContract(),
      makeBilling(),
      makePayment(),
      file,
      { now: new Date('2026-08-14T12:34:56.789Z') }
    );

    expect(client.uploaded).toEqual({
      bucket: PAYMENT_PROOF_DOCUMENT_BUCKET,
      path: 'org-1/contract-1/payment_proof/123e4567-e89b-12d3-a456-426614174000-20260814T123456789Z-comprovante.png',
      contentType: 'image/png',
    });
    expect(client.inserted).toMatchObject({
      organization_id: 'org-1',
      contract_id: 'contract-1',
      billing_cycle_id: 'billing-1',
      payment_id: '123e4567-e89b-12d3-a456-426614174000',
      kind: 'payment_proof',
      storage_path: 'org-1/contract-1/payment_proof/123e4567-e89b-12d3-a456-426614174000-20260814T123456789Z-comprovante.png',
      content_type: 'image/png',
      created_by: 'user-1',
    });
    expect(document.payment_id).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});
