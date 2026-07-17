import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contract, ContractDocument } from './types';

export const REMITTANCE_DOCUMENT_BUCKET = 'contratos-locacoes-docs';
export const REMITTANCE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const REMITTANCE_DOCUMENT_EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const REMITTANCE_DOCUMENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export interface ContractsLocacoesRemittanceDocumentClient {
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

export type RemittanceDocumentUploadErrorState =
  | 'persistence_failed_object_removed'
  | 'cleanup_failed_orphan_probable'
  | 'remote_state_indeterminate';

export class RemittanceDocumentUploadError extends Error {
  constructor(
    message: string,
    public readonly state: RemittanceDocumentUploadErrorState,
    public readonly originalError: unknown
  ) {
    super(message);
    this.name = 'RemittanceDocumentUploadError';
  }
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

export function createSupabaseContractsLocacoesRemittanceDocumentClient(
  client: SupabaseClient
): ContractsLocacoesRemittanceDocumentClient {
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
        throw new Error(`Não foi possível enviar o arquivo para o Storage: ${error.message}`);
      }
    },

    async removeObject(bucket, path) {
      const { error } = await client.storage.from(bucket).remove([path]);

      if (error) {
        throw new Error(`Não foi possível remover o arquivo órfão do Storage: ${error.message}`);
      }
    },

    async createSignedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds);

      const signed = ensureData(
        data as { signedUrl: string } | null,
        error,
        'Não foi possível gerar link temporário para o documento'
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
        'Não foi possível salvar o documento da NF de remessa'
      );
    },
  };
}

function normalizeFileExtension(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toLowerCase() : '';
}

