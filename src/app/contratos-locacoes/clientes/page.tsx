'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { CustomerList } from '@/components/contratos-locacoes/CustomerList';
import { createSupabaseContractsLocacoesReadClient, listCustomers, type CustomerListItem } from '@/lib/contratos-locacoes/queries';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ClientesPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await listCustomers(readClient, {
          search: deferredSearch,
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
  }, [deferredSearch, status]);

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
