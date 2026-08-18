import Link from 'next/link';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { BillingListItem } from '@/lib/contratos-locacoes/queries';
import { buildBillingListReference } from '@/lib/contratos-locacoes/contract-reference';
import { BillingStatusBadge } from './BillingStatusBadge';

interface BillingTableProps {
  billings: BillingListItem[];
  loading: boolean;
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function BillingTable({ billings, loading }: BillingTableProps) {
  if (loading) {
    return <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando cobranças...</div>;
  }

  if (billings.length === 0) {
    return <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">Nenhuma cobrança encontrada.</div>;
  }

  return (
    <div className="grid gap-3">
      {billings.map((billing) => {
        const paidAmount = Number.parseInt(billing.paid_amount, 10);
        const balanceAmount = Number.parseInt(billing.balance_amount, 10);
        const reference = buildBillingListReference({
          legacyOrderNumber: billing.legacy_order_number,
          documentNumber: billing.document_number,
        });
        return (
          <article className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4" key={billing.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">{reference.primary}</h2>
                  <BillingStatusBadge
                    alert={billing.alert}
                    balanceAmount={balanceAmount}
                    paidAmount={paidAmount}
                    status={billing.status}
                  />
                </div>
                <p className="mt-1 text-xs font-medium text-gray-600">
                  {billing.customer_name}{reference.secondary ? ` · ${reference.secondary}` : ''}
                </p>
                <p className="text-xs text-gray-500">{billing.site_name}</p>
              </div>
              <p className="shrink-0 text-lg font-bold text-gray-900 sm:text-right">{formatBRL(billing.total_amount)}</p>
            </div>

            <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>Período: {formatDateLabel(billing.period_start)}–{formatDateLabel(billing.period_end)}</span>
                <span>Vence: {formatDateLabel(billing.due_date)}</span>
                <span>Recebido: {formatBRL(paidAmount)}</span>
                <span>Saldo: {formatBRL(balanceAmount)}</span>
                <span>{billing.sent_at ? `Enviado em ${formatDateTimeLabel(billing.sent_at)}` : 'Não enviado'}</span>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                <Link className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700" href={`/contratos-locacoes/contratos/${billing.contract_id}`}>
                  Abrir locação
                </Link>
                {billing.document_type === 'receipt' ? (
                  <Link className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" href={`/contratos-locacoes/recibos/${billing.id}`}>
                    Abrir recibo
                  </Link>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