function resolveContentType(file: Pick<File, 'name' | 'type'>) {
  if (file.type && REMITTANCE_DOCUMENT_EXTENSION_BY_TYPE[file.type]) {
    return file.type;
  }

  const extension = normalizeFileExtension(file.name);
  return REMITTANCE_DOCUMENT_TYPE_BY_EXTENSION[extension] ?? null;
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

function assertRemittanceContract(contract: Contract) {
  if (contract.kind !== 'rental' || !contract.has_remittance_invoice) {
    throw new Error('O anexo da NF de remessa só está disponível para contratos de locação com NF habilitada.');
  }
}

function assertSupportedFile(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (file.size > REMITTANCE_DOCUMENT_MAX_BYTES) {
    throw new Error('O anexo da NF de remessa deve ter no máximo 10 MB.');
  }

  const contentType = resolveContentType(file);
  if (!contentType) {
    throw new Error('Use um arquivo PDF, XML, PNG ou JPG para anexar a NF de remessa.');
  }

  return contentType;
}

export function buildRemittanceInvoiceStoragePath(params: {
  organizationId: string;
  contractId: string;
  fileName: string;
  now?: Date;
}) {
  const timestamp = buildTimestampPrefix(params.now ?? new Date());
  const safeName = sanitizeFileName(params.fileName);

  return `${params.organizationId}/${params.contractId}/remittance_nf/${timestamp}-${safeName}`;
}

export function findRemittanceInvoiceDocument(documents: ContractDocument[]) {
  return documents.find((document) => document.kind === 'remittance_nf') ?? null;
}

function findRemittanceInvoiceDocumentByPath(documents: ContractDocument[], storagePath: string) {
  return documents.find(
    (document) => document.kind === 'remittance_nf' && document.storage_path === storagePath
  ) ?? null;
}

async function tryListContractDocuments(
  client: ContractsLocacoesRemittanceDocumentClient,
  organizationId: string,
  contractId: string
) {
  try {
    return {
      documents: await client.listContractDocuments(organizationId, contractId),
      error: null,
    };
  } catch (error) {
    return { documents: null, error };
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

async function reconcileFailedDocumentInsert(params: {
  client: ContractsLocacoesRemittanceDocumentClient;
  organizationId: string;
  contractId: string;
  storagePath: string;
  insertError: unknown;
}) {
  const { client, organizationId, contractId, storagePath, insertError } = params;
  const firstLookup = await tryListContractDocuments(client, organizationId, contractId);
  const exactDocument = firstLookup.documents
    ? findRemittanceInvoiceDocumentByPath(firstLookup.documents, storagePath)
    : null;

  if (exactDocument) {
    return exactDocument;
  }

  const winningDocument = firstLookup.documents
    ? findRemittanceInvoiceDocument(firstLookup.documents)
    : null;

  try {
    await client.removeObject(REMITTANCE_DOCUMENT_BUCKET, storagePath);
  } catch (cleanupError) {
    const finalLookup = await tryListContractDocuments(client, organizationId, contractId);
    const finalExactDocument = finalLookup.documents
      ? findRemittanceInvoiceDocumentByPath(finalLookup.documents, storagePath)
      : null;

    if (finalExactDocument) {
      return finalExactDocument;
    }

    if (!finalLookup.documents) {
      throw new RemittanceDocumentUploadError(
        `Falha ao persistir o anexo e não foi possível confirmar o estado remoto após a falha de limpeza. Insert: ${getErrorMessage(insertError)}. Cleanup: ${getErrorMessage(cleanupError)}. Consulta final: ${getErrorMessage(finalLookup.error)}.`,
        'remote_state_indeterminate',
        { insertError, cleanupError, lookupError: finalLookup.error }
      );
    }

    const finalWinner = findRemittanceInvoiceDocument(finalLookup.documents);
    const stateDescription = finalWinner
      ? `Existe outro anexo registrado no path ${finalWinner.storage_path}, mas o objeto perdedor pode ter permanecido no Storage.`
      : 'Nenhum anexo registrado foi encontrado e o objeto órfão provavelmente permaneceu no Storage.';

    throw new RemittanceDocumentUploadError(
      `Falha de persistência e falha de limpeza do upload. ${stateDescription} Insert: ${getErrorMessage(insertError)}. Cleanup: ${getErrorMessage(cleanupError)}.`,
      'cleanup_failed_orphan_probable',
      { insertError, cleanupError }
    );
  }

  if (winningDocument) {
    return winningDocument;
  }

  throw new RemittanceDocumentUploadError(
    `Não foi possível persistir o anexo da NF de remessa, mas o objeto órfão foi removido com sucesso. Insert: ${getErrorMessage(insertError)}.`,
    'persistence_failed_object_removed',
    insertError
  );
}

export async function loadRemittanceInvoiceDocument(
  client: ContractsLocacoesRemittanceDocumentClient,
  contract: Contract
) {
  if (contract.kind !== 'rental' || !contract.has_remittance_invoice) {
    return null;
  }

  const organizationId = contract.organization_id || await client.getCurrentOrganizationId();
  const documents = await client.listContractDocuments(organizationId, contract.id);
  return findRemittanceInvoiceDocument(documents);
}

export async function saveRemittanceInvoiceDocument(
  client: ContractsLocacoesRemittanceDocumentClient,
  contract: Contract,
  file: File,
  options: { now?: Date } = {}
) {
  assertRemittanceContract(contract);

  const contentType = assertSupportedFile(file);
  const organizationId = contract.organization_id || await client.getCurrentOrganizationId();
  const userId = await client.getCurrentUserId();
  const documents = await client.listContractDocuments(organizationId, contract.id);
  const existingDocument = findRemittanceInvoiceDocument(documents);

  if (existingDocument) {
    throw new Error('Este contrato já possui um anexo principal da NF de remessa. A substituição será tratada em etapa futura.');
  }

  const storagePath = buildRemittanceInvoiceStoragePath({
    organizationId,
    contractId: contract.id,
    fileName: file.name,
    now: options.now,
  });

  await client.uploadObject(REMITTANCE_DOCUMENT_BUCKET, storagePath, file, {
    contentType,
    upsert: false,
  });

  try {
    return await client.insertContractDocument({
      organization_id: organizationId,
      contract_id: contract.id,
      billing_cycle_id: null,
      inspection_id: null,
      kind: 'remittance_nf',
      storage_path: storagePath,
      file_name: file.name,
      content_type: contentType,
      created_by: userId,
    });
  } catch (insertError) {
    return reconcileFailedDocumentInsert({
      client,
      organizationId,
      contractId: contract.id,
      storagePath,
      insertError,
    });
  }
}

export async function getRemittanceInvoiceSignedUrl(
  client: ContractsLocacoesRemittanceDocumentClient,
  document: ContractDocument
) {
  return client.createSignedUrl(REMITTANCE_DOCUMENT_BUCKET, document.storage_path, 60 * 30);
}
