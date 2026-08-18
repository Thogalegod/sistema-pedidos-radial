import { describe, expect, it } from 'vitest';
import { resolveBillingStatusPresentation, resolveEffectiveBillingStatus } from './billing-status-presentation';

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
});
