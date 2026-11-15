import {
  resolveBillingStatusPresentation,
  type BillingStatusVariant,
} from '@/lib/contratos-locacoes/billing-status-presentation';
import type { BillingStatus } from '@/lib/contratos-locacoes/types';

interface BillingStatusBadgeProps {
  status: BillingStatus;
  alert: 'ok' | 'due_soon' | 'due_today' | 'overdue';
  paidAmount: number;
  balanceAmount: number;
}

const variantClasses: Record<BillingStatusVariant, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  issued: 'bg-blue-100 text-blue-800 ring-blue-200',
  dueSoon: 'bg-amber-100 text-amber-900 ring-amber-200',
  dueToday: 'bg-orange-100 text-orange-900 ring-orange-200',
  overdue: 'bg-red-100 text-red-800 ring-red-200',
  partial: 'bg-purple-100 text-purple-800 ring-purple-200',
  paid: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  cancelled: 'bg-slate-700 text-white ring-slate-800',
  exempt: 'bg-gray-100 text-gray-700 ring-gray-200',
};

export function BillingStatusBadge(props: BillingStatusBadgeProps) {
  const presentation = resolveBillingStatusPresentation(props);

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${variantClasses[presentation.variant]}`}>
      {presentation.label}
    </span>
  );
}
