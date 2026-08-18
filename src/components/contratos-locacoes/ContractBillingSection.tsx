'use client';

import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateBillingBalance } from '@/lib/contratos-locacoes/dashboard';
import {
  buildNextMonthlyBillingPeriod,
  suggestBillingAmountFromItems,
} from '@/lib/contratos-locacoes/billing-periods';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';
import type { BillingCycle, ContractDocument, Payment } from '@/lib/contratos-locacoes/types';
import { BillingPaymentForm, type BillingPaymentFormValues } from './BillingPaymentForm';
import { BillingPeriodCard } from './BillingPeriodCard';
import { BillingPeriodForm, type BillingPeriodFormValues } from './BillingPeriodForm';

interface ContractBillingSectionProps {
  detail: ContractDetail;
  openNewBillingForm?: boolean;
  onAttachPaymentProof: (billing: BillingCycle, payment: Payment, file: File) => Promise<void>;
  onCreateBillingPeriod: (values: BillingPeriodFormValues & { sequence_number: number }) => Promise<void>;
  onMarkBillingSent: (billing: BillingCycle) => Promise<void>;
  onOpenPaymentProof: (document: ContractDocument) => Promise<void>;
  onRecordBillingPayment: (billing: BillingCycle, values: BillingPaymentFormValues, file: File | null) => Promise<void>;
  onUpdateBillingPeriod: (billing: BillingCycle, values: BillingPeriodFormValues) => Promise<void>;
  paymentProofDocuments: ContractDocument[];
}

type ActiveForm =
  | { type: 'create'; values: BillingPeriodFormValues & { sequence_number: number } }
  | { type: 'edit'; billing: BillingCycle; values: BillingPeriodFormValues }
  | { type: 'payment'; billing: BillingCycle; initialAmount: string }
  | null;

function paymentsForBilling(payments: Payment[], billingId: string) {
  return payments.filter((payment) => payment.billing_cycle_id === billingId);
}

function toPeriodFormValues(billing: BillingCycle): BillingPeriodFormValues {
  return {
    period_start: billing.period_start,
    period_end: billing.period_end,
    issue_date: billing.issue_date,
    due_date: billing.due_date,
    amount: billing.total_amount,
    notes: billing.notes,
  };
}

export function ContractBillingSection({
  detail,
  openNewBillingForm = false,
  onAttachPaymentProof,
  onCreateBillingPeriod,
  onMarkBillingSent,
  onOpenPaymentProof,
  onRecordBillingPayment,
  onUpdateBillingPeriod,
  paymentProofDocuments,
}: ContractBillingSectionProps) {
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const didAutoOpenNewBillingForm = useRef(false);
  const monthlyTotal = useMemo(() => suggestBillingAmountFromItems(detail.items), [detail.items]);
  const billingCycles = useMemo(
    () => [...detail.billingCycles].sort((left, right) => left.period_start.localeCompare(right.period_start)),
    [detail.billingCycles]
  );
  const nextPeriodSuggestion = useMemo(() => buildNextMonthlyBillingPeriod({
    contractStartDate: detail.contract.start_date,
    contractEndDate: detail.contract.end_date,
    existingBillingCycles: billingCycles,
    issueDate: detail.contract.start_date,
  }), [billingCycles, detail.contract.end_date, detail.contract.start_date]);
  const newBillingFormValues = useMemo(() => nextPeriodSuggestion ? {
    ...nextPeriodSuggestion,
    issue_date: nextPeriodSuggestion.period_start,
    due_date: nextPeriodSuggestion.period_end,
    amount: monthlyTotal,
    notes: '',
  } : null, [monthlyTotal, nextPeriodSuggestion]);

  useEffect(() => {
    if (!openNewBillingForm || didAutoOpenNewBillingForm.current || !newBillingFormValues) {
      return;
    }

    didAutoOpenNewBillingForm.current = true;
    setActiveForm({ type: 'create', values: newBillingFormValues });
  }, [newBillingFormValues, openNewBillingForm]);

  function openCreateForm() {
    if (!newBillingFormValues) {
      return;
    }

    setActiveForm({
      type: 'create',
      values: newBillingFormValues,
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Valor mensal atual da locação</p>
          <p className="text-xs text-blue-800">Derivado dos valores atuais dos equipamentos para os novos períodos.</p>
        </div>
        <span className="font-semibold">{formatBRL(monthlyTotal)}</span>
      </div>

      {nextPeriodSuggestion ? (
        <div className="flex justify-end">
          <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" onClick={openCreateForm} type="button">
            <Plus size={16} />
            {billingCycles.length === 0 ? 'Gerar primeiro período' : 'Gerar próximo período'}
          </button>
        </div>
      ) : null}

      {activeForm?.type === 'create' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-emerald-950">Novo período de cobrança</h4>
          <BillingPeriodForm
            initialValues={activeForm.values}
            onCancel={() => setActiveForm(null)}
            onSubmit={async (values) => {
              await onCreateBillingPeriod({ ...values, sequence_number: activeForm.values.sequence_number });
              setActiveForm(null);
            }}
            submitLabel="Salvar período"
          />
        </div>
      ) : null}

      {billingCycles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
          Nenhum período de cobrança gerado ainda.
        </div>
      ) : (
        <div className="grid gap-3">
          {billingCycles.map((billing) => {
            const billingPayments = paymentsForBilling(detail.payments, billing.id);
            const balance = calculateBillingBalance(billing.total_amount, billingPayments.map((payment) => payment.amount));

            return (
              <div className="space-y-3" key={billing.id}>
                <BillingPeriodCard
                  billing={billing}
                  payments={billingPayments}
                  proofDocuments={paymentProofDocuments}
                  onAttachProof={(entry, payment, file) => void onAttachPaymentProof(entry, payment, file)}
                  onEdit={(entry) => setActiveForm({ type: 'edit', billing: entry, values: toPeriodFormValues(entry) })}
                  onMarkSent={(entry) => void onMarkBillingSent(entry)}
                  onOpenProof={(document) => void onOpenPaymentProof(document)}
                  onRegisterPayment={(entry) => setActiveForm({
                    type: 'payment',
                    billing: entry,
                    initialAmount: balance.balance_amount,
                  })}
                />

                {activeForm?.type === 'edit' && activeForm.billing.id === billing.id ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">Editar período</h4>
                    <BillingPeriodForm
                      initialValues={activeForm.values}
                      onCancel={() => setActiveForm(null)}
                      onSubmit={async (values) => {
                        await onUpdateBillingPeriod(billing, values);
                        setActiveForm(null);
                      }}
                      submitLabel="Salvar alterações"
                    />
                  </div>
                ) : null}

                {activeForm?.type === 'payment' && activeForm.billing.id === billing.id ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-emerald-950">Registrar recebimento</h4>
                    <BillingPaymentForm
                      initialAmount={activeForm.initialAmount}
                      onCancel={() => setActiveForm(null)}
                      onSubmit={async (values, file) => {
                        await onRecordBillingPayment(billing, values, file);
                        setActiveForm(null);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
