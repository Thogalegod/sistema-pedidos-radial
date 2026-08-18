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
          <article className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm" key={billing.id}>
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {reference.primary}
                </p>
                {reference.secondary ? <p className="text-xs font-medium text-gray-500">{reference.secondary}</p> : null}
                <p className="text-sm text-gray-600">{billing.customer_name}</p>
                <p className="text-xs text-gray-500">{billing.site_name}</p>
              </div>

              <div className="text-left lg:text-right">
                <p className="text-sm font-semibold text-gray-900">{formatBRL(billing.total_amount)}</p>
                <p className="text-xs text-gray-500">Recebido: {formatBRL(paidAmount)}</p>
                <p className="text-xs text-gray-500">Saldo: {formatBRL(balanceAmount)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Período</p>
                <p className="font-medium text-gray-900">{formatDateLabel(billing.period_start)} a {formatDateLabel(billing.period_end)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Vencimento</p>
                <p className="font-medium text-gray-900">{formatDateLabel(billing.due_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
                <div className="mt-1">
                  <BillingStatusBadge
                    alert={billing.alert}
                    balanceAmount={balanceAmount}
                    paidAmount={paidAmount}
                    status={billing.status}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Envio</p>
                <p className="font-medium text-gray-900">{billing.sent_at ? `Enviado em ${formatDateTimeLabel(billing.sent_at)}` : 'Não enviado'}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Link className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700" href={`/contratos-locacoes/contratos/${billing.contract_id}`}>
                Abrir locação
              </Link>
              {billing.document_type === 'receipt' ? (
                <Link className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" href={`/contratos-locacoes/recibos/${billing.id}`}>
                  Abrir recibo
                </Link>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
