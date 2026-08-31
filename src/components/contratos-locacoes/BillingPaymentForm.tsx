'use client';

import { useState } from 'react';
import { CurrencyInput } from './CurrencyInput';

export interface BillingPaymentFormValues {
  paid_at: string;
  amount: string;
  notes: string | null;
}

interface BillingPaymentFormProps {
  initialAmount: string;
  onCancel: () => void;
  onSubmit: (values: BillingPaymentFormValues, file: File | null) => Promise<void>;
}

export function BillingPaymentForm({ initialAmount, onCancel, onSubmit }: BillingPaymentFormProps) {
  const [values, setValues] = useState<BillingPaymentFormValues>({
    paid_at: new Date().toISOString().slice(0, 10),
    amount: initialAmount,
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<BillingPaymentFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(values, file);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Não foi possível registrar o recebimento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Data do recebimento
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="date"
            value={values.paid_at}
            onChange={(event) => update({ paid_at: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Valor recebido
          <CurrencyInput
            className="rounded-lg border border-gray-300 px-3 py-2"
            value={values.amount}
            onValueChange={(value) => update({ amount: value })}
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-gray-700">
        Observação
        <textarea
          className="min-h-20 rounded-lg border border-gray-300 px-3 py-2"
          value={values.notes ?? ''}
          onChange={(event) => update({ notes: event.target.value })}
        />
      </label>

      <label className="grid gap-1 text-sm font-medium text-gray-700">
        Comprovante opcional
        <input
          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
          {submitting ? 'Registrando...' : 'Registrar recebimento'}
        </button>
      </div>
    </form>
  );
}
