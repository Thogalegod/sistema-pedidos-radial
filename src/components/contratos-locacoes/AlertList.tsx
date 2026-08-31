import Link from 'next/link';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { BillingAlertItem } from '@/lib/contratos-locacoes/dashboard';

interface AlertListProps {
  alerts: BillingAlertItem[];
}

const labels: Record<BillingAlertItem['level'], string> = {
  ok: 'Em dia',
  due_soon: 'Vence em 7 dias',
  due_today: 'Vence hoje',
  overdue: 'Vencida',
};

export function AlertList({ alerts }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Nenhum alerta de cobrança no momento.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {alerts.map((alert) => (
        <Link
          className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
          href={`/contratos-locacoes/contratos/${alert.contract_id}`}
          key={alert.id}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                #{alert.internal_number} • {alert.customer_name}
              </p>
              <p className="text-sm text-gray-500">{alert.site_name}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">{labels[alert.level]}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{formatBRL(Number.parseInt(alert.balance_amount, 10))}</p>
              <p className="text-xs text-gray-500">Vence em {alert.due_date}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
