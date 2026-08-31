'use client';

import { useEffect, useState } from 'react';
import { CustomerList } from '@/components/contratos-locacoes/CustomerList';
import { createSupabaseContractsLocacoesReadClient, listCustomers, type CustomerListItem } from '@/lib/contratos-locacoes/queries';
import { useDebouncedValue } from '@/lib/contratos-locacoes/use-debounced-value';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ClientesPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await listCustomers(readClient, {
          search: debouncedSearch,
          status,
        });

        if (!cancelled) {
          setCustomers(data);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar clientes.');
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
  }, [debouncedSearch, status]);

  return (
    <CustomerList
      customers={customers}
      loading={loading}
      search={search}
      status={status}
      onSearchChange={setSearch}
      onStatusChange={setStatus}
    />
  );
}
