'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import toast from 'react-hot-toast';
import { ContractSummary } from '@/components/contratos-locacoes/ContractSummary';
import { createSupabaseContractsLocacoesReadClient, getContract, type ContractDetail } from '@/lib/contratos-locacoes/queries';
import { createSupabaseContractsLocacoesMutationClient, pauseContract, reactivateContract } from '@/lib/contratos-locacoes/mutations';
import { supabase } from '@/lib/supabase';

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const contractId = params.id;
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const readClient = createSupabaseContractsLocacoesReadClient(supabase);
      const data = await getContract(readClient, contractId);
      setDetail(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o contrato.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;
    const readClient = createSupabaseContractsLocacoesReadClient(supabase);

    async function loadInitialDetail() {
      try {
        const data = await getContract(readClient, contractId);
        if (!isActive) {
          return;
        }

        setDetail(data);
      } catch (error) {
        if (!isActive) {
          return;
        }

        toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o contrato.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadInitialDetail();

    return () => {
      isActive = false;
    };
  }, [contractId]);

  const handlePause = async () => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await pauseContract(mutationClient, contractId, {
      pause_started_at: new Date().toISOString().slice(0, 10),
      pause_reason: 'Pausado manualmente pelo usuário',
    });
    toast.success('Contrato pausado.');
    await load();
  };

  const handleReactivate = async () => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await reactivateContract(mutationClient, contractId, {
      reactivated_at: new Date().toISOString().slice(0, 10),
    });
    toast.success('Contrato reativado.');
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          href="/contratos-locacoes/contratos"
        >
          <ArrowLeft size={16} />
          Voltar para contratos
        </Link>

        {detail?.contract.status === 'paused' ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            onClick={() => void handleReactivate()}
            type="button"
          >
            <Play size={16} />
            Reativar
          </button>
        ) : (
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            onClick={() => void handlePause()}
            type="button"
          >
            <Pause size={16} />
            Pausar
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando contrato...</div>
      ) : detail ? (
        <>
          <ContractSummary detail={detail} />

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Itens da locação</h3>
            {detail.items.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Este contrato não possui itens de equipamento.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {detail.items.map((item) => (
                  <div className="rounded-xl border border-gray-200 p-4" key={item.id}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{item.description}</p>
                        <p className="text-sm text-gray-500">{item.equipment_type} • {item.capacity}</p>
                      </div>
                      <div className="grid gap-1 text-sm text-gray-500 md:text-right">
                        <span>Qtd: {item.quantity}</span>
                        <span>Valor unit.: {item.unit_amount}</span>
                        <span>Status: {item.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Contrato não encontrado.
        </div>
      )}
    </div>
  );
}
