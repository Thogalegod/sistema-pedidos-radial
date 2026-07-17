import { describe, expect, it } from 'vitest';
import {
  findRemittanceInvoiceDocument,
  saveRemittanceInvoiceDocument,
  type ContractsLocacoesRemittanceDocumentClient,
} from './remittance-documents';
import type { Contract, ContractDocument } from './types';

class FakeRemittanceDocumentClient implements ContractsLocacoesRemittanceDocumentClient {
  public readonly organizationId = 'org-1';
  public readonly userId = 'user-1';
  public existingDocuments: ContractDocument[] = [];
  public userError: Error | null = null;
  public uploadError: Error | null = null;
  public insertError: Error | null = null;
  public removeError: Error | null = null;
  public createDocumentDespiteInsertError = false;
  public winnerDocument: ContractDocument | null = null;
  public readonly callOrder: string[] = [];
  public readonly removedObjects: Array<{ bucket: string; path: string }> = [];
  public uploadedObject:
    | {
        bucket: string;
        path: string;
        fileName: string;
        contentType: string;
      }
    | null = null;
  public insertedDocument: Omit<ContractDocument, 'id' | 'created_at'> | null = null;

  async getCurrentOrganizationId() {
    return this.organizationId;
  }

  async getCurrentUserId() {
    this.callOrder.push('user');
    if (this.userError) {
      throw this.userError;
    }

    return this.userId;
  }

  async listContractDocuments(organizationId: string, contractId: string) {
    this.callOrder.push('list');
    expect(organizationId).toBe(this.organizationId);
    expect(contractId).toBe('contract-1');
    return this.existingDocuments;
  }

  async uploadObject(
    bucket: string,
    path: string,
    file: File,
    options: { contentType: string; upsert: boolean }
  ) {
    this.callOrder.push('upload');
    expect(options.upsert).toBe(false);
    if (this.uploadError) {
      throw this.uploadError;
    }

    this.uploadedObject = {
      bucket,
      path,
      fileName: file.name,
      contentType: options.contentType,
    };
  }

  async removeObject(bucket: string, path: string) {
    this.callOrder.push('remove');
    if (this.removeError) {
      throw this.removeError;
    }

    this.removedObjects.push({ bucket, path });
    if (this.uploadedObject?.bucket === bucket && this.uploadedObject.path === path) {
      this.uploadedObject = null;
    }
  }

  async createSignedUrl() {
    return 'https://example.com/signed-url';
  }

  async insertContractDocument(record: Omit<ContractDocument, 'id' | 'created_at'>) {
    this.callOrder.push('insert');
    this.insertedDocument = record;
    const document = {
      id: 'doc-1',
      created_at: '2026-07-08T15:04:05.000Z',
      ...record,
    };

    if (this.insertError) {
      if (this.createDocumentDespiteInsertError) {
        this.existingDocuments = [document];
      } else if (this.winnerDocument) {
        this.existingDocuments = [this.winnerDocument];
      }

      throw this.insertError;
    }

    this.existingDocuments = [document];
    return document;
  }
}

function buildRemittanceDocument(overrides: Partial<ContractDocument> = {}): ContractDocument {
  return {
    id: 'doc-existing',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    billing_cycle_id: null,
    inspection_id: null,
    kind: 'remittance_nf',
    storage_path: 'org-1/contract-1/remittance_nf/existing.pdf',
    file_name: 'existing.pdf',
    content_type: 'application/pdf',
    created_by: 'user-1',
    created_at: '2026-07-08T11:00:00.000Z',
    ...overrides,
  };
}

type ConcurrentStorageState = {
  documents: ContractDocument[];
  objects: Set<string>;
  uploadCount: number;
  uploadWaiters: Array<() => void>;
};

class ConcurrentRemittanceDocumentClient implements ContractsLocacoesRemittanceDocumentClient {
  constructor(
    private readonly state: ConcurrentStorageState,
    private readonly userId: string
  ) {}

  async getCurrentOrganizationId() {
    return 'org-1';
  }

  async getCurrentUserId() {
    return this.userId;
  }

  async listContractDocuments() {
    return [...this.state.documents];
  }

  async uploadObject(_bucket: string, path: string) {
    this.state.objects.add(path);
    this.state.uploadCount += 1;

    if (this.state.uploadCount < 2) {
      await new Promise<void>((resolve) => this.state.uploadWaiters.push(resolve));
      return;
    }

    this.state.uploadWaiters.splice(0).forEach((resolve) => resolve());
  }

  async removeObject(_bucket: string, path: string) {
    this.state.objects.delete(path);
  }

  async createSignedUrl() {
    return 'https://example.com/signed-url';
  }

