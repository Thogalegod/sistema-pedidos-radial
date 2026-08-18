'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CustomerForm } from '@/components/contratos-locacoes/CustomerForm';
import { createLocalDraftKey } from '@/lib/contratos-locacoes/local-draft';
import {
  getCustomer,
  createSupabaseContractsLocacoesReadClient,
} from '@/lib/contratos-locacoes/queries';
import {
  updateCustomer,
  createSupabaseContractsLocacoesMutationClient,
} from '@/lib/contratos-locacoes/mutations';
import type { CustomerDraftInput } from '@/lib/contratos-locacoes/schemas';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function ClienteDetalhePage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CustomerDraftInput | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const detail = await getCustomer(readClient, customerId);

        if (!cancelled) {
          setDraft({
            legal_name: detail.customer.legal_name,
            trade_name: detail.customer.trade_name,
            tax_id: detail.customer.tax_id,
            state_registration: detail.customer.state_registration,
            municipal_registration: detail.customer.municipal_registration,
            notes: detail.customer.notes,
            active: detail.customer.active,
            sites: detail.sites.map((site) => ({
              id: site.id,
              name: site.name,
              address_line: site.address_line,
              number: site.number,
              complement: site.complement,
              district: site.district,
              city: site.city,
              state: site.state,
              postal_code: site.postal_code,
              notes: site.notes,
              active: site.active,
            })),
            contacts: detail.contacts.map((contact) => ({
              id: contact.id,
              name: contact.name,
              job_title: contact.job_title,
              department: contact.department,
              phone: contact.phone,
              whatsapp: contact.whatsapp,
              email: contact.email,
              site_id: contact.site_id,
              is_primary: contact.is_primary,
              receives_billing: contact.receives_billing,
              receives_technical: contact.receives_technical,
              notes: contact.notes,
            })),
          });
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o cliente.');
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
  }, [customerId]);

  const handleSubmit = async (value: CustomerDraftInput) => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await updateCustomer(mutationClient, customerId, value);
    setDraft(value);
    toast.success('Cliente atualizado com sucesso.');
  };

  return (
    <div className="space-y-4">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
        href="/contratos-locacoes/clientes"
      >
        <ArrowLeft size={16} />
        Voltar para clientes
      </Link>

      <p className="text-sm text-gray-500">
        Edite os dados centrais, as obras/locais e os contatos vinculados.
      </p>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Carregando cliente...
        </div>
      ) : draft ? (
        <CustomerForm
          draftStorageKey={createLocalDraftKey(`clientes/${customerId}`)}
          initialValue={draft}
          submitLabel="Salvar alterações"
          onSubmit={handleSubmit}
        />
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Cliente não encontrado ou inacessível para o usuário atual.
        </div>
      )}
    </div>
  );
}
