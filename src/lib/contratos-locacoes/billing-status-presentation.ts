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

interface OperationalBilling {
  status: BillingStatus;
  due_date: string;
  balance_amount: string | number;
  document_number?: string | null;
  customer_name?: string | null;
}

export function sortBillingsByOperationalPriority<T extends OperationalBilling>(
  billings: T[],
  today: string
) {
  const priority = (billing: T) => {
    const hasBalance = Number(billing.balance_amount) > 0;

    if (billing.status === 'cancelled') return 6;
    if (billing.status === 'exempt') return 5;
    if (billing.status === 'paid') return 4;
    if (billing.status === 'draft') return 3;
    if (hasBalance && billing.due_date < today) return 0;
    if (hasBalance && billing.due_date === today) return 1;
    return 2;
  };

  return billings
    .map((billing, index) => ({ billing, index }))
    .sort((left, right) => {
      const leftPriority = priority(left.billing);
      const rightPriority = priority(right.billing);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;

      if (leftPriority === 0) {
        const recentOverdueFirst = right.billing.due_date.localeCompare(left.billing.due_date);
        if (recentOverdueFirst !== 0) return recentOverdueFirst;
      } else if (leftPriority === 2 || leftPriority >= 4) {
        const earliestDueFirst = left.billing.due_date.localeCompare(right.billing.due_date);
        if (earliestDueFirst !== 0) return earliestDueFirst;
      }

      const byDocument = (left.billing.document_number ?? '').localeCompare(
        right.billing.document_number ?? '',
        'pt-BR'
      );
      if (byDocument !== 0) return byDocument;

      const byCustomer = (left.billing.customer_name ?? '').localeCompare(
        right.billing.customer_name ?? '',
        'pt-BR'
      );
      return byCustomer !== 0 ? byCustomer : left.index - right.index;
    })
    .map(({ billing }) => billing);
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
