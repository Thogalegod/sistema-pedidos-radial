'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CustomerForm } from '@/components/contratos-locacoes/CustomerForm';
import { createLocalDraftKey } from '@/lib/contratos-locacoes/local-draft';
import { createCustomer, createSupabaseContractsLocacoesMutationClient } from '@/lib/contratos-locacoes/mutations';
import type { CustomerDraftInput } from '@/lib/contratos-locacoes/schemas';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const CUSTOMER_CREATE_DRAFT_KEY = createLocalDraftKey('clientes/novo');

export default function NovoClientePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => {
    const candidate = searchParams.get('returnTo');
    return candidate && candidate.startsWith('/contratos-locacoes/') ? candidate : null;
  }, [searchParams]);

  const handleSubmit = async (value: CustomerDraftInput) => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const result = await createCustomer(mutationClient, value);

    toast.success('Cliente cadastrado com sucesso.');
    router.push(returnTo ?? `/contratos-locacoes/clientes/${result.customer.id}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Novo cliente</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cadastre a empresa, as obras/locais e os contatos gerais ou por obra.
        </p>
      </div>

      <CustomerForm
        draftStorageKey={CUSTOMER_CREATE_DRAFT_KEY}
        submitLabel="Salvar cliente"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
