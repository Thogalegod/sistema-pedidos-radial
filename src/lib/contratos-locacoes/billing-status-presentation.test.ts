import { describe, expect, it } from 'vitest';
import {
  resolveBillingStatusPresentation,
  resolveEffectiveBillingStatus,
  sortBillingsByOperationalPriority,
} from './billing-status-presentation';

describe('resolveBillingStatusPresentation', () => {
  it.each([
    [{ status: 'draft', alert: 'ok', paidAmount: 0, balanceAmount: 300_000 }, { label: 'A emitir', variant: 'draft' }],
    [{ status: 'issued', alert: 'ok', paidAmount: 0, balanceAmount: 300_000 }, { label: 'Emitida', variant: 'issued' }],
    [{ status: 'issued', alert: 'due_soon', paidAmount: 0, balanceAmount: 300_000 }, { label: 'Vence em breve', variant: 'dueSoon' }],
    [{ status: 'issued', alert: 'due_today', paidAmount: 0, balanceAmount: 300_000 }, { label: 'Vence hoje', variant: 'dueToday' }],
    [{ status: 'overdue', alert: 'overdue', paidAmount: 0, balanceAmount: 300_000 }, { label: 'Vencida', variant: 'overdue' }],
    [{ status: 'issued', alert: 'ok', paidAmount: 100_000, balanceAmount: 200_000 }, { label: 'Parcialmente paga', variant: 'partial' }],
    [{ status: 'overdue', alert: 'overdue', paidAmount: 100_000, balanceAmount: 200_000 }, { label: 'Parcial • vencida', variant: 'overdue' }],
    [{ status: 'paid', alert: 'ok', paidAmount: 300_000, balanceAmount: 0 }, { label: 'Paga', variant: 'paid' }],
    [{ status: 'cancelled', alert: 'overdue', paidAmount: 0, balanceAmount: 300_000 }, { label: 'Cancelada', variant: 'cancelled' }],
    [{ status: 'cancelled', alert: 'ok', paidAmount: 300_000, balanceAmount: 0 }, { label: 'Cancelada', variant: 'cancelled' }],
    [{ status: 'exempt', alert: 'ok', paidAmount: 0, balanceAmount: 0 }, { label: 'Isenta', variant: 'exempt' }],
  ] as const)('maps financial state to an unambiguous label and visual variant', (input, expected) => {
    expect(resolveBillingStatusPresentation(input)).toEqual(expected);
  });

  it.each(['draft', 'cancelled', 'exempt'] as const)('preserves persisted %s instead of replacing it with a date-derived status', (status) => {
    expect(resolveEffectiveBillingStatus(status, 'issued')).toBe(status);
  });

  it('uses the financial derived status for ordinary issued or overdue billings', () => {
    expect(resolveEffectiveBillingStatus('issued', 'paid')).toBe('paid');
    expect(resolveEffectiveBillingStatus('overdue', 'issued')).toBe('issued');
  });

  it('sorts monthly billings by operational priority and the approved due-date direction', () => {
    const sorted = sortBillingsByOperationalPriority([
      priorityBilling('paid', 'paid', '2026-08-05', '0'),
      priorityBilling('future-later', 'issued', '2026-08-30', '300000'),
      priorityBilling('overdue-old', 'overdue', '2026-08-08', '300000'),
      priorityBilling('cancelled', 'cancelled', '2026-08-02', '300000'),
      priorityBilling('today', 'issued', '2026-08-18', '300000'),
      priorityBilling('draft', 'draft', '2026-08-01', '300000'),
      priorityBilling('future-next', 'issued', '2026-08-19', '300000'),
      priorityBilling('exempt', 'exempt', '2026-08-03', '0'),
      priorityBilling('overdue-recent', 'overdue', '2026-08-17', '300000'),
    ], '2026-08-18');

    expect(sorted.map((billing) => billing.id)).toEqual([
      'overdue-recent',
      'overdue-old',
      'today',
      'future-next',
      'future-later',
      'draft',
      'paid',
      'exempt',
      'cancelled',
    ]);
  });
});

function priorityBilling(
  id: string,
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'exempt' | 'cancelled',
  dueDate: string,
  balanceAmount: string
) {
  return {
    id,
    status,
    due_date: dueDate,
    balance_amount: balanceAmount,
    document_number: id,
    customer_name: id,
  };
}
