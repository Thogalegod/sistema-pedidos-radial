import type { ContractMutationResult } from './mutations';
import type { Contract, ContractDocument } from './types';

interface CreateContractWithOptionalRemittanceInput {
  createContract: () => Promise<ContractMutationResult>;
  remittanceInvoiceFile: File | null;
  uploadRemittanceDocument: (contract: Contract, file: File) => Promise<ContractDocument>;
}

export interface CreateContractWithOptionalRemittanceOutcome {
  creation: ContractMutationResult;
  remittanceDocument: ContractDocument | null;
  remittanceUploadError: Error | null;
}

export async function createContractWithOptionalRemittance(
  input: CreateContractWithOptionalRemittanceInput
): Promise<CreateContractWithOptionalRemittanceOutcome> {
  const creation = await input.createContract();

  if (!input.remittanceInvoiceFile) {
    return {
      creation,
      remittanceDocument: null,
      remittanceUploadError: null,
    };
  }

  try {
    const remittanceDocument = await input.uploadRemittanceDocument(
      creation.contract,
      input.remittanceInvoiceFile
    );

    return {
      creation,
      remittanceDocument,
      remittanceUploadError: null,
    };
  } catch (error) {
    return {
      creation,
      remittanceDocument: null,
      remittanceUploadError: error instanceof Error
        ? error
        : new Error('Não foi possível anexar a NF de remessa.'),
    };
  }
}
