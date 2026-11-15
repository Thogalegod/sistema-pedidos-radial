import Link from 'next/link';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';
import { buildRentalListReference } from '@/lib/contratos-locacoes/contract-reference';
import { isPeriodToIssue } from '@/lib/contratos-locacoes/rental-operations';
import type { BillingAlertItem } from '@/lib/contratos-locacoes/dashboard';
import type { ContractListItem } from '@/lib/contratos-locacoes/queries';

interface OperationalAlertGroupsProps {
  alerts: BillingAlertItem[];
  contracts: ContractListItem[];
}

const MAX_VISIBLE = 4;

export function OperationalAlertGroups({ alerts, contracts }: OperationalAlertGroupsProps) {
  const openAlerts = alerts.filter((alert) => Number(alert.balance_amount) > 0
    && !['paid', 'cancelled', 'exempt', 'draft'].includes(alert.status));
  const groups = [
    {
      title: 'Cobranças vencidas', href: '/contratos-locacoes/cobrancas?status=overdue&month=all',
      items: openAlerts.filter((alert) => alert.level === 'overdue'), kind: 'billing' as const,
    },
    {
      title: 'Períodos a emitir', href: '/contratos-locacoes/contratos?quick=periods_to_issue',
      items: contracts.filter(isPeriodToIssue), kind: 'period' as const,
    },
    {
      title: 'Vencem hoje', href: '/contratos-locacoes/cobrancas?status=due_today&month=all',
      items: openAlerts.filter((alert) => alert.level === 'due_today'), kind: 'billing' as const,
    },
    {
      title: 'Próximos 7 dias', href: '/contratos-locacoes/cobrancas?status=due_soon&month=all',
      items: openAlerts.filter((alert) => alert.level === 'due_soon'), kind: 'billing' as const,
    },
    {
      title: 'Aguardando devolução', href: '/contratos-locacoes/contratos?quick=awaiting_return',
      items: contracts.filter((contract) => contract.kind === 'rental' && contract.status === 'awaiting_return'), kind: 'return' as const,
    },
  ];
  const visibleGroups = groups.filter((group) => group.items.length > 0);

  if (visibleGroups.length === 0) {
    return <div className="rounded-xl border border-dashed border-radial-border bg-white p-5 text-sm text-radial-muted">Nenhuma ação pendente no momento.</div>;
  }

  return (
    <div className="space-y-6">
      {visibleGroups.map((group) => (
        <section aria-label={group.title} className="space-y-2" key={group.title}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-radial-ink">{group.title}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">{group.items.length}</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {group.kind === 'billing'
              ? (group.items as BillingAlertItem[]).slice(0, MAX_VISIBLE).map((alert) => <BillingAlertCard alert={alert} key={alert.id} />)
              : (group.items as ContractListItem[]).slice(0, MAX_VISIBLE).map((contract) => (
                <ContractAlertCard contract={contract} kind={group.kind} key={contract.id} />
              ))}
          </div>
          {group.items.length > MAX_VISIBLE ? (
            <Link className="inline-block text-xs font-semibold text-radial-primary hover:underline" href={group.href}>
              Ver todas as {group.items.length} →
            </Link>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function BillingAlertCard({ alert }: { alert: BillingAlertItem }) {
  const label = alert.level === 'overdue' ? 'Vencida' : alert.level === 'due_today' ? 'Vence hoje' : 'Próx. vencimento';
  const tone = alert.level === 'overdue' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800';
  return (
    <Link className="min-w-0 rounded-xl border border-radial-border bg-white p-3 transition-colors hover:bg-slate-50" href={`/contratos-locacoes/contratos/${alert.contract_id}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
        <span className="text-xs font-semibold text-radial-primary">Ver →</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-radial-ink">{alert.customer_name}</p>
      <p className="truncate text-xs text-radial-muted">{alert.legacy_order_number || `Locação #${alert.internal_number}`}</p>
      <p className="mt-2 text-xs text-slate-700">
        <strong className="font-semibold">{formatBRL(alert.balance_amount)}</strong>
        <span className="mx-1.5">·</span>
        {alert.level === 'overdue' ? 'Venceu em ' : 'Vence em '}{formatDateLabel(alert.due_date)}
      </p>
    </Link>
  );
}

function ContractAlertCard({ contract, kind }: { contract: ContractListItem; kind: 'period' | 'return' }) {
  const reference = buildRentalListReference({ legacyOrderNumber: contract.legacy_order_number, internalNumber: contract.internal_number });
  const isPeriod = kind === 'period';
  return (
    <Link
      className="min-w-0 rounded-xl border border-radial-border bg-white p-3 transition-colors hover:bg-slate-50"
      href={`/contratos-locacoes/contratos/${contract.id}${isPeriod ? '?action=new-billing' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{isPeriod ? 'Período pendente' : 'Devolução'}</span>
        <span className="text-xs font-semibold text-radial-primary">{isPeriod ? 'Emitir →' : 'Ver →'}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-radial-ink">{contract.customer_name}</p>
      <p className="truncate text-xs text-radial-muted">{reference.primary}</p>
      <p className="mt-2 text-xs text-slate-700">
        {isPeriod
          ? <>{contract.latest_billing_period_end ? `Faturado até ${formatDateLabel(contract.latest_billing_period_end)}` : 'Primeiro período pendente'} · {formatBRL(contract.current_monthly_amount ?? '0')}/mês</>
          : <>{contract.site_name} · {contract.item_count} {contract.item_count === 1 ? 'item' : 'itens'}</>}
      </p>
    </Link>
  );
}
