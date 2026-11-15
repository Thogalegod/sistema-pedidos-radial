import { describe, expect, it } from 'vitest';
import {
  contractDraftSchema,
  customerRecordSchema,
  customerDraftSchema,
  newRentalContractDraftSchema,
} from './schemas';

function rentalDraft(legacyOrderNumber: string | null) {
  return {
    kind: 'rental' as const,
    contract_company: 'fontes' as const,
    customer_id: 'customer-1',
    site_id: 'site-1',
    legacy_order_number: legacyOrderNumber,
    transport_notes: null,
    has_remittance_invoice: false,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
    start_date: '2026-08-18',
    end_date: null,
    recurrence_days: 30,
    pricing_model: 'fixed' as const,
    base_amount: '100000',
    percentage_rate: null,
    status: 'active' as const,
    notes: null,
    items: [{
      id: 'item-1',
      asset_id: null,
      description: 'Transformador',
      equipment_type: 'Transformador',
      capacity: '75 kVA',
      serial_number: null,
      internal_code: null,
      quantity: 1,
      unit_amount: '100000',
      status: 'rented' as const,
      notes: null,
    }],
  };
}

describe('rental creation schema', () => {
  it('rejects a new rental without an order number', () => {
    const result = newRentalContractDraftSchema.safeParse(rentalDraft(null));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Nº do pedido é obrigatório');
  });

  it('accepts a new rental with an order number while historical null data remains loadable', () => {
    expect(newRentalContractDraftSchema.safeParse(rentalDraft('20260807')).success).toBe(true);
    expect(contractDraftSchema.safeParse(rentalDraft(null)).success).toBe(true);
  });
});

describe('customer schemas', () => {
  it('normalizes customer, site and contact data for central registration', () => {
    const parsed = customerDraftSchema.parse({
      legal_name: 'Radial Energia LTDA',
      trade_name: '',
      tax_id: '12.345.678/0001-90',
      state_registration: '',
      municipal_registration: '',
      notes: '',
      active: true,
      sites: [
        {
          id: 'site-1',
          name: 'Obra Matriz',
          address_line: 'Rua A',
          number: '100',
          complement: '',
          district: 'Centro',
          city: 'Campinas',
          state: 'sp',
          postal_code: '13000-000',
          notes: '',
          active: true,
        },
      ],
      contacts: [
        {
          id: 'contact-1',
          name: 'Joana',
          job_title: '',
          department: '',
          phone: '',
          whatsapp: '',
          email: '',
          site_id: null,
          is_primary: true,
          receives_billing: true,
          receives_technical: false,
          notes: '',
        },
      ],
    });

    expect(parsed.trade_name).toBe('Radial Energia LTDA');
    expect(parsed.tax_id).toBe('12345678000190');
    expect(parsed.state_registration).toBeNull();
    expect(parsed.sites[0].state).toBe('SP');
    expect(parsed.sites[0].complement).toBeNull();
    expect(parsed.contacts[0].email).toBeNull();
    expect(parsed.contacts[0].site_id).toBeNull();
  });

  it('rejects an invalid customer payload', () => {
    expect(() =>
      customerDraftSchema.parse({
        legal_name: '',
        trade_name: '',
        tax_id: 'abc',
        active: true,
        sites: [],
        contacts: [
          {
            id: 'contact-1',
            name: '',
            email: 'not-an-email',
            site_id: null,
            is_primary: false,
            receives_billing: false,
            receives_technical: false,
            active: true,
          },
        ],
      })
    ).toThrow();
  });

  it('fills trade name with legal name when record schema receives blank value', () => {
    const parsed = customerRecordSchema.parse({
      legal_name: 'Cliente Sem Fantasia',
      trade_name: '   ',
      tax_id: '',
      state_registration: '',
      municipal_registration: '',
      notes: '',
      active: true,
    });

    expect(parsed.trade_name).toBe('Cliente Sem Fantasia');
    expect(parsed.tax_id).toBeNull();
  });
});