  async insertContractDocument(record: Omit<ContractDocument, 'id' | 'created_at'>) {
    const winner = findRemittanceInvoiceDocument(this.state.documents);
    if (winner) {
      throw new Error('duplicate key value violates unique constraint');
    }

    const document: ContractDocument = {
      id: `doc-${this.userId}`,
      created_at: '2026-07-08T18:00:00.000Z',
      ...record,
    };
    this.state.documents.push(document);
    return document;
  }
}

function buildRentalContract(overrides: Partial<Contract> = {}): Contract {
  return {
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
    remittance_invoice_amount: '1000',
    remittance_invoice_issue_date: '2026-07-08',
    start_date: '2026-07-08',
    end_date: null,
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '5000',
    percentage_rate: null,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
    notes: null,
    created_at: '2026-07-08T00:00:00.000Z',
    updated_at: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('remittance documents', () => {
  it('finds the remittance document among contract attachments', () => {
    const document = findRemittanceInvoiceDocument([
      {
        id: 'doc-1',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        billing_cycle_id: null,
        inspection_id: null,
        kind: 'other',
        storage_path: 'org-1/contract-1/other/file.txt',
        file_name: 'outro.txt',
        content_type: 'text/plain',
        created_by: 'user-1',
        created_at: '2026-07-08T10:00:00.000Z',
      },
      {
        id: 'doc-2',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        billing_cycle_id: null,
        inspection_id: null,
        kind: 'remittance_nf',
        storage_path: 'org-1/contract-1/remittance_nf/file.pdf',
        file_name: 'nf.pdf',
        content_type: 'application/pdf',
        created_by: 'user-1',
        created_at: '2026-07-08T11:00:00.000Z',
      },
    ]);

    expect(document?.id).toBe('doc-2');
  });

  it('uploads and inserts the first remittance NF attachment with private storage path metadata', async () => {
    const client = new FakeRemittanceDocumentClient();
    const file = new File(['<xml />'], 'NF Remessa 2026.xml', {
      type: 'application/xml',
    });

    const document = await saveRemittanceInvoiceDocument(client, buildRentalContract(), file, {
      now: new Date('2026-07-08T15:04:05.000Z'),
    });

    expect(client.uploadedObject).toEqual({
      bucket: 'contratos-locacoes-docs',
      path: 'org-1/contract-1/remittance_nf/20260708T150405000Z-nf-remessa-2026.xml',
      fileName: 'NF Remessa 2026.xml',
      contentType: 'application/xml',
    });
    expect(client.insertedDocument).toMatchObject({
      organization_id: 'org-1',
      contract_id: 'contract-1',
      kind: 'remittance_nf',
      storage_path: 'org-1/contract-1/remittance_nf/20260708T150405000Z-nf-remessa-2026.xml',
      file_name: 'NF Remessa 2026.xml',
      content_type: 'application/xml',
      created_by: 'user-1',
    });
    expect(document.file_name).toBe('NF Remessa 2026.xml');
    expect(client.callOrder.indexOf('user')).toBeLessThan(client.callOrder.indexOf('upload'));
    expect(client.removedObjects).toEqual([]);
  });

  it('does not upload when the authenticated user cannot be loaded', async () => {
    const client = new FakeRemittanceDocumentClient();
    client.userError = new Error('sessão inválida');

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract(),
        new File(['pdf'], 'NF.pdf', { type: 'application/pdf' })
      )
    ).rejects.toThrow(/sessão inválida/i);

    expect(client.callOrder).not.toContain('upload');
    expect(client.insertedDocument).toBeNull();
  });

  it('does not insert a document when storage upload fails', async () => {
    const client = new FakeRemittanceDocumentClient();
    client.uploadError = new Error('storage indisponível');

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract(),
        new File(['pdf'], 'NF.pdf', { type: 'application/pdf' })
      )
    ).rejects.toThrow(/storage indisponível/i);

    expect(client.callOrder).not.toContain('insert');
    expect(client.removedObjects).toEqual([]);
  });

  it('removes the uploaded orphan when the document insert fails', async () => {
    const client = new FakeRemittanceDocumentClient();
    client.insertError = new Error('insert falhou');

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract(),
        new File(['pdf'], 'NF.pdf', { type: 'application/pdf' }),
        { now: new Date('2026-07-08T18:00:00.000Z') }
      )
    ).rejects.toMatchObject({ state: 'persistence_failed_object_removed' });

    expect(client.removedObjects).toEqual([
      {
        bucket: 'contratos-locacoes-docs',
        path: 'org-1/contract-1/remittance_nf/20260708T180000000Z-nf.pdf',
      },
    ]);
    expect(client.uploadedObject).toBeNull();
  });

  it('keeps the object when the insert returned an error but the exact document exists', async () => {
    const client = new FakeRemittanceDocumentClient();
    client.insertError = new Error('resposta ambígua');
    client.createDocumentDespiteInsertError = true;

    const document = await saveRemittanceInvoiceDocument(
      client,
      buildRentalContract(),
      new File(['pdf'], 'NF.pdf', { type: 'application/pdf' }),
      { now: new Date('2026-07-08T18:00:00.000Z') }
    );

    expect(document.storage_path).toBe('org-1/contract-1/remittance_nf/20260708T180000000Z-nf.pdf');
    expect(client.removedObjects).toEqual([]);
    expect(client.uploadedObject).not.toBeNull();
  });

  it('removes the losing object and returns the winning document after a uniqueness conflict', async () => {
    const client = new FakeRemittanceDocumentClient();
    const winner = buildRemittanceDocument();
    client.insertError = new Error('duplicate key value violates unique constraint');
    client.winnerDocument = winner;

    const document = await saveRemittanceInvoiceDocument(
      client,
      buildRentalContract(),
      new File(['pdf'], 'NF concorrente.pdf', { type: 'application/pdf' }),
      { now: new Date('2026-07-08T18:00:00.000Z') }
    );

    expect(document).toEqual(winner);
    expect(client.removedObjects).toHaveLength(1);
    expect(client.uploadedObject).toBeNull();
  });

  it('reports an explicit cleanup failure when the orphan cannot be removed', async () => {
    const client = new FakeRemittanceDocumentClient();
    client.insertError = new Error('insert falhou');
    client.removeError = new Error('delete negado');

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract(),
        new File(['pdf'], 'NF.pdf', { type: 'application/pdf' })
      )
    ).rejects.toMatchObject({ state: 'cleanup_failed_orphan_probable' });
  });

  it('keeps one registered object and removes the loser after concurrent uploads', async () => {
    const state: ConcurrentStorageState = {
      documents: [],
      objects: new Set(),
      uploadCount: 0,
      uploadWaiters: [],
    };
    const firstClient = new ConcurrentRemittanceDocumentClient(state, 'user-1');
    const secondClient = new ConcurrentRemittanceDocumentClient(state, 'user-2');

    const [firstResult, secondResult] = await Promise.all([
      saveRemittanceInvoiceDocument(
        firstClient,
        buildRentalContract(),
        new File(['first'], 'NF primeira.pdf', { type: 'application/pdf' }),
        { now: new Date('2026-07-08T18:00:00.000Z') }
      ),
      saveRemittanceInvoiceDocument(
        secondClient,
        buildRentalContract(),
        new File(['second'], 'NF segunda.pdf', { type: 'application/pdf' }),
        { now: new Date('2026-07-08T18:00:01.000Z') }
      ),
    ]);

    expect(state.documents).toHaveLength(1);
    expect(state.objects).toEqual(new Set([state.documents[0].storage_path]));
    expect(firstResult.id).toBe(state.documents[0].id);
    expect(secondResult.id).toBe(state.documents[0].id);
  });

  it('rejects a second upload when the contract already has a remittance NF attachment', async () => {
    const client = new FakeRemittanceDocumentClient();
    client.existingDocuments = [
      {
        id: 'doc-existing',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        billing_cycle_id: null,
        inspection_id: null,
        kind: 'remittance_nf',
        storage_path: 'org-1/contract-1/remittance_nf/old-file.pdf',
        file_name: 'old-file.pdf',
        content_type: 'application/pdf',
        created_by: 'user-1',
        created_at: '2026-07-08T11:00:00.000Z',
      },
    ];

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract(),
        new File(['pdf'], 'Nova NF.pdf', { type: 'application/pdf' }),
        {
          now: new Date('2026-07-08T18:00:00.000Z'),
        }
      )
    ).rejects.toThrow(/já possui um anexo principal/i);

    expect(client.uploadedObject).toBeNull();
    expect(client.insertedDocument).toBeNull();
  });

  it('rejects unsupported attachments before trying upload', async () => {
    const client = new FakeRemittanceDocumentClient();

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract(),
        new File(['plain text'], 'nf.txt', { type: 'text/plain' })
      )
    ).rejects.toThrow(/pdf, xml, png ou jpg/i);

    expect(client.uploadedObject).toBeNull();
    expect(client.insertedDocument).toBeNull();
  });

  it('rejects upload when the contract does not have remittance NF enabled', async () => {
    const client = new FakeRemittanceDocumentClient();

    await expect(() =>
      saveRemittanceInvoiceDocument(
        client,
        buildRentalContract({ has_remittance_invoice: false }),
        new File(['pdf'], 'NF.pdf', { type: 'application/pdf' })
      )
    ).rejects.toThrow(/só está disponível para contratos de locação com NF habilitada/i);

    expect(client.callOrder).toEqual([]);
  });
});
