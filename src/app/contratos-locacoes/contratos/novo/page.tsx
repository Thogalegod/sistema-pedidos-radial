'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ContractForm } from '@/components/contratos-locacoes/ContractForm';
import { createLocalDraftKey } from '@/lib/contratos-locacoes/local-draft';
import { createContract, createSupabaseContractsLocacoesMutationClient } from '@/lib/contratos-locacoes/mutations';
import { createSupabaseContractsLocacoesReadClient, listCustomers, getCustomer } from '@/lib/contratos-locacoes/queries';
import type { ContractDraftInput } from '@/lib/contratos-locacoes/schemas';
import type { CustomerListItem } from '@/lib/contratos-locacoes/queries';
import type { CustomerSite } from '@/lib/contratos-locacoes/types';
import { supabase } from '@/lib/supabase';

const CONTRACT_CREATE_DRAFT_KEY = createLocalDraftKey('contratos/novo');

export default function NovoContratoPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [sites, setSites] = useState<CustomerSite[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const customersData = await listCustomers(readClient, { status: 'active' });
        if (!cancelled) {
          setCustomers(customersData);
        }

        const detailPromises = customersData.map((customer) => getCustomer(readClient, customer.id));
        const details = await Promise.all(detailPromises);
        if (!cancelled) {
          setSites(details.flatMap((detail) => detail.sites));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a base de clientes.');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (value: ContractDraftInput) => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const result = await createContract(mutationClient, value);
    toast.success('Contrato salvo com sucesso.');
    router.push(`/contratos-locacoes/contratos/${result.contract.id}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Novo contrato ou locação</h2>
        <p className="mt-1 text-sm text-gray-500">
          Crie contratos com ou sem equipamento e registre vários itens manuais quando for locação.
        </p>
      </div>

      <ContractForm
        customers={customers}
        customerSites={sites}
        draftStorageKey={CONTRACT_CREATE_DRAFT_KEY}
        submitLabel="Salvar contrato"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
