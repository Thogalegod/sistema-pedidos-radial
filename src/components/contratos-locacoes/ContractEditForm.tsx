'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CONTRACT_COMPANY_OPTIONS } from '@/lib/contratos-locacoes/company';
import {
  CONTRACT_EDIT_LOCKED_MESSAGE,
  getContractEditErrorMessage,
  type ContractEditInput,
  type ContractEditItemInput,
} from '@/lib/contratos-locacoes/contract-edit';
import type { CustomerListItem } from '@/lib/contratos-locacoes/queries';
import type { CustomerSite, RentalAsset } from '@/lib/contratos-locacoes/types';
import { RentalItemsEditor } from './RentalItemsEditor';

interface ContractEditFormProps {
  customers: CustomerListItem[];
  customerSites: CustomerSite[];
  hasBilling: boolean;
  initialValue: ContractEditInput;
  availableAssets?: RentalAsset[];
  loadAvailableAssets?: (startDate: string) => Promise<RentalAsset[]>;
  onCancel: () => void;
  onSubmit: (value: ContractEditInput) => Promise<void> | void;
}

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';
const EMPTY_ASSETS: RentalAsset[] = [];

export function ContractEditForm({
  customers,
  customerSites,
  hasBilling,
  initialValue,
  availableAssets = EMPTY_ASSETS,
  loadAvailableAssets,
  onCancel,
  onSubmit,
}: ContractEditFormProps) {
  const [draft, setDraft] = useState<ContractEditInput>(() => cloneInput(initialValue));
  const [assets, setAssets] = useState(availableAssets);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const itemCounter = useRef(0);
  const structuralLocked = hasBilling;
  const orderLocked = hasBilling && initialValue.legacy_order_number !== null;
  const sites = useMemo(
    () => customerSites.filter((site) => site.customer_id === draft.customer_id),
    [customerSites, draft.customer_id]
  );

  useEffect(() => setAssets(availableAssets), [availableAssets]);

  useEffect(() => {
    if (!loadAvailableAssets || !draft.start_date || structuralLocked) return;
    let active = true;
    loadAvailableAssets(draft.start_date)
      .then((nextAssets) => {
        if (active) setAssets(nextAssets);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível reavaliar os ativos disponíveis.');
      });
    return () => { active = false; };
  }, [draft.start_date, loadAvailableAssets, structuralLocked]);

  function update(patch: Partial<ContractEditInput>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function createItem(): ContractEditItemInput {
    return {
      id: `edit-item-${itemCounter.current++}`,
      asset_id: null,
      description: '',
      equipment_type: '',
      capacity: null,
      serial_number: null,
      internal_code: null,
      quantity: 1,
      unit_amount: '0',
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(draft);
    } catch (submissionError) {
      setError(getContractEditErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-4" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Editar locação</h2>
        {structuralLocked ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {CONTRACT_EDIT_LOCKED_MESSAGE}
          </p>
        ) : null}
      </div>

      <section className="grid gap-4 rounded-xl bg-white p-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Empresa
          <select aria-label="Empresa" className={inputClass} disabled={structuralLocked} value={draft.contract_company} onChange={(event) => update({ contract_company: event.target.value as ContractEditInput['contract_company'] })}>
            {CONTRACT_COMPANY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Cliente
          <select aria-label="Cliente" className={inputClass} disabled={structuralLocked} value={draft.customer_id} onChange={(event) => update({ customer_id: event.target.value, site_id: '' })}>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legal_name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Obra/local
          <select aria-label="Obra/local" className={inputClass} disabled={structuralLocked} value={draft.site_id} onChange={(event) => update({ site_id: event.target.value })}>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Início
          <input aria-label="Início" className={inputClass} disabled={structuralLocked} type="date" value={draft.start_date} onChange={(event) => update({ start_date: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-2">
          Nº do pedido
          <input aria-label="Nº do pedido" className={inputClass} disabled={orderLocked} value={draft.legacy_order_number ?? ''} onChange={(event) => update({ legacy_order_number: event.target.value || null })} />
        </label>
      </section>

      <section className="rounded-xl bg-white p-4">
        <RentalItemsEditor
          availableAssets={assets}
          createItem={createItem}
          items={draft.items}
          onChange={(items) => update({ items })}
          priceHelpText={hasBilling ? 'Alterações de valor afetam somente os próximos períodos.' : undefined}
          showExtendedIdentityFields
          structureLocked={structuralLocked}
        />
      </section>

      <section className="grid gap-4 rounded-xl bg-white p-4">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Transporte
          <textarea aria-label="Transporte" className={inputClass} rows={2} value={draft.transport_notes ?? ''} onChange={(event) => update({ transport_notes: event.target.value || null })} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Observações
          <textarea aria-label="Observações" className={inputClass} rows={3} value={draft.notes ?? ''} onChange={(event) => update({ notes: event.target.value || null })} />
        </label>
      </section>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700" onClick={onCancel} type="button">Cancelar</button>
        <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
          Salvar alterações
        </button>
      </div>
    </form>
  );
}

function cloneInput(value: ContractEditInput): ContractEditInput {
  return {
    ...value,
    items: value.items.map((item) => ({ ...item, unit_amount: String(item.unit_amount) })),
  };
}
