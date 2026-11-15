'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CONTRACT_COMPANY_OPTIONS, getContractCompanyLabel } from '@/lib/contratos-locacoes/company';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import {
  CONTRACT_EDIT_LOCKED_MESSAGE,
  getContractEditErrorMessage,
  type ContractEditInput,
  type ContractEditItemInput,
} from '@/lib/contratos-locacoes/contract-edit';
import type { CustomerListItem } from '@/lib/contratos-locacoes/queries';
import type { CustomerSite, RentalAsset } from '@/lib/contratos-locacoes/types';
import { RentalItemsEditor } from './RentalItemsEditor';
import { CurrencyInput } from './CurrencyInput';

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

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';
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
  const customerName = customers.find((customer) => customer.id === draft.customer_id)?.legal_name ?? 'Cliente atual';
  const siteName = customerSites.find((site) => site.id === draft.site_id)?.name ?? 'Obra/local atual';

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
    <form className="flex h-full min-h-0 flex-col bg-white" onSubmit={handleSubmit}>
      <div className="shrink-0 border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 id="contract-edit-title" className="text-xl font-semibold tracking-tight text-slate-950">Editar locação</h2>
        <p className="mt-1 text-sm text-slate-600">Altere os dados disponíveis e salve ao terminar.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
      {structuralLocked ? (
        <section className="space-y-4" aria-label="Informações bloqueadas">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Dados da locação</h3>
            <p className="mt-1 text-xs text-slate-600">{CONTRACT_EDIT_LOCKED_MESSAGE}</p>
          </div>
          <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            {[
              ['Empresa', getContractCompanyLabel(draft.contract_company)],
              ['Cliente', customerName],
              ['Obra/local', siteName],
              ['Início', formatDateLabel(draft.start_date)],
              ...(orderLocked ? [['Nº do pedido', draft.legacy_order_number ?? 'Não informado']] : []),
            ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd></div>)}
          </dl>
          {!orderLocked ? <label className="grid gap-1.5 text-sm font-medium text-slate-700">Nº do pedido
            <input aria-label="Nº do pedido" className={inputClass} value={draft.legacy_order_number ?? ''} onChange={(event) => update({ legacy_order_number: event.target.value || null })} />
          </label> : null}
        </section>
      ) : <section className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2" aria-label="Dados editáveis da locação">
        <h3 className="sm:col-span-2 text-sm font-semibold text-slate-900">Dados da locação</h3>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Empresa
          <select aria-label="Empresa" className={inputClass} value={draft.contract_company} onChange={(event) => update({ contract_company: event.target.value as ContractEditInput['contract_company'] })}>
            {CONTRACT_COMPANY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Cliente
          <select aria-label="Cliente" className={inputClass} value={draft.customer_id} onChange={(event) => update({ customer_id: event.target.value, site_id: '' })}>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legal_name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Obra/local
          <select aria-label="Obra/local" className={inputClass} value={draft.site_id} onChange={(event) => update({ site_id: event.target.value })}>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Início
          <input aria-label="Início" className={inputClass} type="date" value={draft.start_date} onChange={(event) => update({ start_date: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700 md:col-span-2">
          Nº do pedido
          <input aria-label="Nº do pedido" className={inputClass} value={draft.legacy_order_number ?? ''} onChange={(event) => update({ legacy_order_number: event.target.value || null })} />
        </label>
      </section>}

      <section className="rounded-xl border border-slate-200 p-4" aria-label="Valores e itens">
        {structuralLocked ? <div className="space-y-3">
          <div><h3 className="text-sm font-semibold text-slate-900">Valores dos itens</h3><p className="mt-1 text-xs text-slate-600">Alterações de valor afetam somente os próximos períodos.</p></div>
          {draft.items.map((item) => <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
            <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500">Quantidade {item.quantity} · Valor atual {formatBRL(initialValue.items.find((entry) => entry.id === item.id)?.unit_amount)}</p></div>
            <label className="grid gap-1 text-sm font-medium text-slate-700 sm:w-44">Valor unitário
              <CurrencyInput aria-label="Valor unitário" className={inputClass} value={item.unit_amount} onValueChange={(value) => update({ items: draft.items.map((entry) => entry.id === item.id ? { ...entry, unit_amount: value } : entry) })} />
            </label>
          </div>)}
        </div> :
        <RentalItemsEditor
          availableAssets={assets}
          createItem={createItem}
          items={draft.items}
          onChange={(items) => update({ items })}
          priceHelpText={hasBilling ? 'Alterações de valor afetam somente os próximos períodos.' : undefined}
          showExtendedIdentityFields
          structureLocked={structuralLocked}
        />
        }
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 p-4" aria-label="Informações complementares">
        <h3 className="text-sm font-semibold text-slate-900">Informações complementares</h3>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Transporte
          <textarea aria-label="Transporte" className={inputClass} rows={2} value={draft.transport_notes ?? ''} onChange={(event) => update({ transport_notes: event.target.value || null })} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Observações
          <textarea aria-label="Observações" className={inputClass} rows={3} value={draft.notes ?? ''} onChange={(event) => update({ notes: event.target.value || null })} />
        </label>
      </section>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={submitting} onClick={onCancel} type="button">Cancelar</button>
        <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
          {submitting ? 'Salvando...' : 'Salvar alterações'}
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
