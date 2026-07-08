import { describe, expect, it } from 'vitest';
import {
  contractDraftSchema,
  pauseContractSchema,
  reactivateContractSchema,
} from './schemas';

describe('contract schemas', () => {
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
  });

  it('normalizes manual rental items and validates recurrence', () => {
    const parsed = contractDraftSchema.parse({
      kind: 'rental',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-10',
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
