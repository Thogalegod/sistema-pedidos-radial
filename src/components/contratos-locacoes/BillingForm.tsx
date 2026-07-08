'use client';

import { useState } from 'react';
import { formatBRL, parseBRL } from '@/lib/contratos-locacoes/money';
import { billingDraftSchema, type BillingDraftInput } from '@/lib/contratos-locacoes/schemas';

interface BillingFormProps {
  contractOptions: Array<{ id: string; label: string }>;
  submitLabel: string;
  onSubmit: (payload: BillingDraftInput) => Promise<void>;
}

export function BillingForm({ contractOptions, submitLabel, onSubmit }: BillingFormProps) {
  const [form, setForm] = useState<BillingDraftInput>({
    contract_id: contractOptions[0]?.id ?? '',
    period_start: '',
    period_end: '',
    issue_date: '',
    due_date: '',
    document_type: 'receipt',
    document_number: '',
    sequence_number: 1,
    discount_amount: '0',
    surcharge_amount: '0',
    exemption_amount: '0',
    notes: '',
    items: [
      {
        id: crypto.randomUUID(),
        rental_item_id: null,
        description: '',
        quantity: 1,
        unit_amount: '0',
        kind: 'recurring',
      },
    ],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateItem = (patch: Partial<BillingDraftInput['items'][number]>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, index) => (index === 0 ? { ...item, ...patch } : item)),
    }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      const payload = billingDraftSchema.parse(form);
      await onSubmit(payload);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Não foi possível emitir a cobrança.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Contrato
          <select
            className="rounded-xl border border-gray-300 px-3 py-2"
            value={form.contract_id}
            onChange={(event) => setForm((current) => ({ ...current, contract_id: event.target.value }))}
          >
            {contractOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Início do período
            <input className="rounded-xl border border-gray-300 px-3 py-2" type="date" value={form.period_start} onChange={(event) => setForm((current) => ({ ...current, period_start: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Fim do período
            <input className="rounded-xl border border-gray-300 px-3 py-2" type="date" value={form.period_end} onChange={(event) => setForm((current) => ({ ...current, period_end: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Emissão
            <input className="rounded-xl border border-gray-300 px-3 py-2" type="date" value={form.issue_date} onChange={(event) => setForm((current) => ({ ...current, issue_date: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Vencimento
            <input className="rounded-xl border border-gray-300 px-3 py-2" type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} />
          </label>
        </div>

        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Número do documento
          <input className="rounded-xl border border-gray-300 px-3 py-2" value={form.document_number ?? ''} onChange={(event) => setForm((current) => ({ ...current, document_number: event.target.value }))} />
        </label>
      </div>

      <div className="grid gap-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Descrição da linha
          <input className="rounded-xl border border-gray-300 px-3 py-2" value={form.items[0]?.description ?? ''} onChange={(event) => updateItem({ description: event.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Quantidade
            <input className="rounded-xl border border-gray-300 px-3 py-2" type="number" min={1} value={form.items[0]?.quantity ?? 1} onChange={(event) => updateItem({ quantity: Number(event.target.value) })} />
          </label>
          <label className="grid gap-1 text-sm font-medium text-gray-700">
            Valor unitário
            <input
              className="rounded-xl border border-gray-300 px-3 py-2"
              inputMode="decimal"
              value={formatBRL(form.items[0]?.unit_amount ?? '0')}
              onChange={(event) => updateItem({ unit_amount: String(parseBRL(event.target.value)) })}
            />
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? 'Emitindo...' : submitLabel}
      </button>
    </form>
  );
}
