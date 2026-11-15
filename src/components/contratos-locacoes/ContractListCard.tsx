import Link from 'next/link';
import { StickyNote } from 'lucide-react';
import type { BillingListItem, ContractListItem } from '@/lib/contratos-locacoes/queries';
import { getContractKindLabel, getContractStatusLabel } from '@/lib/contratos-locacoes/contract-presentation';
import { buildRentalListReference } from '@/lib/contratos-locacoes/contract-reference';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import { resolveBillingStatusPresentation } from '@/lib/contratos-locacoes/billing-status-presentation';
import { isPeriodToIssue } from '@/lib/contratos-locacoes/rental-operations';

interface ContractListCardProps {
  contract: ContractListItem;
  billing?: BillingListItem | null;
}

export function ContractListCard({ contract, billing = null }: ContractListCardProps) {
  const isRental = contract.kind === 'rental';
  const reference = isRental
    ? buildRentalListReference({
        legacyOrderNumber: contract.legacy_order_number,
        internalNumber: contract.internal_number,
      })
    : null;
  const needsBillingPeriod = isPeriodToIssue(contract);
  const financial = billing ? resolveBillingStatusPresentation({
    status: billing.status,
    alert: billing.alert,
    paidAmount: Number(billing.paid_amount),
    balanceAmount: Number(billing.balance_amount),
  }) : null;
  const financialTone = billing?.alert === 'overdue' ? 'bg-red-50 text-red-800 ring-red-200'
    : billing?.alert === 'due_today' || billing?.alert === 'due_soon'
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : 'bg-slate-100 text-slate-700 ring-slate-200';
  const statusTone = contract.status === 'active' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    : contract.status === 'paused' || contract.status === 'closing_requested' || contract.status === 'awaiting_return' || contract.status === 'inspection'
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : 'bg-slate-100 text-slate-700 ring-slate-200';

  return (
    <article className="overflow-hidden rounded-xl border border-radial-border bg-white transition-colors hover:border-slate-300 hover:bg-slate-50">
      <Link
        aria-label={`Abrir locação de ${contract.customer_name}`}
        className="block px-3 pb-2 pt-3 focus-visible:outline-2 focus-visible:outline-radial-primary sm:px-4"
        href={`/contratos-locacoes/contratos/${contract.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-base font-semibold text-radial-ink">{contract.customer_name}</h2>
            {contract.notes?.trim() ? <StickyNote aria-label="Possui observação interna" className="shrink-0 text-slate-400" size={14} /> : null}
          </div>
          {isRental ? <strong className="whitespace-nowrap text-sm font-semibold tabular-nums text-radial-ink">{formatBRL(contract.current_monthly_amount ?? '0')}/mês</strong> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-radial-muted">
          {reference?.primary ?? contract.legacy_order_number ?? getContractKindLabel(contract.kind)} · {contract.site_name}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusTone}`}>{getContractStatusLabel(contract.status)}</span>
          {needsBillingPeriod ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Período a emitir</span> : null}
          {isRental && contract.billing_coverage_status === 'current' ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Período vigente</span> : null}
          {financial ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${financialTone}`}>{financial.variant === 'issued' ? 'Em dia' : financial.label}</span> : null}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-radial-muted">
          {isRental && contract.latest_billing_period_end ? <span>Faturado até: {formatDateLabel(contract.latest_billing_period_end)}</span> : null}
          {isRental && !contract.latest_billing_period_end ? <span>Nenhum período emitido</span> : null}
          {billing ? <span>Vencimento: {formatDateLabel(billing.due_date)}</span> : contract.latest_billing_due_date ? <span>Vencimento: {formatDateLabel(contract.latest_billing_due_date)}</span> : null}
          {billing ? <span className={billing.alert === 'overdue' ? 'font-semibold text-red-800' : ''}>Saldo: {formatBRL(billing.balance_amount)}</span> : null}
          <span>Início: {formatDateLabel(contract.start_date)} · {contract.item_count} {contract.item_count === 1 ? 'item' : 'itens'}</span>
        </p>
      </Link>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-3 py-2 sm:px-4">
        <Link className="rounded-lg border border-radial-border px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={`/contratos-locacoes/contratos/${contract.id}`}>Ver</Link>
        {needsBillingPeriod ? <Link className="rounded-lg bg-radial-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-radial-primary-hover" href={`/contratos-locacoes/contratos/${contract.id}?action=new-billing`}>Emitir período</Link> : null}
      </div>
    </article>
  );
}
