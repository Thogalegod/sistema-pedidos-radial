'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { listBillings, listContracts, listCustomers, createSupabaseContractsLocacoesReadClient, type BillingListItem, type ContractListItem, type CustomerListItem } from '@/lib/contratos-locacoes/queries';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { useDebouncedValue } from '@/lib/contratos-locacoes/use-debounced-value';
import { ContractListCard } from '@/components/contratos-locacoes/ContractListCard';
import { toLocalDateKey } from '@/lib/contratos-locacoes/dates';
import { filterContractsByQuickFilter, normalizeRentalQuickFilter, selectOperationalBilling, type RentalQuickFilter } from '@/lib/contratos-locacoes/rental-operations';

const quickFilters: Array<{ value: RentalQuickFilter; label: string }> = [
  { value: 'active', label: 'Ativas' },
  { value: 'all', label: 'Todas' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'periods_to_issue', label: 'Períodos a emitir' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'due_today', label: 'Vencem hoje' },
  { value: 'awaiting_return', label: 'Aguardando devolução' },
  { value: 'paused', label: 'Pausadas' },
];

export default function ContratosPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quickFilter = normalizeRentalQuickFilter(searchParams.get('quick'));
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [billings, setBillings] = useState<BillingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'rental' | 'energy_management' | 'recurring_service' | 'other'>('all');
  const [status, setStatus] = useState<'all' | 'draft' | 'active' | 'paused' | 'closing_requested' | 'awaiting_return' | 'inspection' | 'closed' | 'cancelled'>('all');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const hasActiveFilters = search.trim() !== '' || customerId !== '' || kind !== 'all' || status !== 'all' || quickFilter !== 'active';
  const visibleContracts = filterContractsByQuickFilter(contracts, billings, quickFilter);

  const clearFilters = () => {
    setSearch('');
    setCustomerId('');
    setKind('all');
    setStatus('all');
    if (quickFilter !== 'active') router.push(pathname);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await listCustomers(readClient, { status: 'all' });
        if (!cancelled) {
          setCustomers(data);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar clientes.');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const today = toLocalDateKey();
        const [data, financialRows] = await Promise.all([
          listContracts(readClient, {
            search: debouncedSearch,
            kind,
            status,
            customerId: customerId || undefined,
          }, today),
          listBillings(readClient, today),
        ]);
        if (!cancelled) {
          setContracts(data);
          setBillings(financialRows);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar contratos.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, kind, status, customerId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Buscar por cliente, obra, número ou pedido/OS"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <select aria-label="Cliente" className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Todos os clientes</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.legal_name}</option>
            ))}
          </select>
          <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="all">Todos os tipos</option>
            <option value="rental">Locação</option>
            <option value="energy_management">Gestão de energia</option>
            <option value="recurring_service">Serviço recorrente</option>
            <option value="other">Outro contrato</option>
          </select>
          <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
            <option value="closed">Encerrado</option>
            <option value="cancelled">Cancelado</option>
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
              onClick={clearFilters}
            >
              <RotateCcw size={16} />
              Limpar filtros
            </button>
          )}
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-radial-primary px-4 py-2 text-sm font-semibold text-white hover:bg-radial-primary-hover whitespace-nowrap"
            href="/contratos-locacoes/contratos/novo"
          >
            <Plus size={16} />
            Nova locação
          </Link>
        </div>
      </div>

      <nav aria-label="Filtros rápidos de locações" className="flex gap-1.5 overflow-x-auto pb-1">
        {quickFilters.map((filter) => (
          <Link
            aria-current={quickFilter === filter.value ? 'page' : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${quickFilter === filter.value ? 'border-radial-primary bg-emerald-50 text-emerald-900' : 'border-radial-border bg-white text-slate-600 hover:bg-slate-50'}`}
            href={filter.value === 'active' ? pathname : `${pathname}?quick=${filter.value}`}
            key={filter.value}
          >{filter.label}</Link>
        ))}
      </nav>

      <div className="grid gap-2.5">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando contratos...</div>
        ) : visibleContracts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
            <p className="text-base font-semibold text-gray-900">{hasActiveFilters ? 'Nenhuma locação encontrada para estes filtros' : 'Nenhum contrato ou locação encontrado'}</p>
            <p className="mt-1 text-sm text-gray-500">{hasActiveFilters ? 'Ajuste ou limpe os filtros para ver outras locações.' : 'Crie o primeiro contrato para começar o módulo.'}</p>
          </div>
        ) : (
          visibleContracts.map((contract) => <ContractListCard billing={selectOperationalBilling(contract.id, billings)} contract={contract} key={contract.id} />)
        )}
      </div>
    </div>
  );
}
