import { describe, expect, it } from 'vitest';
import {
  contractDraftSchema,
  pauseContractSchema,
  reactivateContractSchema,
} from './schemas';

describe('contract schemas', () => {
  it('defaults contract_company to fontes and accepts radial', () => {
    const parsed = contractDraftSchema.parse({
      kind: 'energy_management',
      contract_company: 'radial',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: '',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'draft',
      notes: '',
      items: [],
    } as any);

    const defaulted = contractDraftSchema.parse({
      kind: 'energy_management',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: '',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '150000',
      percentage_rate: '',
      status: 'draft',
      notes: '',
      items: [],
    } as any);

    expect((parsed as any).contract_company).toBe('radial');
    expect((defaulted as any).contract_company).toBe('fontes');
  });

  it('requires at least one manual item for rental contracts', () => {
    expect(() =>
      contractDraftSchema.parse({
        kind: 'rental',
        customer_id: 'customer-1',
        site_id: 'site-1',
        legacy_order_number: '',
        start_date: '2026-07-06',
        end_date: '',
        recurrence_days: 30,
        pricing_model: 'fixed',
        base_amount: '150000',
        percentage_rate: '',
        status: 'draft',
        notes: '',
        items: [],
      })
    ).toThrow(/item/i);
  });

  it('accepts recurring service without equipment items', () => {
    const parsed = contractDraftSchema.parse({
      kind: 'recurring_service',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: '',
      transport_notes: 'Entrega por transportadora parceira',
      has_remittance_invoice: false,
      remittance_invoice_number: 'NF-123',
      remittance_invoice_issuer: 'Radial Energia',
      remittance_invoice_amount: '250000',
      remittance_invoice_issue_date: '2026-07-05',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '50000',
      percentage_rate: '',
      status: 'active',
      notes: '',
      items: [],
    });

    expect(parsed.items).toHaveLength(0);
    expect(parsed.kind).toBe('recurring_service');
    expect(parsed.transport_notes).toBe('Entrega por transportadora parceira');
    expect(parsed.has_remittance_invoice).toBe(false);
    expect(parsed.remittance_invoice_number).toBeNull();
    expect(parsed.remittance_invoice_issuer).toBeNull();
    expect(parsed.remittance_invoice_amount).toBeNull();
    expect(parsed.remittance_invoice_issue_date).toBeNull();
  });

  it('normalizes manual rental items and remittance invoice data', () => {
    const parsed = contractDraftSchema.parse({
      kind: 'rental',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-10',
      transport_notes: 'Retira por conta do cliente',
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-2026-10',
      remittance_invoice_issuer: 'Radial Energia LTDA',
      remittance_invoice_amount: '250000',
      remittance_invoice_issue_date: '2026-07-05',
      start_date: '2026-07-06',
      end_date: '',
      recurrence_days: 45,
      pricing_model: 'fixed_plus_variable',
      base_amount: '120000',
      percentage_rate: '5.5',
      status: 'draft',
      notes: '',
      items: [
        {
          id: 'item-1',
          description: 'Gerador',
          equipment_type: 'Gerador',
          capacity: '150 kVA',
          serial_number: '',
          internal_code: '',
          quantity: 2,
          unit_amount: '25000',
          status: 'rented',
          notes: '',
        },
      ],
    });

    expect(parsed.percentage_rate).toBe('5.5');
    expect(parsed.items[0].serial_number).toBeNull();
    expect(parsed.items[0].unit_amount).toBe('25000');
    expect(parsed.transport_notes).toBe('Retira por conta do cliente');
    expect(parsed.remittance_invoice_amount).toBe('250000');
    expect(parsed.remittance_invoice_issue_date).toBe('2026-07-05');
  });

  it('requires all remittance invoice fields when the toggle is enabled', () => {
    expect(() =>
      contractDraftSchema.parse({
        kind: 'rental',
        customer_id: 'customer-1',
        site_id: 'site-1',
        legacy_order_number: '',
        transport_notes: '',
        has_remittance_invoice: true,
        remittance_invoice_number: '',
        remittance_invoice_issuer: '',
        remittance_invoice_amount: '',
        remittance_invoice_issue_date: '',
        start_date: '2026-07-06',
        end_date: '',
        recurrence_days: 30,
        pricing_model: 'fixed',
        base_amount: '120000',
        percentage_rate: '',
        status: 'draft',
        notes: '',
        items: [
          {
            id: 'item-1',
            description: 'Gerador',
            equipment_type: 'Gerador',
            capacity: '150 kVA',
            serial_number: '',
            internal_code: '',
            quantity: 1,
            unit_amount: '25000',
            status: 'rented',
            notes: '',
          },
        ],
      })
    ).toThrow(/nota fiscal de remessa/i);
  });

  it('validates pause and reactivation payloads', () => {
    const paused = pauseContractSchema.parse({
      pause_started_at: '2026-07-10',
      pause_reason: 'Cliente pediu pausa temporária',
    });
    const resumed = reactivateContractSchema.parse({
      reactivated_at: '2026-07-20',
    });

    expect(paused.pause_reason).toContain('Cliente');
    expect(resumed.reactivated_at).toBe('2026-07-20');
  });
});
