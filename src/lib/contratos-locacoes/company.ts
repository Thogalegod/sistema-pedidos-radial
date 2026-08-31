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

export interface BillingCompanyProfile {
  key: ContractCompany;
  legalName: string;
  taxId: string;
  stateRegistration: string;
  municipalRegistration: string | null;
  address: readonly string[];
  contacts: readonly string[];
  banking: {
    bank: string;
    agency: string;
    account: string;
  };
}

const BILLING_COMPANY_PROFILES: Record<ContractCompany, BillingCompanyProfile> = {
  fontes: {
    key: 'fontes',
    legalName: 'FONTES ENERGIA COMÉRCIO E MANUTENÇÃO LTDA',
    taxId: '13.318.529/0001-08',
    stateRegistration: '379.076.526.115',
    municipalRegistration: '35.2.2520868-6',
    address: [
      'Estrada São Miguel Arcanjo, 140',
      'Veraneio Maracanã',
      'Itaquaquecetuba/SP',
      'CEP 08582-500',
    ],
    contacts: [
      'Fone: (11) 2941-4775 · WhatsApp: (11) 99837-2639',
      'www.radialenergia.com.br · thomas@radialenergia.com.br',
    ],
    banking: {
      bank: 'Banco Itaú',
      agency: '0709',
      account: '06.339-0',
    },
  },
  radial: {
    key: 'radial',
    legalName: 'RADIAL EQUIPAMENTOS ELÉTRICOS LTDA - ME',
    taxId: '11.215.564/0001-68',
    stateRegistration: '148.827.040.110',
    municipalRegistration: null,
    address: [
      'R. Maracatuba, 1A',
      'Chácara Califórnia',
      'São Paulo/SP',
      'CEP 03404-130',
    ],
    contacts: [
      'Fone: (11) 2941-4775 · WhatsApp: (11) 99837-2639',
      'www.radialenergia.com.br · thomas@radialenergia.com.br',
    ],
    banking: {
      bank: 'Banco Itaú',
      agency: '0709',
      account: '63.881-1',
    },
  },
};

export function getContractCompanyLabel(company: ContractCompany | null | undefined) {
  return company ? CONTRACT_COMPANY_LABELS[company] : CONTRACT_COMPANY_LABELS.fontes;
}

export function getBillingCompanyProfile(company: ContractCompany): BillingCompanyProfile {
  return BILLING_COMPANY_PROFILES[company];
}
