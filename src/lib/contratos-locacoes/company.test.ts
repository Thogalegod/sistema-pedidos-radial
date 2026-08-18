import { describe, expect, it } from 'vitest';

describe('billing company profiles', () => {
  it.each([
    ['fontes', {
      legalName: 'FONTES ENERGIA COMÉRCIO E MANUTENÇÃO LTDA',
      taxId: '13.318.529/0001-08',
      stateRegistration: '379.076.526.115',
      municipalRegistration: '35.2.2520868-6',
      bankAccount: '06.339-0',
    }],
    ['radial', {
      legalName: 'RADIAL EQUIPAMENTOS ELÉTRICOS LTDA - ME',
      taxId: '11.215.564/0001-68',
      stateRegistration: '148.827.040.110',
      municipalRegistration: null,
      bankAccount: '63.881-1',
    }],
  ] as const)('selects the approved %s issuer profile', async (company, expected) => {
    const companyModule = await import('./company') as typeof import('./company') & {
      getBillingCompanyProfile?: (value: 'fontes' | 'radial') => {
        legalName: string;
        taxId: string;
        stateRegistration: string;
        municipalRegistration: string | null;
        address: readonly string[];
        contacts: readonly string[];
        banking: { bank: string; agency: string; account: string };
      };
    };

    expect(companyModule.getBillingCompanyProfile).toBeTypeOf('function');
    const profile = companyModule.getBillingCompanyProfile?.(company);
    expect(profile).toMatchObject({
      legalName: expected.legalName,
      taxId: expected.taxId,
      stateRegistration: expected.stateRegistration,
      municipalRegistration: expected.municipalRegistration,
      banking: {
        bank: 'Banco Itaú',
        agency: '0709',
        account: expected.bankAccount,
      },
    });
    expect(profile?.address).toHaveLength(4);
    expect(profile?.contacts).toEqual([
      'Fone: (11) 2941-4775 · WhatsApp: (11) 99837-2639',
      'www.radialenergia.com.br · thomas@radialenergia.com.br',
    ]);
  });
});
