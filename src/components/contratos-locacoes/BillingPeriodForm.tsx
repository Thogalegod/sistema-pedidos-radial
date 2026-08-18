'use client';

import { useState } from 'react';
import { CurrencyInput } from './CurrencyInput';

export interface BillingPeriodFormValues {
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  amount: string;
  notes: string | null;
}

interface BillingPeriodFormProps {
  amountLocked?: boolean;
  initialValues: BillingPeriodFormValues;
  onCancel: () => void;
  onSubmit: (values: BillingPeriodFormValues) => Promise<void>;
  submitLabel: string;
}

export function BillingPeriodForm({
  amountLocked = false,
  initialValues,
  onCancel,
  onSubmit,
  submitLabel,
}: BillingPeriodFormProps) {
  const [values, setValues] = useState(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<BillingPeriodFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(values);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Não foi possível salvar a cobrança.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Início
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="date"
            value={values.period_start}
            onChange={(event) => update({ period_start: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Fim
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="date"
            value={values.period_end}
            onChange={(event) => update({ period_end: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Emissão
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="date"
            value={values.issue_date}
            onChange={(event) => update({ issue_date: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Vencimento
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="date"
            value={values.due_date}
            onChange={(event) => update({ due_date: event.target.value })}
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-gray-700">
        Valor
        <CurrencyInput
          className="rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
          disabled={amountLocked}
          value={values.amount}
          onValueChange={(value) => update({ amount: value })}
        />
      </label>

      {amountLocked ? (
        <p className="text-xs text-amber-700">O valor não pode ser alterado porque já existe recebimento registrado.</p>
      ) : null}

      <label className="grid gap-1 text-sm font-medium text-gray-700">
        Observação
        <textarea
          className="min-h-20 rounded-lg border border-gray-300 px-3 py-2"
          value={values.notes ?? ''}
          onChange={(event) => update({ notes: event.target.value })}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
