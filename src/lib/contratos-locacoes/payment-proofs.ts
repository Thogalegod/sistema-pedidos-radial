import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingCycle, Contract, ContractDocument, Payment } from './types';

export const PAYMENT_PROOF_DOCUMENT_BUCKET = 'contratos-locacoes-docs';
export const PAYMENT_PROOF_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const PAYMENT_PROOF_EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const PAYMENT_PROOF_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export interface ContractsLocacoesPaymentProofClient {
  getCurrentOrganizationId(): Promise<string>;
  getCurrentUserId(): Promise<string>;
  listContractDocuments(organizationId: string, contractId: string): Promise<ContractDocument[]>;
  uploadObject(
    bucket: string,
    path: string,
    file: File,
    options: { contentType: string; upsert: boolean }
  ): Promise<void>;
  removeObject(bucket: string, path: string): Promise<void>;
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
  insertContractDocument(record: Omit<ContractDocument, 'id' | 'created_at'>): Promise<ContractDocument>;
}

function ensureData<T>(data: T | null, error: { message: string } | null, message: string) {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }

  if (data == null) {
    throw new Error(message);
  }

  return data;
}

export function createSupabaseContractsLocacoesPaymentProofClient(
  client: SupabaseClient
): ContractsLocacoesPaymentProofClient {
  return {
    async getCurrentOrganizationId() {
      const { data, error } = await client
        .from('organization_members')
        .select('organization_id')
        .limit(1)
        .single();

      const membership = ensureData(
        data as { organization_id: string } | null,
        error,
        'Não foi possível identificar a organização atual'
      );

      return membership.organization_id;
    },

    async getCurrentUserId() {
      const { data, error } = await client.auth.getUser();

      if (error) {
        throw new Error(`Não foi possível identificar o usuário atual: ${error.message}`);
      }

      const userId = data.user?.id;

      if (!userId) {
        throw new Error('Não foi possível identificar o usuário atual.');
      }

      return userId;
    },

    async listContractDocuments(organizationId, contractId) {
      const { data, error } = await client
        .from('contract_documents')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });

      return ensureData(
        (data ?? []) as ContractDocument[] | null,
        error,
        'Não foi possível listar documentos do contrato'
      );
    },

    async uploadObject(bucket, path, file, options) {
      const { error } = await client.storage.from(bucket).upload(path, file, {
        contentType: options.contentType,
        upsert: options.upsert,
      });

      if (error) {
        throw new Error(`Não foi possível enviar o comprovante para o Storage: ${error.message}`);
      }
    },

    async removeObject(bucket, path) {
      const { error } = await client.storage.from(bucket).remove([path]);

      if (error) {
        throw new Error(`Não foi possível remover o comprovante órfão do Storage: ${error.message}`);
      }
    },

    async createSignedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);

      const signed = ensureData(
        data as { signedUrl: string } | null,
        error,
        'Não foi possível gerar link temporário para o comprovante'
      );

      return signed.signedUrl;
    },

    async insertContractDocument(record) {
      const { data, error } = await client
        .from('contract_documents')
        .insert(record)
        .select('*')
        .single();

      return ensureData(
        data as ContractDocument | null,
        error,
        'Não foi possível salvar o comprovante'
      );
    },
  };
}

function normalizeFileExtension(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toLowerCase() : '';
}

function resolveContentType(file: Pick<File, 'name' | 'type'>) {
  if (file.type && PAYMENT_PROOF_EXTENSION_BY_TYPE[file.type]) {
    return file.type;
  }

  const extension = normalizeFileExtension(file.name);
  return PAYMENT_PROOF_TYPE_BY_EXTENSION[extension] ?? null;
}

function sanitizeFileName(fileName: string) {
  const sanitized = fileName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return sanitized || 'arquivo';
}

function buildTimestampPrefix(now: Date) {
  return now.toISOString().replace(/[-:.]/g, '');
}

function assertSupportedFile(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (file.size > PAYMENT_PROOF_DOCUMENT_MAX_BYTES) {
    throw new Error('O comprovante deve ter no máximo 10 MB.');
  }

  const contentType = resolveContentType(file);
  if (!contentType) {
    throw new Error('Use um arquivo PDF, PNG ou JPG para anexar o comprovante.');
  }

  return contentType;
}

function assertPaymentProofRelations(params: {
  organizationId: string;
  contract: Contract;
  billing: BillingCycle;
  payment: Payment;
}) {
  const { organizationId, contract, billing, payment } = params;

  if (contract.organization_id !== organizationId || billing.organization_id !== organizationId || payment.organization_id !== organizationId) {
    throw new Error('Contrato, cobrança e recebimento precisam pertencer à mesma organização.');
  }

  if (billing.contract_id !== contract.id) {
    throw new Error('A cobrança informada não pertence à locação.');
  }

  if (payment.billing_cycle_id !== billing.id) {
    throw new Error('O recebimento informado não pertence à cobrança.');
  }
}

export function buildPaymentProofStoragePath(params: {
  organizationId: string;
  contractId: string;
  paymentId: string;
  fileName: string;
  now?: Date;
}) {
  const timestamp = buildTimestampPrefix(params.now ?? new Date());
  const safeName = sanitizeFileName(params.fileName);

  return `${params.organizationId}/${params.contractId}/payment_proof/${params.paymentId}-${timestamp}-${safeName}`;
}

export function findPaymentProofDocument(documents: ContractDocument[], paymentId: string) {
  return documents.find(
    (document) => document.kind === 'payment_proof' && document.payment_id === paymentId
  ) ?? null;
}

export async function savePaymentProofDocument(
  client: ContractsLocacoesPaymentProofClient,
  contract: Contract,
  billing: BillingCycle,
  payment: Payment,
  file: File,
  options: { now?: Date } = {}
) {
  const organizationId = contract.organization_id || await client.getCurrentOrganizationId();
  assertPaymentProofRelations({ organizationId, contract, billing, payment });

  const contentType = assertSupportedFile(file);
  const documents = await client.listContractDocuments(organizationId, contract.id);
  const existingDocument = findPaymentProofDocument(documents, payment.id);

  if (existingDocument) {
    throw new Error('Este recebimento já possui comprovante. A substituição será tratada em etapa futura.');
  }

  const userId = await client.getCurrentUserId();
  const storagePath = buildPaymentProofStoragePath({
    organizationId,
    contractId: contract.id,
    paymentId: payment.id,
    fileName: file.name,
    now: options.now,
  });

  await client.uploadObject(PAYMENT_PROOF_DOCUMENT_BUCKET, storagePath, file, {
    contentType,
    upsert: false,
  });

  try {
    return await client.insertContractDocument({
      organization_id: organizationId,
      contract_id: contract.id,
      billing_cycle_id: billing.id,
      payment_id: payment.id,
      inspection_id: null,
      kind: 'payment_proof',
      storage_path: storagePath,
      file_name: file.name,
      content_type: contentType,
      created_by: userId,
    });
  } catch (insertError) {
    await client.removeObject(PAYMENT_PROOF_DOCUMENT_BUCKET, storagePath);
    throw insertError;
  }
}

export async function getPaymentProofSignedUrl(
  client: ContractsLocacoesPaymentProofClient,
  document: ContractDocument
) {
  return client.createSignedUrl(PAYMENT_PROOF_DOCUMENT_BUCKET, document.storage_path, 60 * 30);
}
