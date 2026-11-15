import { describe, expect, it } from 'vitest';
import {
  BOLETO_DOCUMENT_BUCKET,
  BOLETO_DOCUMENT_MAX_BYTES,
  buildBoletoStoragePath,
  getBoletoSignedUrl,
  repairPendingBoletoChange,
  replaceBoletoDocument,
  saveBoletoDocument,
  type ContractsLocacoesBoletoDocumentClient,
} from './boleto-documents';
import type { BillingCycle, Contract, ContractDocument } from './types';

const contract = { id: 'contract-1', organization_id: 'org-1' } as Contract;
const billing = {
  id: 'billing-1', organization_id: 'org-1', contract_id: 'contract-1',
  boleto_change_pending: false, boleto_change_operation_id: null,
} as BillingCycle;
const document = {
  id: 'doc-1', organization_id: 'org-1', contract_id: 'contract-1',
  billing_cycle_id: 'billing-1', kind: 'boleto',
  storage_path: 'org-1/contract-1/boleto/billing-1.pdf',
} as ContractDocument;

function pdf(name = 'boleto.pdf', size = 4) {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

function fakeClient(overrides: Partial<ContractsLocacoesBoletoDocumentClient> = {}) {
  const calls: string[] = [];
  const client: ContractsLocacoesBoletoDocumentClient = {
    async listBoletoDocuments() { return [document]; },
    async beginBoletoChange(input) {
      calls.push(`begin:${input.operationId}`);
      return { status: 'pending', operation_id: input.operationId, started_at: '2026-08-24T10:00:00Z', content_revision: '2' };
    },
    async uploadObject(bucket, path, _file, options) {
      calls.push(`upload:${bucket}:${path}:${options.upsert}`);
    },
    async finishBoletoChange(input) {
      calls.push(`finish:${input.operationId}`);
      return { document, billing, already_finished: false };
    },
    async createSignedUrl(bucket, path, seconds) {
      calls.push(`signed:${bucket}:${path}:${seconds}`);
      return 'https://signed.invalid/boleto';
    },
    ...overrides,
  };
  return { client, calls };
}

describe('boleto documents', () => {
  it('builds the single deterministic path', () => {
    expect(buildBoletoStoragePath({ organizationId: 'org-1', contractId: 'contract-1', billingCycleId: 'billing-1' }))
      .toBe('org-1/contract-1/boleto/billing-1.pdf');
  });

  it('runs begin, initial upload and finish in order', async () => {
    const { client, calls } = fakeClient();
    await saveBoletoDocument(client, contract, billing, pdf(), 'operation-1');
    expect(calls).toEqual([
      'begin:operation-1',
      `upload:${BOLETO_DOCUMENT_BUCKET}:org-1/contract-1/boleto/billing-1.pdf:false`,
      'finish:operation-1',
    ]);
  });

  it('does not upload again when begin reports an already finished operation', async () => {
    const { client, calls } = fakeClient({
      async beginBoletoChange(input) {
        calls.push(`begin:${input.operationId}`);
        return { status: 'already_finished', operation_id: input.operationId, started_at: null, content_revision: '3' };
      },
      async finishBoletoChange(input) {
        calls.push(`finish:${input.operationId}`);
        return { document, billing, already_finished: true };
      },
    });
    await saveBoletoDocument(client, contract, billing, pdf(), 'operation-1');
    expect(calls).toEqual(['begin:operation-1', 'finish:operation-1']);
  });

  it('leaves finish untouched after an upload failure', async () => {
    const { client, calls } = fakeClient({
      async uploadObject() { calls.push('upload'); throw new Error('storage unavailable'); },
    });
    await expect(saveBoletoDocument(client, contract, billing, pdf(), 'operation-1')).rejects.toThrow('storage unavailable');
    expect(calls).toEqual(['begin:operation-1', 'upload']);
  });

  it('replaces and repairs with upsert on the same path and operation', async () => {
    const replacement = fakeClient();
    await replaceBoletoDocument(replacement.client, contract, billing, document, pdf(), 'operation-2');
    expect(replacement.calls[1]).toContain(':true');

    const pending = { ...billing, boleto_change_pending: true, boleto_change_operation_id: 'operation-3' };
    const repair = fakeClient();
    await repairPendingBoletoChange(repair.client, contract, pending, pdf());
    expect(repair.calls).toEqual([
      `upload:${BOLETO_DOCUMENT_BUCKET}:org-1/contract-1/boleto/billing-1.pdf:true`,
      'finish:operation-3',
    ]);
  });

  it('rejects invalid relationships, non-PDF and oversized files before begin', async () => {
    const { client, calls } = fakeClient();
    await expect(saveBoletoDocument(client, contract, { ...billing, organization_id: 'org-2' }, pdf(), 'op')).rejects.toThrow(/organização/i);
    await expect(saveBoletoDocument(client, contract, billing, new File(['x'], 'x.txt', { type: 'text/plain' }), 'op')).rejects.toThrow(/PDF/i);
    await expect(saveBoletoDocument(client, contract, billing, pdf('large.pdf', BOLETO_DOCUMENT_MAX_BYTES + 1), 'op')).rejects.toThrow(/10 MB/i);
    expect(calls).toEqual([]);
  });

  it('requires the persisted pending operation for repair', async () => {
    const { client } = fakeClient();
    await expect(repairPendingBoletoChange(client, contract, billing, pdf())).rejects.toThrow(/pendente/i);
  });

  it('uses a short signed URL without creating a public URL', async () => {
    const { client, calls } = fakeClient();
    await expect(getBoletoSignedUrl(client, document)).resolves.toBe('https://signed.invalid/boleto');
    expect(calls).toEqual([`signed:${BOLETO_DOCUMENT_BUCKET}:${document.storage_path}:1800`]);
  });
});
