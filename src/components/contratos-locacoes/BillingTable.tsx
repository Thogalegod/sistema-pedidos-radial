import Link from 'next/link';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { BillingListItem } from '@/lib/contratos-locacoes/queries';

interface BillingTableProps {
  billings: BillingListItem[];
  loading: boolean;
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
      {billings.map((billing) => (
        <Link
          className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm"
          href={billing.document_type === 'receipt'
            ? `/contratos-locacoes/recibos/${billing.id}`
            : `/contratos-locacoes/contratos/${billing.contract_id}`}
          key={billing.id}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {billing.document_number ?? 'Sem número'} • #{billing.internal_number}
              </p>
              <p className="text-sm text-gray-600">{billing.customer_name}</p>
              <p className="text-xs text-gray-500">{billing.site_name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{formatBRL(Number.parseInt(billing.total_amount, 10))}</p>
              <p className="text-xs text-gray-500">Saldo: {formatBRL(Number.parseInt(billing.balance_amount, 10))}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">{billing.status}</p>
            </div>
          </div>
          {billing.document_type === 'receipt' ? (
            <div className="mt-3 flex justify-end">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Abrir recibo PDF
              </span>
            </div>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
