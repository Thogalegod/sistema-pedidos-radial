import { describe, expect, it } from 'vitest';
import {
  CONTRACT_EDIT_LOCKED_MESSAGE,
  assertSafeContractEdit,
  buildContractEditInput,
  type ContractEditInput,
} from './contract-edit';
import type { Contract, RentalItem } from './types';

const contract: Contract = {
  id: 'contract-1', organization_id: 'org-1', internal_number: '8', kind: 'rental',
  contract_company: 'fontes', customer_id: 'customer-1', site_id: 'site-1',
  legacy_order_number: 'PED-8', transport_notes: 'Frete atual', has_remittance_invoice: false,
  remittance_invoice_number: null, remittance_invoice_issuer: null, remittance_invoice_amount: null,
  remittance_invoice_issue_date: null, start_date: '2026-08-01', end_date: null,
  recurrence_days: 30, pricing_model: 'fixed', base_amount: '300000', percentage_rate: null,
  status: 'active', pause_started_at: null, pause_reason: null, notes: 'Nota atual',
  created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z',
};

const item: RentalItem = {
  id: 'item-1', organization_id: 'org-1', contract_id: 'contract-1', asset_id: 'asset-1',
  description: 'Transformador', equipment_type: 'Transformador', capacity: '75 kVA',
  serial_number: 'SER-1', internal_code: 'AT-1', quantity: 1, unit_amount: '300000',
  status: 'rented', returned_at: null, future_inventory_item_id: null,
  created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z',
};

function input(patch: Partial<ContractEditInput> = {}): ContractEditInput {
  return { ...buildContractEditInput(contract, [item]), ...patch };
}

describe('safe rental editing rules', () => {
  it('normalizes a numeric unit amount received at runtime to string cents for editing', () => {
    const runtimeItem = { ...item, unit_amount: 300000 } as unknown as RentalItem;

    expect(buildContractEditInput(contract, [runtimeItem]).items[0].unit_amount).toBe('300000');
  });

  it('allows structural edits and item replacement before the first billing', () => {
    const next = input({
      contract_company: 'radial', customer_id: 'customer-2', site_id: 'site-2',
      start_date: '2026-08-10', legacy_order_number: 'PED-9',
      items: [{
        id: 'new-item', asset_id: null, description: 'Gerador', equipment_type: 'Gerador',
        capacity: '50 kVA', serial_number: null, internal_code: 'MAN-1', quantity: 2,
        unit_amount: '250000',
      }],
    });

    expect(() => assertSafeContractEdit(contract, [item], false, next)).not.toThrow();
  });

  it.each([
    ['empresa', { contract_company: 'radial' }],
    ['cliente', { customer_id: 'customer-2' }],
    ['obra', { site_id: 'site-2' }],
    ['início', { start_date: '2026-08-10' }],
    ['pedido preenchido', { legacy_order_number: 'PED-9' }],
  ] as const)('blocks %s after a billing exists', (_label, patch) => {
    expect(() => assertSafeContractEdit(contract, [item], true, input(patch))).toThrow(CONTRACT_EDIT_LOCKED_MESSAGE);
  });

  it('blocks adding, removing, swapping or changing the identity and quantity of billed items', () => {
    const base = input();
    const forbiddenItems = [
      [],
      [...base.items, { ...base.items[0], id: 'item-2' }],
      [{ ...base.items[0], asset_id: 'asset-2' }],
      [{ ...base.items[0], description: 'Outro transformador' }],
      [{ ...base.items[0], quantity: 2 }],
    ];

    forbiddenItems.forEach((items) => {
      expect(() => assertSafeContractEdit(contract, [item], true, input({ items }))).toThrow(CONTRACT_EDIT_LOCKED_MESSAGE);
    });
  });

  it('allows transport, notes and existing item prices after billing without changing structure', () => {
    const next = input({
      transport_notes: 'Retirada pelo cliente',
      notes: 'Acesso pelo portão B',
      items: [{ ...input().items[0], unit_amount: '350000' }],
    });

    expect(() => assertSafeContractEdit(contract, [item], true, next)).not.toThrow();
  });

  it('allows a billed historical rental with no order to fill it once', () => {
    const historical = { ...contract, legacy_order_number: null };
    const next = buildContractEditInput(historical, [item]);
    next.legacy_order_number = 'PED-LEGADO';

    expect(() => assertSafeContractEdit(historical, [item], true, next)).not.toThrow();
  });
});
