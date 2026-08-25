'use client';

import Link from 'next/link';
import { FileText, Paperclip, Wallet } from 'lucide-react';
import { calculateBillingBalance, buildBillingStatus } from '@/lib/contratos-locacoes/dashboard';
import { resolveEffectiveBillingStatus } from '@/lib/contratos-locacoes/billing-status-presentation';
import { alertLevel } from '@/lib/contratos-locacoes/dates';
import { findPaymentProofDocument } from '@/lib/contratos-locacoes/payment-proofs';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { BillingCycle, ContractDocument, Payment } from '@/lib/contratos-locacoes/types';
import { BillingStatusBadge } from './BillingStatusBadge';

interface BillingPeriodCardProps {
  billing: BillingCycle;
  boletoDocument: ContractDocument | null;
  canManageBilling: boolean;
  onAttachBoleto: (billing: BillingCycle, file: File) => void;
  onAttachProof: (billing: BillingCycle, payment: Payment, file: File) => void;
  onEdit: (billing: BillingCycle) => void;
  onOpenBoleto: (document: ContractDocument) => void;
  onOpenProof: (document: ContractDocument) => void;
  onRegisterPayment: (billing: BillingCycle) => void;
  onRepairPendingBoleto: (billing: BillingCycle, file: File) => void;
  onReplaceBoleto: (billing: BillingCycle, document: ContractDocument, file: File) => void;
  payments: Payment[];
  proofDocuments: ContractDocument[];
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function normalizeStatus(billing: BillingCycle, payments: Payment[]) {
  return resolveEffectiveBillingStatus(
    billing.status,
    buildBillingStatus(
      billing.total_amount,
      payments.map((payment) => payment.amount),
      new Date().toISOString().slice(0, 10),
      billing.due_date
    )
  );
}

export function BillingPeriodCard({
  billing,
  boletoDocument,
  canManageBilling,
  onAttachBoleto,
  onAttachProof,
  onEdit,
  onOpenBoleto,
  onOpenProof,
  onRegisterPayment,
  onRepairPendingBoleto,
  onReplaceBoleto,
  payments,
  proofDocuments,
}: BillingPeriodCardProps) {
  const balance = calculateBillingBalance(billing.total_amount, payments.map((payment) => payment.amount));
  const status = normalizeStatus(billing, payments);
  const paidAmount = Number.parseInt(balance.paid_amount, 10);
  const balanceAmount = Number.parseInt(balance.balance_amount, 10);
  const today = new Date().toISOString().slice(0, 10);
  const alert = status === 'paid' ? 'ok' : alertLevel(today, billing.due_date);

  return (
    <article
      aria-label={`Cobrança ${formatDateLabel(billing.period_start)} a ${formatDateLabel(billing.period_end)}`}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Período</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {formatDateLabel(billing.period_start)} a {formatDateLabel(billing.period_end)}
            </p>
            <p className="text-xs text-gray-500">#{billing.sequence_number}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Emissão</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">Emitida em {formatDateLabel(billing.issue_date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Vencimento</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{formatDateLabel(billing.due_date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
            <div className="mt-1">
              <BillingStatusBadge
                alert={alert}
                balanceAmount={balanceAmount}
                paidAmount={paidAmount}
                status={status}
              />
            </div>
            {canManageBilling && billing.sent_at ? <p className="text-xs text-blue-700">Enviado em {formatDateTimeLabel(billing.sent_at)}</p> : null}
          </div>
        </div>

        <div className="grid min-w-44 gap-1 text-left lg:text-right">
          <p className="text-sm font-semibold text-gray-900">{formatBRL(billing.total_amount)}</p>
          <p className="text-xs text-gray-600">Recebido: {formatBRL(paidAmount)}</p>
          <p className="text-xs text-gray-600">Saldo: {formatBRL(balanceAmount)}</p>
        </div>
      </div>

      {billing.notes ? <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{billing.notes}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700" onClick={() => onEdit(billing)} type="button">
          Editar
        </button>
        <Link className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700" href={`/contratos-locacoes/recibos/${billing.id}`}>
          <FileText size={14} />
          Abrir fatura
        </Link>
        <button className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white" onClick={() => onRegisterPayment(billing)} type="button">
          <Wallet size={14} />
          Registrar recebimento
        </button>
      </div>

      {canManageBilling ? (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-900">
          <p className="font-semibold">Boleto</p>
          {billing.boleto_change_pending ? (
            <div className="mt-2">
              <p className="text-xs">Alteração de boleto pendente. Reenvie o PDF para concluir.</p>
              <label className="mt-2 inline-flex cursor-pointer rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">
                Concluir alteração pendente
                <input accept="application/pdf,.pdf" className="sr-only" type="file" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onRepairPendingBoleto(billing, file);
                  event.target.value = '';
                }} />
              </label>
            </div>
          ) : boletoDocument ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold" onClick={() => onOpenBoleto(boletoDocument)} type="button">Abrir boleto</button>
              <label className="cursor-pointer rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold">
                Substituir boleto
                <input accept="application/pdf,.pdf" className="sr-only" type="file" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onReplaceBoleto(billing, boletoDocument, file);
                  event.target.value = '';
                }} />
              </label>
            </div>
          ) : (
            <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold">
              Anexar boleto
              <input accept="application/pdf,.pdf" className="sr-only" type="file" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onAttachBoleto(billing, file);
                event.target.value = '';
              }} />
            </label>
          )}
          {billing.sent_at && billing.needs_resend ? <p className="mt-2 text-xs font-semibold text-amber-700">Alterada após o último envio — reenviar cobrança.</p> : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold uppercase text-gray-500">Recebimentos</p>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhum recebimento registrado.</p>
        ) : (
          <div className="mt-2 grid gap-2">
            {payments.map((payment) => {
              const proof = findPaymentProofDocument(proofDocuments, payment.id);

              return (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700" key={payment.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {formatDateLabel(payment.paid_at.slice(0, 10))} - {formatBRL(payment.amount)}
                    </span>
                    {proof ? (
                      <button className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700" onClick={() => onOpenProof(proof)} type="button">
                        <Paperclip size={14} />
                        Abrir comprovante
                      </button>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-blue-700">
                        <Paperclip size={14} />
                        Anexar comprovante
                        <input
                          accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                          className="sr-only"
                          type="file"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              onAttachProof(billing, payment, file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {payment.notes ? <p className="mt-1 text-xs text-gray-500">{payment.notes}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
