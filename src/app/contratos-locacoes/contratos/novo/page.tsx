'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ContractForm } from '@/components/contratos-locacoes/ContractForm';
import { createContractWithOptionalRemittance } from '@/lib/contratos-locacoes/contract-creation';
import { createLocalDraftKey } from '@/lib/contratos-locacoes/local-draft';
import { createContract, createSupabaseContractsLocacoesMutationClient } from '@/lib/contratos-locacoes/mutations';
import {
  createSupabaseContractsLocacoesRemittanceDocumentClient,
  saveRemittanceInvoiceDocument,
} from '@/lib/contratos-locacoes/remittance-documents';
import {
  createSupabaseContractsLocacoesReadClient,
  getCustomer,
  listAvailableRentalAssets,
  listCustomers,
} from '@/lib/contratos-locacoes/queries';
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

  const handleSubmit = async (value: ContractDraftInput, remittanceInvoiceFile: File | null) => {
    const selectedAssetIds = value.items
      .map((item) => item.asset_id)
      .filter((assetId): assetId is string => Boolean(assetId));

    if (selectedAssetIds.length > 0) {
      const availableAssets = await handleLoadAvailableAssets(value.start_date, value.end_date);
      const availableAssetIds = new Set(availableAssets.map((asset) => asset.id));
      const unavailableAssetIds = selectedAssetIds.filter((assetId) => !availableAssetIds.has(assetId));

      if (unavailableAssetIds.length > 0) {
        throw new Error('Um ou mais ativos selecionados não estão disponíveis para o período informado.');
      }
    }

    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const outcome = await createContractWithOptionalRemittance({
      createContract: () => createContract(mutationClient, value),
      remittanceInvoiceFile,
      uploadRemittanceDocument: (contract, file) => {
        const documentClient = createSupabaseContractsLocacoesRemittanceDocumentClient(supabase);
        return saveRemittanceInvoiceDocument(documentClient, contract, file);
      },
    });

    if (outcome.remittanceUploadError) {
      toast.error(
        'Locação criada, mas não foi possível anexar a NF de remessa. Você poderá anexá-la novamente no detalhe da locação.'
      );
    } else if (outcome.remittanceDocument) {
      toast.success('Locação criada e NF de remessa anexada com sucesso.');
    } else {
      toast.success('Locação criada com sucesso.');
    }

    router.push(`/contratos-locacoes/contratos/${outcome.creation.contract.id}`);
  };

  const handleLoadAvailableAssets = useCallback(async (startDate: string, endDate: string | null) => {
    const readClient = createSupabaseContractsLocacoesReadClient(supabase);
    return listAvailableRentalAssets(readClient, {
      start_date: startDate,
      end_date: endDate,
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Nova locação</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cadastre o cliente, os equipamentos e as condições principais da locação.
        </p>
      </div>

      <ContractForm
        customers={customers}
        customerSites={sites}
        draftStorageKey={CONTRACT_CREATE_DRAFT_KEY}
        loadAvailableAssets={handleLoadAvailableAssets}
        submitLabel="Criar locação"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
