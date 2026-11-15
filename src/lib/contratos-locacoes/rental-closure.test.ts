import { describe, expect, it } from 'vitest';
import {
  assertCanCloseContract,
  assertValidReturnDate,
  getPendingPhysicalReturnItems,
} from './rental-closure';
import type { Contract, RentalItem } from './types';

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    organization_id: 'org-1',
    internal_number: '1',
    kind: 'rental',
    contract_company: 'fontes',
    customer_id: 'customer-1',
    site_id: 'site-1',
    legacy_order_number: null,
    transport_notes: null,
    has_remittance_invoice: false,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
    start_date: '2026-08-10',
    end_date: '2026-08-20',
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '100000',
    percentage_rate: null,
    status: 'awaiting_return',
    pause_started_at: null,
    pause_reason: null,
    notes: null,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<RentalItem> = {}): RentalItem {
  return {
    id: 'item-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    asset_id: 'asset-1',
    description: 'Gerador cadastrado',
    equipment_type: 'Gerador',
    capacity: '150 kVA',
    serial_number: 'SN-1',
    internal_code: 'RAD-1',
    quantity: 1,
    unit_amount: '100000',
    status: 'rented',
    returned_at: null,
    future_inventory_item_id: null,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('rental closure rules', () => {
  it('detects physical assets still waiting for return', () => {
    expect(getPendingPhysicalReturnItems([
      makeItem({ id: 'physical-pending', asset_id: 'asset-1', returned_at: null }),
      makeItem({ id: 'physical-returned', asset_id: 'asset-2', returned_at: '2026-08-20' }),
      makeItem({ id: 'legacy-manual', asset_id: null, returned_at: null, quantity: 4 }),
    ]).map((item) => item.id)).toEqual(['physical-pending']);
  });

  it('does not allow closing while a physical asset is pending return', () => {
    expect(() => assertCanCloseContract([makeItem({ returned_at: null })]))
      .toThrow(/devolucao pendente/i);
  });

  it('allows closing when all physical assets were returned', () => {
    expect(() => assertCanCloseContract([makeItem({ status: 'returned', returned_at: '2026-08-20' })]))
      .not.toThrow();
  });

  it('allows closing a contract without physical assets', () => {
    expect(() => assertCanCloseContract([makeItem({ asset_id: null, returned_at: null, quantity: 3 })]))
      .not.toThrow();
  });

  it('rejects returned_at before the contract start_date', () => {
    expect(() => assertValidReturnDate(makeContract(), makeItem(), '2026-08-09'))
      .toThrow(/anterior ao inicio/i);
  });

  it('rejects returned_at before the configured contract end_date', () => {
    expect(() => assertValidReturnDate(makeContract({ end_date: '2026-08-20' }), makeItem(), '2026-08-19'))
      .toThrow(/anterior ao termino/i);
  });
});
