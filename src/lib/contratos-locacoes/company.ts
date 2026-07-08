import type { ContractCompany } from './types';

export const CONTRACT_COMPANY_OPTIONS = [
  { value: 'fontes', label: 'Fontes' },
  { value: 'radial', label: 'Radial' },
] as const satisfies ReadonlyArray<{
  value: ContractCompany;
  label: string;
}>;

const CONTRACT_COMPANY_LABELS: Record<ContractCompany, string> = {
  fontes: 'Fontes',
  radial: 'Radial',
};

export function getContractCompanyLabel(company: ContractCompany | null | undefined) {
  return company ? CONTRACT_COMPANY_LABELS[company] : CONTRACT_COMPANY_LABELS.fontes;
}
