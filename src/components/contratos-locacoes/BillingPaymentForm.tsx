'use client';

import { useRef, useState } from 'react';
import { CurrencyInput } from './CurrencyInput';
import { toLocalDateKey } from '@/lib/contratos-locacoes/dates';
import { PaymentNotSavedError } from '@/lib/contratos-locacoes/payment-errors';

export interface BillingPaymentFormValues {
  operation_id: string;
  paid_at: string;
  amount: string;
  notes: string | null;
}

interface BillingPaymentFormProps {
  requestKey: string;
  initialAmount: string;
  onCancel: () => void;
  onSubmit: (values: BillingPaymentFormValues, file: File | null) => Promise<void>;
}

function readPending(key: string): BillingPaymentFormValues | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as BillingPaymentFormValues;
    return typeof value.operation_id === 'string' && typeof value.paid_at === 'string'
      && typeof value.amount === 'string' && (value.notes === null || typeof value.notes === 'string') ? value : null;
  } catch { return null; }
}

export function BillingPaymentForm({ requestKey, initialAmount, onCancel, onSubmit }: BillingPaymentFormProps) {
  const storageKey = `radial:pending-payment:${requestKey}`;
  const [pending, setPending] = useState(() => readPending(storageKey));
  const [values, setValues] = useState<BillingPaymentFormValues>(() => pending ?? {
    operation_id: '',
    paid_at: toLocalDateKey(new Date()),
    amount: initialAmount,
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const update = (patch: Partial<BillingPaymentFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setSubmitting(true);

    try {
      if (!values.paid_at || !/^[1-9]\d*$/.test(values.amount)) {
        throw new PaymentNotSavedError('Informe a data e um valor maior que zero.');
      }
      const request = pending ?? { ...values, operation_id: crypto.randomUUID() };
      // Persist BEFORE sending. If unavailable, stop before any network mutation.
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      await onSubmit(request, file);
      sessionStorage.removeItem(storageKey);
      setPending(null);
    } catch (submissionError) {
      if (submissionError instanceof PaymentNotSavedError) {
        try {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        } catch { /* Keep the existing operation while storage is unavailable. */ }
        setError(submissionError.message);
      } else {
        setError('Não foi possível confirmar o recebimento. Tente novamente para conferir a mesma operação, sem duplicá-la.');
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {pending ? <p role="status" className="text-sm text-amber-900">Há um recebimento aguardando confirmação. A nova tentativa usará os mesmos dados. Se havia um comprovante, selecione o arquivo novamente.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Data do recebimento
          <input
            className="rounded-lg border border-gray-300 px-3 py-2"
            type="date"
            disabled={submitting || Boolean(pending)}
            value={values.paid_at}
            onChange={(event) => update({ paid_at: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Valor recebido
          <CurrencyInput
            disabled={submitting || Boolean(pending)}
            className="rounded-lg border border-gray-300 px-3 py-2"
            value={values.amount}
            onValueChange={(value) => update({ amount: value })}
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-gray-700">
        Observação
        <textarea
          disabled={submitting || Boolean(pending)}
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
          disabled={submitting}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700" onClick={onCancel} type="button" disabled={submitting}>
          {pending ? 'Fechar' : 'Cancelar'}
        </button>
        <button
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? 'Registrando...' : pending ? 'Confirmar recebimento pendente' : 'Registrar recebimento'}
        </button>
      </div>
    </form>
  );
}
