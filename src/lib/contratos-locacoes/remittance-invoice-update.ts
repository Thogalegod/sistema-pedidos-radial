import type { ContractsLocacoesMutationClient } from './mutations';
import { getContractCompanyLabel } from './company';
import type { Contract } from './types';

export interface RemittanceInvoiceUpdateInput {
  has_remittance_invoice: boolean;
  remittance_invoice_number: string | null;
  remittance_invoice_amount: string | null;
  remittance_invoice_issue_date: string | null;
}

export interface RemittanceInvoiceUpdateOptions {
  hasAttachedDocument: boolean;
}

export async function updateRemittanceInvoice(
  client: ContractsLocacoesMutationClient,
  contract: Contract,
  input: RemittanceInvoiceUpdateInput,
  options: RemittanceInvoiceUpdateOptions
): Promise<Contract> {
  if (!input.has_remittance_invoice && options.hasAttachedDocument) {
    throw new Error('Não é possível marcar como sem NF de remessa enquanto existir um arquivo anexado.');
  }

  if (
    input.has_remittance_invoice &&
    (!input.remittance_invoice_number?.trim() ||
      !input.remittance_invoice_amount?.trim() ||
      !input.remittance_invoice_issue_date?.trim())
  ) {
    throw new Error('Preencha número, valor e data de emissão da NF de remessa.');
  }

  const organizationId = await client.getCurrentOrganizationId();

  return client.updateContract(contract.id, {
    organization_id: organizationId,
    has_remittance_invoice: input.has_remittance_invoice,
    remittance_invoice_number: input.has_remittance_invoice ? input.remittance_invoice_number : null,
    remittance_invoice_issuer: input.has_remittance_invoice
      ? getContractCompanyLabel(contract.contract_company)
      : null,
    remittance_invoice_amount: input.has_remittance_invoice ? input.remittance_invoice_amount : null,
    remittance_invoice_issue_date: input.has_remittance_invoice ? input.remittance_invoice_issue_date : null,
  });
}
