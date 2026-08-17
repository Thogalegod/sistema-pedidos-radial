import { describe, expect, it } from 'vitest';
import {
  billingPeriodsOverlap,
  buildNextMonthlyBillingPeriod,
  findBillingPeriodConflict,
  suggestBillingAmountFromItems,
} from './billing-periods';
import type { BillingCycle, RentalItem } from './types';

describe('monthly billing period helpers', () => {
  it('suggests the first monthly period from the contract start date', () => {
    expect(buildNextMonthlyBillingPeriod({
      contractStartDate: '2026-08-08',
      existingBillingCycles: [],
      issueDate: '2026-08-08',
    })).toMatchObject({
      period_start: '2026-08-08',
      period_end: '2026-09-07',
      issue_date: '2026-08-08',
      due_date: '2026-09-07',
      sequence_number: 1,
    });
  });

  it('suggests the next monthly period after the latest period end', () => {
    expect(buildNextMonthlyBillingPeriod({
      contractStartDate: '2026-08-08',
      existingBillingCycles: [
        makeBilling({ sequence_number: 1, period_start: '2026-08-08', period_end: '2026-09-07' }),
      ],
      issueDate: '2026-09-08',
    })).toMatchObject({
      period_start: '2026-09-08',
      period_end: '2026-10-07',
      issue_date: '2026-09-08',
      due_date: '2026-10-07',
      sequence_number: 2,
    });
  });

  it('keeps normal periods before the contract end date unchanged', () => {
    expect(buildNextMonthlyBillingPeriod({
      contractStartDate: '2026-07-01',
      contractEndDate: '2026-09-20',
      existingBillingCycles: [],
      issueDate: '2026-07-01',
    })).toMatchObject({
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      due_date: '2026-07-31',
      sequence_number: 1,
    });
  });

  it('truncates the last period at the contract end date', () => {
    expect(buildNextMonthlyBillingPeriod({
      contractStartDate: '2026-07-01',
      contractEndDate: '2026-08-20',
      existingBillingCycles: [
        makeBilling({ sequence_number: 1, period_start: '2026-07-01', period_end: '2026-07-31' }),
      ],
      issueDate: '2026-08-01',
    })).toMatchObject({
      period_start: '2026-08-01',
      period_end: '2026-08-20',
      due_date: '2026-08-20',
      sequence_number: 2,
    });
  });

  it.each(['awaiting_return', 'closed'] as const)(
    'does not suggest a period after end_date for %s contracts',
    (status) => {
      expect(buildNextMonthlyBillingPeriod({
        contractStartDate: '2026-07-01',
        contractEndDate: '2026-08-20',
        existingBillingCycles: [
          makeBilling({
            sequence_number: 1,
            period_start: '2026-07-01',
            period_end: '2026-07-31',
            status: 'issued',
          }),
          makeBilling({
            sequence_number: 2,
            period_start: '2026-08-01',
            period_end: '2026-08-20',
            status: status === 'closed' ? 'paid' : 'issued',
          }),
        ],
        issueDate: '2026-08-21',
      })).toBeNull();
    }
  );

  it('handles month length differences without using a fixed 30 day interval', () => {
    expect(requireBillingPeriod(buildNextMonthlyBillingPeriod({
      contractStartDate: '2026-01-31',
      existingBillingCycles: [],
      issueDate: '2026-01-31',
    })).period_end).toBe('2026-02-27');

    expect(requireBillingPeriod(buildNextMonthlyBillingPeriod({
      contractStartDate: '2028-01-31',
      existingBillingCycles: [],
      issueDate: '2028-01-31',
    })).period_end).toBe('2028-02-28');
  });

  it('detects duplicate and overlapping periods for creation and editing', () => {
    const existing = [
      makeBilling({ id: 'billing-1', period_start: '2026-08-08', period_end: '2026-09-07' }),
      makeBilling({ id: 'billing-2', period_start: '2026-09-08', period_end: '2026-10-07' }),
    ];

    expect(findBillingPeriodConflict(existing, {
      period_start: '2026-08-08',
      period_end: '2026-09-07',
    })?.type).toBe('duplicate');

    expect(findBillingPeriodConflict(existing, {
      period_start: '2026-09-01',
      period_end: '2026-09-30',
    })?.type).toBe('overlap');

    expect(findBillingPeriodConflict(existing, {
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      ignoreBillingCycleId: 'billing-1',
    })?.type).toBe('overlap');

    expect(findBillingPeriodConflict(existing, {
      period_start: '2026-08-09',
      period_end: '2026-09-06',
      ignoreBillingCycleId: 'billing-1',
    })).toBeNull();

    expect(billingPeriodsOverlap(
      { period_start: '2026-08-08', period_end: '2026-09-07' },
      { period_start: '2026-09-08', period_end: '2026-10-07' }
    )).toBe(false);
  });

  it('suggests the amount from current rental item subtotals', () => {
    expect(suggestBillingAmountFromItems([
      makeItem({ quantity: 2, unit_amount: '150000' }),
      makeItem({ quantity: 1, unit_amount: '25000' }),
    ])).toBe('325000');
  });
});

function requireBillingPeriod(period: ReturnType<typeof buildNextMonthlyBillingPeriod>) {
  expect(period).not.toBeNull();
  return period!;
}

function makeBilling(overrides: Partial<BillingCycle> = {}): BillingCycle {
  return {
    id: 'billing-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    sequence_number: 1,
    period_start: '2026-08-08',
    period_end: '2026-09-07',
    issue_date: '2026-08-08',
    due_date: '2026-09-07',
    base_amount: '300000',
    discount_amount: '0',
    surcharge_amount: '0',
    exemption_amount: '0',
    total_amount: '300000',
    document_type: 'receipt',
    document_number: 'R000001001',
    status: 'issued',
    sent_at: null,
    notes: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<RentalItem> = {}): RentalItem {
    return {
      id: 'item-1',
      organization_id: 'org-1',
      contract_id: 'contract-1',
      asset_id: null,
      description: 'Transformador',
      equipment_type: 'Transformador',
      capacity: '',
    serial_number: '',
    internal_code: '',
    quantity: 1,
    unit_amount: '100000',
    status: 'rented',
    returned_at: null,
    future_inventory_item_id: null,
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}
