import { describe, expect, it } from 'vitest';
import {
  billingDraftSchema,
  paymentDraftSchema,
  type BillingDraftInput,
} from './schemas';
import {
  buildBillingStatus,
  calculateBillingBalance,
  createBillingSnapshot,
  type BillingSnapshotInput,
} from './dashboard';

const baseBilling: BillingDraftInput = {
  contract_id: 'contract-1',
  period_start: '2026-07-01',
  period_end: '2026-07-30',
  issue_date: '2026-07-01',
  due_date: '2026-07-31',
  document_type: 'receipt',
  document_number: 'R260701001',
  notes: '',
  sequence_number: 1,
  discount_amount: '0',
  surcharge_amount: '0',
  exemption_amount: '0',
  items: [
    {
      id: 'line-1',
      rental_item_id: 'item-1',
      description: 'Locação mensal gerador 150 kVA',
      quantity: 1,
      unit_amount: '150000',
      kind: 'recurring',
    },
  ],
};

describe('billing schemas and summaries', () => {
  it('accepts manual period emission with the invoice short number', () => {
    const parsed = billingDraftSchema.parse(baseBilling);

    expect(parsed.document_number).toBe('R260701001');
    expect(parsed.items[0].quantity).toBe(1);
  });

  it('rejects invoice numbers outside the approved short format', () => {
    expect(() =>
      billingDraftSchema.parse({
        ...baseBilling,
        document_number: 'RECIBO-1',
      })
    ).toThrow(/fatura/i);
  });

  it('rejects zero-value partial payments', () => {
    expect(() =>
      paymentDraftSchema.parse({
        billing_cycle_id: 'billing-1',
        paid_at: '2026-07-20',
        amount: '0',
        notes: '',
      })
    ).toThrow(/pagamento/i);
  });

  it('keeps partial payment as issued and computes open balance correctly', () => {
    expect(buildBillingStatus('150000', ['50000'], '2026-07-20', '2026-07-31')).toBe('issued');
    expect(calculateBillingBalance('150000', ['50000'])).toEqual({
      paid_amount: '50000',
      balance_amount: '100000',
      is_paid_in_full: false,
    });
  });

  it('marks unpaid cycles as overdue after due date', () => {
    expect(buildBillingStatus('150000', [], '2026-08-01', '2026-07-31')).toBe('overdue');
  });

  it('creates a dashboard snapshot with due soon, due today and overdue buckets', () => {
    const snapshot = createBillingSnapshot('2026-07-24', [
      makeSnapshotInput('billing-soon', '150000', '2026-07-31', []),
      makeSnapshotInput('billing-today', '220000', '2026-07-24', []),
      makeSnapshotInput('billing-overdue', '90000', '2026-07-20', ['30000']),
      makeSnapshotInput('billing-paid', '50000', '2026-07-15', ['50000']),
    ]);

    expect(snapshot.summary.due_soon_count).toBe(1);
    expect(snapshot.summary.due_today_count).toBe(1);
    expect(snapshot.summary.overdue_count).toBe(1);
    expect(snapshot.summary.paid_count).toBe(1);
    expect(snapshot.summary.open_total_amount).toBe('430000');
    expect(snapshot.alerts[0].level).toBe('overdue');
  });
});

function makeSnapshotInput(
  id: string,
  totalAmount: string,
  dueDate: string,
  payments: string[]
): BillingSnapshotInput {
  return {
    id,
    contract_id: 'contract-1',
    internal_number: '12',
    customer_name: 'Radial Energia',
    site_name: 'Obra Centro',
    legacy_order_number: 'OS-12',
    document_number: `R26070100${id.length % 9}`,
    document_type: 'receipt',
    total_amount: totalAmount,
    due_date: dueDate,
    issue_date: '2026-07-01',
    notes: null,
    status: 'issued',
    payments,
  };
}
