import Link from 'next/link';
import type { ContractListItem } from '@/lib/contratos-locacoes/queries';
import { getContractKindLabel, getContractStatusLabel } from '@/lib/contratos-locacoes/contract-presentation';
import { formatBRL } from '@/lib/contratos-locacoes/money';

interface ContractListCardProps {
  contract: ContractListItem;
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function ContractListCard({ contract }: ContractListCardProps) {
  const isRental = contract.kind === 'rental';
  const isNormalActiveRental = isRental && contract.status === 'active';
  const needsBillingPeriod = contract.billing_coverage_status === 'first_period_required'
    || contract.billing_coverage_status === 'new_period_required';

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <Link
        aria-label={`Abrir locação de ${contract.customer_name}`}
        className="block p-5"
        href={`/contratos-locacoes/contratos/${contract.id}`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{contract.customer_name}</h2>
              {!isRental ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {getContractKindLabel(contract.kind)}
                </span>
              ) : null}
              {!isNormalActiveRental ? (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {getContractStatusLabel(contract.status)}
                </span>
              ) : null}
            </div>
            {contract.legacy_order_number ? (
              <p className="mt-1 text-sm font-semibold text-gray-700">{contract.legacy_order_number}</p>
            ) : null}
            <p className="text-sm text-gray-500">{contract.site_name}</p>
            {contract.notes?.trim() ? (
              <p className="mt-2 line-clamp-2 text-xs text-gray-500">Obs.: {contract.notes.trim()}</p>
            ) : null}
          </div>
          {isRental ? (
            <div className="grid gap-1 text-sm text-gray-500 md:min-w-64 md:text-right">
              <p className="text-base font-bold text-gray-900">
                {formatBRL(contract.current_monthly_amount ?? '0')}/mês
              </p>
              {contract.latest_billing_period_end && contract.latest_billing_due_date ? (
                <>
                  <span>Faturado até: {formatDateLabel(contract.latest_billing_period_end)}</span>
                  <span>Vencimento da fatura: {formatDateLabel(contract.latest_billing_due_date)}</span>
                </>
              ) : (
                <span>Nenhum período emitido</span>
              )}
              {contract.billing_coverage_status === 'current' ? (
                <span className="mt-1 justify-self-start rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 md:justify-self-end">
                  Período vigente
                </span>
              ) : null}
              <span className="mt-1 text-xs">Início: {formatDateLabel(contract.start_date)} · Itens: {contract.item_count}</span>
            </div>
          ) : (
            <div className="grid gap-1 text-sm text-gray-500 md:text-right">
              <span>Início: {contract.start_date}</span>
              <span>Recorrência: {contract.recurrence_days} dias</span>
              <span>Itens: {contract.item_count}</span>
            </div>
          )}
        </div>
      </Link>
      {needsBillingPeriod ? (
        <div className="flex justify-end border-t border-gray-100 px-5 py-3">
          <Link
            className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
            href={`/contratos-locacoes/contratos/${contract.id}?action=new-billing`}
          >
            Emitir período
          </Link>
        </div>
      ) : null}
    </article>
  );
}
