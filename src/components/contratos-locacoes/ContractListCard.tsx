import Link from 'next/link';
import type { ContractListItem } from '@/lib/contratos-locacoes/queries';
import { getContractKindLabel, getContractStatusLabel } from '@/lib/contratos-locacoes/contract-presentation';

interface ContractListCardProps {
  contract: ContractListItem;
}

export function ContractListCard({ contract }: ContractListCardProps) {
  return (
    <Link
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
      href={`/contratos-locacoes/contratos/${contract.id}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{contract.customer_name}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {getContractKindLabel(contract.kind)}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {getContractStatusLabel(contract.status)}
            </span>
          </div>
          {contract.legacy_order_number ? (
            <p className="mt-1 text-sm font-semibold text-gray-700">{contract.legacy_order_number}</p>
          ) : null}
          <p className="text-sm text-gray-500">{contract.site_name}</p>
        </div>
        <div className="grid gap-1 text-sm text-gray-500 md:text-right">
          <span>Início: {contract.start_date}</span>
          <span>Recorrência: {contract.recurrence_days} dias</span>
          <span>Itens: {contract.item_count}</span>
        </div>
      </div>
    </Link>
  );
}
