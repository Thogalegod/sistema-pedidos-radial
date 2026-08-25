import { describe, expect, it } from 'vitest';
import {
  billingPeriodsOverlap,
  buildRentalItemBillingLines,
  buildNextMonthlyBillingPeriod,
  findBillingPeriodConflict,
  resolveRentalBillingCoverage,
  selectLatestBillingCoveragePeriod,
  sortContractsByBillingPriority,
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

  it('builds one recurring billing line per rental item with commercial descriptions', () => {
    const ids = ['line-1', 'line-2'];
    const lines = buildRentalItemBillingLines([
      makeItem({
        id: 'item-1',
        description: 'Transformador 500 kVA 13,8 kV / 380-220 V',
        equipment_type: 'Transformador',
        capacity: '500 kVA',
        serial_number: 'ABC123',
        internal_code: 'CODIGO-INTERNO-1',
        unit_amount: '150000',
      }),
      makeItem({
        id: 'item-2',
        description: '',
        equipment_type: 'Transformador',
        capacity: '300 kVA',
        serial_number: 'XYZ789',
        internal_code: 'CODIGO-INTERNO-2',
        unit_amount: '150000',
      }),
    ], () => ids.shift()!);

    expect(lines).toEqual([
      {
        id: 'line-1',
        rental_item_id: 'item-1',
        description: 'Transformador 500 kVA 13,8 kV / 380-220 V - Série ABC123',
        quantity: 1,
        unit_amount: '150000',
        kind: 'recurring',
      },
      {
        id: 'line-2',
        rental_item_id: 'item-2',
        description: 'Transformador 300 kVA - Série XYZ789',
        quantity: 1,
        unit_amount: '150000',
        kind: 'recurring',
      },
    ]);
    expect(lines.map((line) => line.description).join(' ')).not.toContain('CODIGO-INTERNO');
  });

  describe('rental billing coverage', () => {
    it('requires the first period for an active rental without a valid billing period', () => {
      expect(resolveRentalBillingCoverage({
        contractStatus: 'active',
        today: '2026-08-30',
        latestPeriodEnd: null,
      })).toBe('first_period_required');
    });

    it.each([
      ['2026-08-30', 'current'],
      ['2026-08-31', 'current'],
      ['2026-09-01', 'new_period_required'],
    ] as const)('compares local day %s with period_end, returning %s', (today, expected) => {
      expect(resolveRentalBillingCoverage({
        contractStatus: 'active',
        today,
        latestPeriodEnd: '2026-08-31',
      })).toBe(expected);
    });

    it('requires a new period after period_end even when due_date is still in the future', () => {
      const latest = selectLatestBillingCoveragePeriod([
        makeBilling({ period_end: '2026-08-31', due_date: '2026-09-10' }),
      ]);

      expect(resolveRentalBillingCoverage({
        contractStatus: 'active',
        today: '2026-09-01',
        latestPeriodEnd: latest?.period_end ?? null,
      })).toBe('new_period_required');
    });

    it('selects the latest valid period by period_end and ignores draft and cancelled cycles', () => {
      const latest = selectLatestBillingCoveragePeriod([
        makeBilling({ id: 'issued', status: 'issued', period_end: '2026-08-31', due_date: '2026-09-10' }),
        makeBilling({ id: 'draft', status: 'draft', period_end: '2026-10-31' }),
        makeBilling({ id: 'cancelled', status: 'cancelled', period_end: '2026-11-30' }),
        makeBilling({ id: 'paid', status: 'paid', period_end: '2026-09-30', due_date: '2026-10-10' }),
      ]);

      expect(latest).toMatchObject({
        id: 'paid',
        period_end: '2026-09-30',
        due_date: '2026-10-10',
      });
    });

    it.each(['issued', 'paid', 'overdue', 'exempt'] as const)(
      'counts %s as a valid covered period',
      (status) => {
        expect(selectLatestBillingCoveragePeriod([
          makeBilling({ id: status, status }),
        ])?.id).toBe(status);
      }
    );

    it.each([
      'paused',
      'closing_requested',
      'awaiting_return',
      'inspection',
      'closed',
      'cancelled',
    ] as const)('does not prompt a new period for a %s rental', (contractStatus) => {
      expect(resolveRentalBillingCoverage({
        contractStatus,
        today: '2026-09-01',
        latestPeriodEnd: '2026-08-31',
      })).toBeNull();
    });

    it('sorts contracts by billing urgency and the approved date direction', () => {
      const sorted = sortContractsByBillingPriority([
        priorityContract('inactive-first', null, '2026-07-01', '2026-12-31'),
        priorityContract('current-later', 'current', '2026-06-01', '2026-10-31'),
        priorityContract('first-newer', 'first_period_required', '2026-08-10', null),
        priorityContract('new-recent', 'new_period_required', '2026-04-01', '2026-08-15'),
        priorityContract('current-sooner', 'current', '2026-05-01', '2026-09-30'),
        priorityContract('first-older', 'first_period_required', '2026-07-10', null),
        priorityContract('new-oldest', 'new_period_required', '2026-03-01', '2026-07-31'),
        priorityContract('inactive-second', null, '2026-01-01', '2026-01-31'),
      ]);

      expect(sorted.map((contract) => contract.id)).toEqual([
        'new-oldest',
        'new-recent',
        'first-older',
        'first-newer',
        'current-sooner',
        'current-later',
        'inactive-first',
        'inactive-second',
      ]);
    });
  });
});

function priorityContract(
  id: string,
  billingCoverageStatus: 'first_period_required' | 'new_period_required' | 'current' | null,
  startDate: string,
  latestBillingPeriodEnd: string | null
) {
  return {
    id,
    billing_coverage_status: billingCoverageStatus,
    start_date: startDate,
    latest_billing_period_end: latestBillingPeriodEnd,
  };
}

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
    needs_resend: false,
    content_revision: '0',
    boleto_change_pending: false,
    boleto_change_operation_id: null,
    boleto_change_started_at: null,
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
