import { describe, expect, it } from 'vitest';
import { createBillingSnapshot, type BillingSnapshotInput } from './dashboard';

const billing = (status: BillingSnapshotInput['status'], payments: string[] = []): BillingSnapshotInput => ({
  id: status, contract_id: 'contract-1', internal_number: '1', customer_name: 'Cliente',
  site_name: 'Obra', legacy_order_number: null, document_number: null, document_type: 'receipt',
  total_amount: '10000', due_date: '2026-11-01', issue_date: '2026-10-01', notes: null, status, payments,
});

describe('dashboard financial status', () => {
  it.each(['cancelled', 'exempt', 'draft'] as const)('excludes %s from debt, alerts and upcoming collections', (status) => {
    const snapshot = createBillingSnapshot('2026-11-14', [billing(status)]);
    expect(snapshot.summary.open_total_amount).toBe('0');
    expect(snapshot.summary.overdue_total_amount).toBe('0');
    expect(snapshot.summary.overdue_count).toBe(0);
    expect(snapshot.summary.paid_count).toBe(0);
    expect(snapshot.summary.billings_to_issue_count).toBe(status === 'draft' ? 1 : 0);
    expect(snapshot.alerts).toEqual([]);
    expect(snapshot.upcoming).toEqual([]);
  });

  it('counts only the remaining debt of issued periods in a mixed portfolio', () => {
    const snapshot = createBillingSnapshot('2026-11-14', [
      billing('issued', ['3000']), billing('paid', ['10000']),
      billing('cancelled'), billing('exempt'), billing('draft'),
    ]);
    expect(snapshot.summary.open_total_amount).toBe('7000');
    expect(snapshot.summary.overdue_total_amount).toBe('7000');
    expect(snapshot.summary.paid_count).toBe(1);
    expect(snapshot.alerts.map(row => row.id)).toEqual(['issued']);
    expect(snapshot.upcoming.map(row => row.id)).toEqual(['issued']);
  });

  it.each(['cancelled', 'exempt', 'draft'] as const)('does not relabel fully covered %s as paid', (status) => {
    const snapshot = createBillingSnapshot('2026-11-14', [billing(status, ['10000'])]);
    expect(snapshot.summary.paid_count).toBe(0);
    expect(snapshot.alerts).toEqual([]);
  });
});
