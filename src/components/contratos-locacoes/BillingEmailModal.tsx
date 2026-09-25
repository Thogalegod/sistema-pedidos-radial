'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  billingSendClient,
  createBillingSendIntent,
  type BillingSendClient,
} from '@/lib/contratos-locacoes/billing-send-client';
import type {
  BillingSendPreparation,
  BillingSendRequest,
  BillingSendResult,
} from '@/lib/contratos-locacoes/types';

interface BillingEmailModalProps {
  billingId: string;
  client?: BillingSendClient;
  onClose: () => void;
  onSuccess: (result: BillingSendResult) => void | Promise<void>;
}

const MAX_RETRY_AGE_MS = 24 * 60 * 60 * 1_000;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function BillingEmailModal({
  billingId,
  client = billingSendClient,
  onClose,
  onSuccess,
}: BillingEmailModalProps) {
  const [preparation, setPreparation] = useState<BillingSendPreparation | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [extraRecipient, setExtraRecipient] = useState('');
  const [additionalMessage, setAdditionalMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [intent, setIntent] = useState<BillingSendRequest | null>(null);
  const [intentCreatedAt, setIntentCreatedAt] = useState<number | null>(null);
  const [manualReconciliation, setManualReconciliation] = useState(false);
  const inFlightRef = useRef(false);
  const intentRef = useRef<BillingSendRequest | null>(null);

  useEffect(() => {
    let active = true;
    client.prepare(billingId).then((value) => {
      if (!active) return;
      setPreparation(value);
      setRecipients(value.defaultRecipients);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o envio');
    });
    return () => { active = false; };
  }, [billingId, client]);

  const allowed = useMemo(
    () => new Set(preparation?.allowedRecipients.map(normalizeEmail) ?? []),
    [preparation]
  );

  function isAllowed(email: string): boolean {
    return preparation?.mode === 'production' || allowed.has(normalizeEmail(email));
  }

  function toggleRecipient(email: string) {
    const normalized = normalizeEmail(email);
    setRecipients((current) => current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized]);
    setIntent(null);
    intentRef.current = null;
  }

  function addExtraRecipient() {
    const normalized = normalizeEmail(extraRecipient);
    if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized)) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (!isAllowed(normalized)) {
      setError('Destinatário não permitido neste ambiente.');
      return;
    }
    setRecipients((current) => [...new Set([...current, normalized])].sort());
    setExtraRecipient('');
    setError(null);
    setIntent(null);
    intentRef.current = null;
  }

  async function submit() {
    if (inFlightRef.current || manualReconciliation) return;
    if (recipients.length === 0) {
      setError('Selecione ao menos um destinatário.');
      return;
    }
    if (intent && intentCreatedAt && Date.now() - intentCreatedAt > MAX_RETRY_AGE_MS) {
      setManualReconciliation(true);
      setError('A janela de retry expirou. Faça a reconciliação manual antes de tentar novo envio.');
      return;
    }

    const currentIntent = intentRef.current ?? createBillingSendIntent({ recipients, additionalMessage });
    if (!intentRef.current) {
      intentRef.current = currentIntent;
      setIntent(currentIntent);
      setIntentCreatedAt(Date.now());
    }
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await client.send(billingId, currentIntent);
      if (result.status === 'manual_reconciliation_required') {
        setManualReconciliation(true);
        setError('O provedor pode ter enviado a mensagem. Faça a reconciliação manual antes de tentar novamente.');
        return;
      }
      await onSuccess(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao enviar a cobrança');
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <section aria-labelledby="billing-email-title" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900" id="billing-email-title">Enviar cobrança por e-mail</h2>
            <p className="mt-1 text-sm text-gray-600">Revise os destinatários e anexos antes de confirmar.</p>
          </div>
          <button aria-label="Fechar" className="rounded-lg px-2 py-1 text-gray-500" onClick={onClose} type="button">×</button>
        </div>

        {preparation?.mode === 'restricted' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Ambiente de homologação: somente destinatários autorizados podem receber esta cobrança.
          </p>
        ) : null}
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}

        {!preparation && !error ? <p className="mt-4 text-sm text-gray-500">Preparando envio…</p> : null}
        {preparation ? (
          <>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-gray-900">Destinatários</legend>
              <div className="mt-2 grid gap-2">
                {preparation.contacts.filter((contact) => contact.email).map((contact) => {
                  const email = normalizeEmail(contact.email as string);
                  return (
                    <label className="flex items-start gap-2 text-sm text-gray-700" key={contact.id}>
                      <input checked={recipients.includes(email)} disabled={!isAllowed(email) || Boolean(intent)} onChange={() => toggleRecipient(email)} type="checkbox" />
                      <span>{contact.name} — {email}{contact.receives_billing ? ' (recebe cobrança)' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-900" htmlFor="billing-extra-recipient">Destinatário adicional</label>
              <div className="mt-2 flex gap-2">
                <input className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" disabled={Boolean(intent)} id="billing-extra-recipient" onChange={(event) => setExtraRecipient(event.target.value)} type="email" value={extraRecipient} />
                <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold" disabled={Boolean(intent)} onClick={addExtraRecipient} type="button">Adicionar destinatário</button>
              </div>
              {recipients.filter((email) => !preparation.contacts.some((contact) => normalizeEmail(contact.email ?? '') === email)).map((email) => (
                <p className="mt-1 text-xs text-gray-600" key={email}>{email}</p>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-sm font-semibold text-gray-900" htmlFor="billing-additional-message">Mensagem adicional</label>
              <textarea className="mt-2 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" disabled={Boolean(intent)} id="billing-additional-message" maxLength={2000} onChange={(event) => setAdditionalMessage(event.target.value)} value={additionalMessage} />
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 px-3 py-3">
              <p className="text-sm font-semibold text-gray-900">Anexos (2)</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
                <li>{preparation.invoiceFileName}</li>
                <li>{preparation.boletoFileName}</li>
              </ul>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700" onClick={onClose} type="button">Cancelar</button>
              <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={submitting || manualReconciliation} onClick={submit} type="button">
                {submitting ? 'Enviando…' : intent ? 'Tentar novamente' : 'Enviar cobrança'}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
