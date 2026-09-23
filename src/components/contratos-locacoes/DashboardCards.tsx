import Link from 'next/link';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { DashboardSnapshot } from '@/lib/contratos-locacoes/dashboard';

interface DashboardCardsProps {
  snapshot: DashboardSnapshot;
  periodsToIssueCount: number;
}

export function DashboardCards({ snapshot, periodsToIssueCount }: DashboardCardsProps) {
  const cards = [
    { label: 'Períodos a emitir', value: periodsToIssueCount, href: '/contratos-locacoes/contratos?quick=periods_to_issue', tone: 'text-amber-800' },
    { label: 'Cobranças vencidas', value: snapshot.summary.overdue_count, href: '/contratos-locacoes/cobrancas?status=overdue&month=all', tone: 'text-red-800' },
    { label: 'Vencem hoje', value: snapshot.summary.due_today_count, href: '/contratos-locacoes/cobrancas?status=due_today&month=all', tone: 'text-amber-800' },
    { label: 'Próximos 7 dias', value: snapshot.summary.due_soon_count, href: '/contratos-locacoes/cobrancas?status=due_soon&month=all', tone: 'text-slate-900' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Link
          className="rounded-xl border border-radial-border bg-white px-3 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-radial-primary"
          href={card.href}
          key={card.label}
        >
          <p className="text-xs font-medium text-radial-muted">{card.label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${card.tone}`}>{card.value}</p>
        </Link>
      ))}

      <div className="min-w-0 rounded-xl border border-radial-border bg-white px-3 py-3">
        <p className="text-xs font-medium text-radial-muted">Saldo em aberto</p>
        <p className="mt-1 break-words text-lg font-semibold tabular-nums text-emerald-900">
          {formatBRL(Number.parseInt(snapshot.summary.open_total_amount, 10))}
        </p>
      </div>

      <div className="min-w-0 rounded-xl border border-radial-border bg-white px-3 py-3">
        <p className="text-xs font-medium text-radial-muted">Em atraso</p>
        <p className="mt-1 break-words text-lg font-semibold tabular-nums text-red-900">
          {formatBRL(Number.parseInt(snapshot.summary.overdue_total_amount, 10))}
        </p>
      </div>
    </div>
  );
}
