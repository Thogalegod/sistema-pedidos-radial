'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { OperationalAlertGroups } from '@/components/contratos-locacoes/OperationalAlertGroups';
import { DashboardCards } from '@/components/contratos-locacoes/DashboardCards';
import { createSupabaseContractsLocacoesReadClient, getDashboardSnapshot, listContracts, type ContractListItem } from '@/lib/contratos-locacoes/queries';
import type { DashboardSnapshot } from '@/lib/contratos-locacoes/dashboard';
import { toLocalDateKey } from '@/lib/contratos-locacoes/dates';
import { isPeriodToIssue } from '@/lib/contratos-locacoes/rental-operations';
import { supabase } from '@/lib/supabase';

export default function ContratosLocacoesPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [contracts, setContracts] = useState<ContractListItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const today = toLocalDateKey();
        const [data, rentalContracts] = await Promise.all([
          getDashboardSnapshot(readClient, today),
          listContracts(readClient, { kind: 'rental' }, today),
        ]);

        if (!cancelled) {
          setSnapshot(data);
          setContracts(rentalContracts);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o painel.');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot) {
    return <div className="rounded-3xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando painel...</div>;
  }

  return (
    <div className="space-y-6">
      <DashboardCards periodsToIssueCount={contracts.filter(isPeriodToIssue).length} snapshot={snapshot} />
      <OperationalAlertGroups alerts={snapshot.alerts} contracts={contracts} />
    </div>
  );
}
