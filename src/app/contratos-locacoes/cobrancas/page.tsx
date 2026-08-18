'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { BillingTable } from '@/components/contratos-locacoes/BillingTable';
import { createSupabaseContractsLocacoesReadClient, listBillings, type BillingListItem } from '@/lib/contratos-locacoes/queries';
import { useDebouncedValue } from '@/lib/contratos-locacoes/use-debounced-value';
import {
  buildBillingMonthHref,
  formatBillingMonthLabel,
  resolveBillingMonth,
  shiftBillingMonth,
  toLocalDateKey,
} from '@/lib/contratos-locacoes/dates';
import { supabase } from '@/lib/supabase';

export default function CobrancasPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMonth = resolveBillingMonth(searchParams.get('month'));
  const [billings, setBillings] = useState<BillingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'to_issue' | 'due_soon' | 'due_today' | 'overdue' | 'issued' | 'paid' | 'exempt' | 'cancelled'>(
    normalizeStatusFilter(searchParams.get('status'))
  );
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await listBillings(readClient, toLocalDateKey(), {
          month: selectedMonth,
          search: debouncedSearch,
          status,
        });

        if (!cancelled) {
          setBillings(data);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar cobranças.');
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
  }, [debouncedSearch, selectedMonth, status]);

  function navigateMonth(offset: number) {
    router.push(buildBillingMonthHref(
      pathname,
      searchParams.toString(),
      shiftBillingMonth(selectedMonth, offset)
    ));
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Mês das cobranças" className="flex items-center justify-center gap-3">
        <button
          aria-label="Mês anterior"
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700"
          onClick={() => navigateMonth(-1)}
          type="button"
        >
          ‹
        </button>
        <strong className="min-w-28 text-center text-sm text-gray-900">{formatBillingMonthLabel(selectedMonth)}</strong>
        <button
          aria-label="Próximo mês"
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700"
          onClick={() => navigateMonth(1)}
          type="button"
        >
          ›
        </button>
      </nav>
      <div className="grid gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <input
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          placeholder="Buscar por cliente, pedido ou documento"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="rounded-xl border border-gray-300 px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">Todos os status</option>
          <option value="to_issue">A emitir</option>
          <option value="due_soon">Vencendo em 7 dias</option>
          <option value="due_today">No vencimento</option>
          <option value="overdue">Vencidas</option>
          <option value="issued">Emitidas</option>
          <option value="paid">Pagas</option>
        </select>
      </div>

      <BillingTable billings={billings} loading={loading} />
    </div>
  );
}

function normalizeStatusFilter(value: string | null) {
  const allowed = ['all', 'to_issue', 'due_soon', 'due_today', 'overdue', 'issued', 'paid', 'exempt', 'cancelled'] as const;
  return allowed.find((entry) => entry === value) ?? 'all';
}
