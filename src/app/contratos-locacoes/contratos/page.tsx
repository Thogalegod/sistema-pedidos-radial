'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { listContracts, createSupabaseContractsLocacoesReadClient, type ContractListItem } from '@/lib/contratos-locacoes/queries';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { useDebouncedValue } from '@/lib/contratos-locacoes/use-debounced-value';
import { ContractListCard } from '@/components/contratos-locacoes/ContractListCard';
import { toLocalDateKey } from '@/lib/contratos-locacoes/dates';

export default function ContratosPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'rental' | 'energy_management' | 'recurring_service' | 'other'>('all');
  const [status, setStatus] = useState<'all' | 'draft' | 'active' | 'paused' | 'closing_requested' | 'awaiting_return' | 'inspection' | 'closed' | 'cancelled'>('all');
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await listContracts(readClient, {
          search: debouncedSearch,
          kind,
          status,
        }, toLocalDateKey());
        if (!cancelled) {
          setContracts(data);
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
  }, [debouncedSearch, kind, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Buscar por cliente, obra, número ou pedido/OS"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
            href="/contratos-locacoes/contratos/novo"
          >
            <Plus size={16} />
            Nova locação
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando contratos...</div>
        ) : contracts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
            <p className="text-base font-semibold text-gray-900">Nenhum contrato ou locação encontrado</p>
            <p className="mt-1 text-sm text-gray-500">Crie o primeiro contrato para começar o módulo.</p>
          </div>
        ) : (
          contracts.map((contract) => <ContractListCard contract={contract} key={contract.id} />)
        )}
      </div>
    </div>
  );
}
