import Link from 'next/link';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { DashboardSnapshot } from '@/lib/contratos-locacoes/dashboard';

interface DashboardCardsProps {
  snapshot: DashboardSnapshot;
}

export function DashboardCards({ snapshot }: DashboardCardsProps) {
  const cards = [
    { label: 'Cobranças a emitir', value: snapshot.summary.billings_to_issue_count, href: '/contratos-locacoes/cobrancas?status=to_issue' },
    { label: 'Vencendo em 7 dias', value: snapshot.summary.due_soon_count, href: '/contratos-locacoes/cobrancas?status=due_soon' },
    { label: 'No vencimento', value: snapshot.summary.due_today_count, href: '/contratos-locacoes/cobrancas?status=due_today' },
    { label: 'Vencidas', value: snapshot.summary.overdue_count, href: '/contratos-locacoes/cobrancas?status=overdue' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Link
          className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          href={card.href}
          key={card.label}
        >
          <p className="text-sm font-medium text-gray-500">{card.label}</p>
          <p className="mt-2 text-3xl font-black text-gray-900">{card.value}</p>
        </Link>
      ))}

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Saldo em aberto</p>
        <p className="mt-2 text-3xl font-black text-emerald-950">
          {formatBRL(Number.parseInt(snapshot.summary.open_total_amount, 10))}
        </p>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <p className="text-sm font-medium text-amber-700">Em atraso</p>
        <p className="mt-2 text-3xl font-black text-amber-950">
          {formatBRL(Number.parseInt(snapshot.summary.overdue_total_amount, 10))}
        </p>
      </div>
    </div>
  );
}
