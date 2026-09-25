import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingCycle, Contract, ContractDocument, DbBigInt } from './types';

export const BOLETO_DOCUMENT_BUCKET = 'contratos-locacoes-docs';
export const BOLETO_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const BOLETO_SIGNED_URL_SECONDS = 30 * 60;

export interface BoletoChangeInput {
  organizationId: string;
  contractId: string;
  billingCycleId: string;
  operationId: string;
}

export type BoletoChangeBeginResult = {
  status: 'pending' | 'already_finished';
  operation_id: string;
  started_at: string | null;
  content_revision: DbBigInt;
};

export type BoletoChangeFinishResult = {
  document: ContractDocument;
  billing: BillingCycle;
  already_finished: boolean;
};

export interface ContractsLocacoesBoletoDocumentClient {
  listBoletoDocuments(organizationId: string, contractId: string): Promise<ContractDocument[]>;
  uploadObject(
    bucket: string,
    path: string,
    file: File,
    options: { contentType: 'application/pdf'; upsert: boolean }
  ): Promise<void>;
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
  beginBoletoChange(input: BoletoChangeInput): Promise<BoletoChangeBeginResult>;
  finishBoletoChange(input: BoletoChangeInput): Promise<BoletoChangeFinishResult>;
}

export function buildBoletoStoragePath(input: Omit<BoletoChangeInput, 'operationId'>) {
  return `${input.organizationId}/${input.contractId}/boleto/${input.billingCycleId}.pdf`;
}

export function createBoletoChangeOperationId() {
  return crypto.randomUUID();
}

function validateRelations(contract: Contract, billing: BillingCycle) {
  if (contract.organization_id !== billing.organization_id) {
    throw new Error('A cobrança e o contrato devem pertencer à mesma organização.');
  }
  if (billing.contract_id !== contract.id) {
    throw new Error('A cobrança não pertence ao contrato informado.');
  }
}

function validateBoletoFile(file: File) {
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Selecione um arquivo PDF válido.');
  }
  if (file.size > BOLETO_DOCUMENT_MAX_BYTES) {
    throw new Error('O boleto deve ter no máximo 10 MB.');
  }
}

function changeInput(contract: Contract, billing: BillingCycle, operationId: string): BoletoChangeInput {
  return {
    organizationId: contract.organization_id,
    contractId: contract.id,
    billingCycleId: billing.id,
    operationId,
  };
}

async function finishWithPendingError(
  client: ContractsLocacoesBoletoDocumentClient,
  input: BoletoChangeInput
) {
  try {
    return await client.finishBoletoChange(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'falha desconhecida';
    throw new Error(`O PDF foi enviado, mas a alteração permaneceu pendente: ${detail}`);
  }
}

async function writeBoleto(
  client: ContractsLocacoesBoletoDocumentClient,
  contract: Contract,
  billing: BillingCycle,
  file: File,
  operationId: string,
  upsert: boolean
) {
  validateRelations(contract, billing);
  validateBoletoFile(file);
  const input = changeInput(contract, billing, operationId);
  const begin = await client.beginBoletoChange(input);
  if (begin.status === 'already_finished') {
    return client.finishBoletoChange(input);
  }

  await client.uploadObject(
    BOLETO_DOCUMENT_BUCKET,
    buildBoletoStoragePath(input),
    file,
    { contentType: 'application/pdf', upsert }
  );
  return finishWithPendingError(client, input);
}

export function saveBoletoDocument(
  client: ContractsLocacoesBoletoDocumentClient,
  contract: Contract,
  billing: BillingCycle,
  file: File,
  operationId: string
) {
  return writeBoleto(client, contract, billing, file, operationId, false);
}

export function replaceBoletoDocument(
  client: ContractsLocacoesBoletoDocumentClient,
  contract: Contract,
  billing: BillingCycle,
  document: ContractDocument,
  file: File,
  operationId: string
) {
  validateRelations(contract, billing);
  const expectedPath = buildBoletoStoragePath(changeInput(contract, billing, operationId));
  if (document.kind !== 'boleto' || document.organization_id !== contract.organization_id ||
      document.contract_id !== contract.id || document.billing_cycle_id !== billing.id ||
      document.storage_path !== expectedPath) {
    throw new Error('O boleto atual não corresponde à cobrança informada.');
  }
  return writeBoleto(client, contract, billing, file, operationId, true);
}

export async function repairPendingBoletoChange(
  client: ContractsLocacoesBoletoDocumentClient,
  contract: Contract,
  billing: BillingCycle,
  file: File
) {
  validateRelations(contract, billing);
  validateBoletoFile(file);
  if (!billing.boleto_change_pending || !billing.boleto_change_operation_id) {
    throw new Error('A cobrança não possui alteração de boleto pendente.');
  }
  const input = changeInput(contract, billing, billing.boleto_change_operation_id);
  await client.uploadObject(
    BOLETO_DOCUMENT_BUCKET,
    buildBoletoStoragePath(input),
    file,
    { contentType: 'application/pdf', upsert: true }
  );
  return finishWithPendingError(client, input);
}

export function getBoletoSignedUrl(
  client: ContractsLocacoesBoletoDocumentClient,
  document: ContractDocument
) {
  if (document.kind !== 'boleto') throw new Error('Documento não é um boleto.');
  return client.createSignedUrl(BOLETO_DOCUMENT_BUCKET, document.storage_path, BOLETO_SIGNED_URL_SECONDS);
}

function requireData<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error) throw new Error(`${message}: ${error.message}`);
  if (data == null) throw new Error(message);
  return data;
}

export function createSupabaseContractsLocacoesBoletoDocumentClient(
  client: SupabaseClient
): ContractsLocacoesBoletoDocumentClient {
  return {
    async listBoletoDocuments(organizationId, contractId) {
      const { data, error } = await client.from('contract_documents').select('*')
        .eq('organization_id', organizationId).eq('contract_id', contractId).eq('kind', 'boleto');
      return requireData((data ?? []) as ContractDocument[] | null, error, 'Não foi possível carregar o boleto');
    },
    async uploadObject(bucket, path, file, options) {
      const { error } = await client.storage.from(bucket).upload(path, file, options);
      if (error) throw new Error(`Não foi possível enviar o boleto: ${error.message}`);
    },
    async createSignedUrl(bucket, path, expiresInSeconds) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      return requireData(data, error, 'Não foi possível abrir o boleto').signedUrl;
    },
    async beginBoletoChange(input) {
      const { data, error } = await client.rpc('begin_boleto_change', {
        p_organization_id: input.organizationId,
        p_contract_id: input.contractId,
        p_billing_cycle_id: input.billingCycleId,
        p_operation_id: input.operationId,
      }).single();
      return requireData(data as BoletoChangeBeginResult | null, error, 'Não foi possível iniciar a alteração do boleto');
    },
    async finishBoletoChange(input) {
      const { data, error } = await client.rpc('finish_boleto_change', {
        p_organization_id: input.organizationId,
        p_contract_id: input.contractId,
        p_billing_cycle_id: input.billingCycleId,
        p_operation_id: input.operationId,
      }).single();
      return requireData(data as BoletoChangeFinishResult | null, error, 'Não foi possível concluir a alteração do boleto');
    },
  };
}
