'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BillingTable } from '@/components/contratos-locacoes/BillingTable';
import { createSupabaseContractsLocacoesReadClient, listBillings, type BillingListItem } from '@/lib/contratos-locacoes/queries';
import { supabase } from '@/lib/supabase';

export default function CobrancasPage() {
  const [billings, setBillings] = useState<BillingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'to_issue' | 'due_soon' | 'due_today' | 'overdue' | 'issued' | 'paid' | 'exempt' | 'cancelled'>('all');
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await listBillings(readClient, new Date().toISOString().slice(0, 10), {
          search: deferredSearch,
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
  }, [deferredSearch, status]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <input
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          placeholder="Buscar por cliente, obra, OS ou documento"
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
