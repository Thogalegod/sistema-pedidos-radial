'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertList } from '@/components/contratos-locacoes/AlertList';
import { DashboardCards } from '@/components/contratos-locacoes/DashboardCards';
import { createSupabaseContractsLocacoesReadClient, getDashboardSnapshot } from '@/lib/contratos-locacoes/queries';
import type { DashboardSnapshot } from '@/lib/contratos-locacoes/dashboard';
import { supabase } from '@/lib/supabase';

export default function ContratosLocacoesPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await getDashboardSnapshot(readClient, new Date().toISOString().slice(0, 10));

        if (!cancelled) {
          setSnapshot(data);
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
      <DashboardCards snapshot={snapshot} />
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Alertas prioritários</h2>
          <p className="text-sm text-gray-500">Vencidos, vencendo em 7 dias e cobranças no dia.</p>
        </div>
        <AlertList alerts={snapshot.alerts} />
      </section>
    </div>
  );
}
