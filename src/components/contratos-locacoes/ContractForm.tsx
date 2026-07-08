'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { contractDraftSchema, type ContractDraftInput } from '@/lib/contratos-locacoes/schemas';
import { formatBRL, parseBRL } from '@/lib/contratos-locacoes/money';
import { CONTRACT_COMPANY_OPTIONS, getContractCompanyLabel } from '@/lib/contratos-locacoes/company';
import type { CustomerSite } from '@/lib/contratos-locacoes/types';
import type { CustomerListItem } from '@/lib/contratos-locacoes/queries';
import { useLocalDraft } from '@/lib/contratos-locacoes/use-local-draft';
import { LocalDraftStatus } from './LocalDraftStatus';
import { createEmptyRentalItem, RentalItemsEditor } from './RentalItemsEditor';

type ContractFormProps = {
  customers: CustomerListItem[];
  customerSites: CustomerSite[];
  submitLabel: string;
  onSubmit: (value: ContractDraftInput) => Promise<void> | void;
  initialValue?: ContractDraftInput;
  draftStorageKey?: string;
};

function normalizeReactId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function createInitialContract(initialItemId: string): ContractDraftInput {
  return {
    kind: 'rental',
    customer_id: '',
    site_id: '',
    legacy_order_number: null,
    contract_company: 'fontes',
    transport_notes: null,
    has_remittance_invoice: false,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
    start_date: '',
    end_date: null,
    recurrence_days: 30,
    pricing_model: 'fixed',
    base_amount: '0',
    percentage_rate: null,
    status: 'draft',
    notes: null,
    items: [createEmptyRentalItem(initialItemId)],
  };
}

