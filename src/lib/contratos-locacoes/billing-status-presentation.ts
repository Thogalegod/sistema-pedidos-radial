import type { BillingStatus } from './types';

export type BillingStatusVariant =
  | 'draft'
  | 'issued'
  | 'dueSoon'
  | 'dueToday'
  | 'overdue'
  | 'partial'
  | 'paid'
  | 'cancelled'
  | 'exempt';

interface BillingStatusPresentationInput {
  status: BillingStatus;
  alert: 'ok' | 'due_soon' | 'due_today' | 'overdue';
  paidAmount: number;
  balanceAmount: number;
}

export interface BillingStatusPresentation {
  label: string;
  variant: BillingStatusVariant;
}

export function resolveEffectiveBillingStatus(
  persistedStatus: BillingStatus,
  financialStatus: BillingStatus
): BillingStatus {
  return persistedStatus === 'draft' || persistedStatus === 'cancelled' || persistedStatus === 'exempt'
    ? persistedStatus
    : financialStatus;
}

export function resolveBillingStatusPresentation({
  status,
  alert,
  paidAmount,
  balanceAmount,
}: BillingStatusPresentationInput): BillingStatusPresentation {
  if (status === 'cancelled') {
    return { label: 'Cancelada', variant: 'cancelled' };
  }

  if (status === 'exempt') {
    return { label: 'Isenta', variant: 'exempt' };
  }

  if (status === 'paid' || balanceAmount === 0 && paidAmount > 0) {
    return { label: 'Paga', variant: 'paid' };
  }

  if (status === 'draft') {
    return { label: 'A emitir', variant: 'draft' };
  }

  const isPartial = paidAmount > 0 && balanceAmount > 0;
  const isOverdue = status === 'overdue' || alert === 'overdue';

  if (isPartial) {
    return isOverdue
      ? { label: 'Parcial • vencida', variant: 'overdue' }
      : { label: 'Parcialmente paga', variant: 'partial' };
  }

  if (isOverdue) {
    return { label: 'Vencida', variant: 'overdue' };
  }

  if (alert === 'due_today') {
    return { label: 'Vence hoje', variant: 'dueToday' };
  }

  if (alert === 'due_soon') {
    return { label: 'Vence em breve', variant: 'dueSoon' };
  }

  return { label: 'Emitida', variant: 'issued' };
}
