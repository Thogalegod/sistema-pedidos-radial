'use client';

import { useEffect, useState } from 'react';
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (failed) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <p className="font-semibold text-slate-900">Não foi possível carregar o painel.</p>
        <p className="mt-2">Verifique sua conexão e tente novamente. Os valores não puderam ser consultados.</p>
        <button type="button" onClick={() => {
          setFailed(false);
          setAttempt(value => value + 1);
        }} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Tentar novamente
        </button>
      </div>
    );
  }

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