export function ContractForm({
  customers,
  customerSites,
  submitLabel,
  onSubmit,
  initialValue,
  draftStorageKey,
}: ContractFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const itemIdSeed = normalizeReactId(useId());
  const initialItemId = `item-${itemIdSeed}-initial`;
  const baseValue = useMemo(() => initialValue ?? createInitialContract(initialItemId), [initialItemId, initialValue]);
  const {
    draft,
    setDraft,
    savedAt,
    status,
    restoreConflictDraft,
    discardLocalDraft,
    markSynced,
  } = useLocalDraft({
    initialValue: baseValue,
    serverValue: initialValue ?? null,
    storageKey: draftStorageKey,
  });

  const availableSites = useMemo(
    () => customerSites.filter((site) => site.customer_id === draft.customer_id),
    [customerSites, draft.customer_id]
  );

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  const isRental = draft.kind === 'rental';
  const showOperationalFields = isRental;
  const hasRemittanceInvoice = draft.has_remittance_invoice;
  const remittanceIssuerLabel = getContractCompanyLabel(draft.contract_company);

  const clearRemittanceInvoiceFields = () => ({
    has_remittance_invoice: false,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const parsed = contractDraftSchema.safeParse(draft);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise os campos obrigatórios.');
      return;
    }

    startTransition(async () => {
      try {
        await onSubmit(parsed.data);
        markSynced(parsed.data);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar o contrato.');
      }
    });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <LocalDraftStatus
        onDiscard={draftStorageKey ? discardLocalDraft : undefined}
        onRestore={draftStorageKey ? restoreConflictDraft : undefined}
        savedAt={savedAt}
        status={status}
      />

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Dados centrais</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-kind">Tipo do contrato</label>
            <select
              aria-label="Tipo do contrato"
              className={inputClass}
              id="contract-kind"
              value={draft.kind}
              onChange={(event) => {
                const kind = event.target.value as ContractDraftInput['kind'];

                setDraft((current) => {
                  if (kind === 'rental') {
                    return {
                      ...current,
                      kind,
                      items: current.items.length > 0 ? current.items : [createEmptyRentalItem(initialItemId)],
                    };
                  }

                  return {
                    ...current,
                    kind,
                    items: [],
                    transport_notes: null,
                    ...clearRemittanceInvoiceFields(),
                  };
                });
              }}
            >
              <option value="rental">Locação</option>
              <option value="energy_management">Gestão de energia</option>
              <option value="recurring_service">Serviço recorrente</option>
              <option value="other">Outro contrato</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-status">Status inicial</label>
            <select
              className={inputClass}
              id="contract-status"
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as ContractDraftInput['status'],
                }))
              }
            >
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-company">Empresa</label>
            <select
              aria-label="Empresa"
              className={inputClass}
              id="contract-company"
              value={draft.contract_company}
              onChange={(event) => {
                const contractCompany = event.target.value as ContractDraftInput['contract_company'];

                setDraft((current) => {
                  const nextDraft = {
                    ...current,
                    contract_company: contractCompany,
                  };

                  if (current.kind === 'rental' && current.has_remittance_invoice) {
                    return {
                      ...nextDraft,
                      remittance_invoice_issuer: getContractCompanyLabel(contractCompany),
                    };
                  }

                  return nextDraft;
                });
              }}
            >
              {CONTRACT_COMPANY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-customer">Cliente</label>
            <select
              aria-label="Cliente"
              className={inputClass}
              id="contract-customer"
              value={draft.customer_id}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  customer_id: event.target.value,
                  site_id: '',
                }))
              }
            >
              <option value="">Selecione</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.legal_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-site">Obra/local</label>
            <select
              aria-label="Obra/local"
              className={inputClass}
              id="contract-site"
              value={draft.site_id}
              onChange={(event) => setDraft((current) => ({ ...current, site_id: event.target.value }))}
            >
              <option value="">Selecione</option>
              {availableSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-start">Início</label>
            <input
              aria-label="Início"
              className={inputClass}
              id="contract-start"
              type="date"
              value={draft.start_date}
              onChange={(event) => setDraft((current) => ({ ...current, start_date: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-end">Fim</label>
            <input
              className={inputClass}
              id="contract-end"
              type="date"
              value={draft.end_date ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, end_date: event.target.value || null }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-recurrence">Recorrência (dias)</label>
            <input
              className={inputClass}
              id="contract-recurrence"
              min={1}
              type="number"
              value={draft.recurrence_days}
              onChange={(event) => setDraft((current) => ({ ...current, recurrence_days: Number(event.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-pricing">Modelo de preço</label>
            <select
              className={inputClass}
              id="contract-pricing"
              value={draft.pricing_model}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  pricing_model: event.target.value as ContractDraftInput['pricing_model'],
                }))
              }
            >
              <option value="fixed">Fixo</option>
              <option value="variable">Variável</option>
              <option value="percentage">Percentual</option>
              <option value="fixed_plus_variable">Fixo + variável</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-base-amount">Valor base</label>
            <input
              aria-label="Valor base"
              className={inputClass}
              id="contract-base-amount"
              inputMode="decimal"
              value={formatBRL(draft.base_amount)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  base_amount: String(parseBRL(event.target.value)),
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-legacy">Pedido/OS legado</label>
            <input
              className={inputClass}
              id="contract-legacy"
              value={draft.legacy_order_number ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, legacy_order_number: event.target.value || null }))}
            />
          </div>
          {showOperationalFields ? (
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-transport">Transporte</label>
              <textarea
                aria-label="Transporte"
                className={inputClass}
                id="contract-transport"
                rows={2}
                value={draft.transport_notes ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, transport_notes: event.target.value || null }))}
              />

              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Nota fiscal de remessa</h3>
                    <p className="text-sm text-gray-500">Dado operacional do contrato, sem vínculo com cobrança.</p>
                  </div>
                  <div className="min-w-52">
                    <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-has-remittance">
                      Tem nota fiscal de remessa?
                    </label>
                    <select
                      aria-label="Tem nota fiscal de remessa?"
                      className={inputClass}
                      id="contract-has-remittance"
                      value={hasRemittanceInvoice ? 'yes' : 'no'}
                      onChange={(event) =>
                        setDraft((current) => {
                          if (event.target.value === 'yes') {
                            return {
                              ...current,
                              has_remittance_invoice: true,
                              remittance_invoice_issuer: getContractCompanyLabel(current.contract_company),
                            };
                          }

                          return {
                            ...current,
                            ...clearRemittanceInvoiceFields(),
                          };
                        })
                      }
                    >
                      <option value="no">Não</option>
                      <option value="yes">Sim</option>
                    </select>
                  </div>
                </div>

                {hasRemittanceInvoice ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-remittance-number">Número da NF</label>
                      <input
                        aria-label="Número da NF"
                        className={inputClass}
                        id="contract-remittance-number"
                        value={draft.remittance_invoice_number ?? ''}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            remittance_invoice_number: event.target.value || null,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-remittance-issuer">Empresa emissora</label>
                      <input
                        aria-label="Empresa emissora"
                        className={inputClass}
                        id="contract-remittance-issuer"
                        readOnly
                        value={remittanceIssuerLabel}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-remittance-amount">Valor da NF</label>
                      <input
                        aria-label="Valor da NF"
                        className={inputClass}
                        id="contract-remittance-amount"
                        inputMode="decimal"
                        value={formatBRL(draft.remittance_invoice_amount)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            remittance_invoice_amount: String(parseBRL(event.target.value)),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-remittance-date">Data de emissão da NF</label>
                      <input
                        aria-label="Data de emissão da NF"
                        className={inputClass}
                        id="contract-remittance-date"
                        type="date"
                        value={draft.remittance_invoice_issue_date ?? ''}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            remittance_invoice_issue_date: event.target.value || null,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-600">
                    Não houve NF de remessa informada.
                  </div>
                )}

                <p className="mt-4 text-xs text-gray-500">Anexo da NF será tratado em etapa futura.</p>
              </div>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-notes">Observações</label>
            <textarea
              className={inputClass}
              id="contract-notes"
              rows={3}
              value={draft.notes ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value || null }))}
            />
          </div>
        </div>
      </section>

      {isRental ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <RentalItemsEditor
            items={draft.items}
            onChange={(items) => setDraft((current) => ({ ...current, items }))}
          />
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
          disabled={isPending}
          type="submit"
        >
          {isPending ? <Loader2 className="animate-spin" size={16} /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
