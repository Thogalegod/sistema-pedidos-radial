import { describe, expect, it } from 'vitest';
import type { BillingListItem, ContractListItem } from './queries';
import {
  filterContractsByQuickFilter,
  isPeriodToIssue,
  normalizeRentalQuickFilter,
  selectOperationalBilling,
} from './rental-operations';

const active = {
  id: 'active', kind: 'rental', status: 'active', billing_coverage_status: 'new_period_required',
} as ContractListItem;
const paused = { ...active, id: 'paused', status: 'paused', billing_coverage_status: null } as ContractListItem;
const returning = { ...active, id: 'returning', status: 'awaiting_return', billing_coverage_status: null } as ContractListItem;
const overdue = {
  id: 'overdue', contract_id: 'active', status: 'overdue', alert: 'overdue', balance_amount: '300000', due_date: '2026-09-01',
} as BillingListItem;
const today = {
  id: 'today', contract_id: 'active', status: 'issued', alert: 'due_today', balance_amount: '100000', due_date: '2026-09-23',
} as BillingListItem;

describe('rental operational presentation', () => {
  it('uses rental coverage for periods to issue, not draft billing cycles', () => {
    expect(isPeriodToIssue(active)).toBe(true);
    expect(isPeriodToIssue(paused)).toBe(false);
    expect(filterContractsByQuickFilter([active, paused, returning], [overdue, today], 'periods_to_issue')).toEqual([active]);
  });

  it('filters financial urgency using existing billing alerts and ignores settled cycles', () => {
    const paid = { ...overdue, id: 'paid', status: 'paid', balance_amount: '0' } as BillingListItem;
    expect(selectOperationalBilling('active', [paid, overdue, today])).toEqual(overdue);
    expect(filterContractsByQuickFilter([active, paused, returning], [overdue], 'overdue')).toEqual([active]);
    expect(filterContractsByQuickFilter([active, paused, returning], [today], 'due_today')).toEqual([active]);
    expect(filterContractsByQuickFilter([active, paused, returning], [paid], 'overdue')).toEqual([]);
  });

  it('filters real contract statuses and discards unsupported URL values', () => {
    expect(filterContractsByQuickFilter([active, paused, returning], [], 'paused')).toEqual([paused]);
    expect(filterContractsByQuickFilter([active, paused, returning], [], 'awaiting_return')).toEqual([returning]);
    expect(normalizeRentalQuickFilter('unexpected')).toBe('all');
  });
});
