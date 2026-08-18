import { formatBRL } from '@/lib/contratos-locacoes/money';
import { getContractCompanyLabel } from '@/lib/contratos-locacoes/company';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';
import type { BillingCycle, ContractDocument, Payment, RentalItem } from '@/lib/contratos-locacoes/types';
import { useState, type ReactNode } from 'react';
import { ContractBillingSection } from './ContractBillingSection';
import type { BillingPaymentFormValues } from './BillingPaymentForm';
import type { BillingPeriodFormValues } from './BillingPeriodForm';

type ContractSummaryProps = {
  detail: ContractDetail;
  openNewBillingForm?: boolean;
  onAttachPaymentProof?: (billing: BillingCycle, payment: Payment, file: File) => Promise<void>;
  onCreateBillingPeriod?: (values: BillingPeriodFormValues & { sequence_number: number }) => Promise<void>;
  onMarkBillingSent?: (billing: BillingCycle) => Promise<void>;
  onOpenPaymentProof?: (document: ContractDocument) => Promise<void>;
  onRecordBillingPayment?: (billing: BillingCycle, values: BillingPaymentFormValues, file: File | null) => Promise<void>;
  onCloseContract?: () => Promise<void> | void;
  onRegisterItemReturn?: (item: RentalItem, returnedAt: string) => Promise<void> | void;
  onStartClosure?: (endDate: string) => Promise<void> | void;
  onUpdateBillingPeriod?: (billing: BillingCycle, values: BillingPeriodFormValues) => Promise<void>;
  paymentProofDocuments?: ContractDocument[];
  remittanceAttachmentSlot?: ReactNode;
  remittanceEditorSlot?: ReactNode;
};

function toCents(value: string | number | null | undefined) {
  if (value == null) {
    return 0;
  }

  return typeof value === 'number' ? value : Number.parseInt(value, 10) || 0;
}

function calculateItemSubtotal(item: RentalItem) {
  return item.quantity * toCents(item.unit_amount);
}

function calculateMonthlyTotal(items: RentalItem[]) {
  return items.reduce((sum, item) => sum + calculateItemSubtotal(item), 0);
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function Section({
  children,
  className = '',
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  const sectionId = title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return (
    <section
      aria-labelledby={sectionId}
      className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}
    >
      <h3 className="text-lg font-semibold text-gray-900" id={sectionId}>{title}</h3>
      {children}
    </section>
  );
}

export function ContractSummary({
  detail,
  onAttachPaymentProof,
  onCloseContract,
  onCreateBillingPeriod,
  onMarkBillingSent,
  onOpenPaymentProof,
  onRegisterItemReturn,
  onRecordBillingPayment,
  onStartClosure,
  onUpdateBillingPeriod,
  openNewBillingForm = false,
  paymentProofDocuments = [],
  remittanceAttachmentSlot,
  remittanceEditorSlot,
}: ContractSummaryProps) {
  const monthlyTotal = calculateMonthlyTotal(detail.items);
  const hasNotes = Boolean(detail.contract.notes?.trim());
  const [closureEndDate, setClosureEndDate] = useState(detail.contract.end_date ?? '');
  const [returnDates, setReturnDates] = useState<Record<string, string>>({});
  const pendingPhysicalReturns = detail.items.filter((item) => item.asset_id && !item.returned_at);
  const isFinalContractStatus = detail.contract.status === 'closed' || detail.contract.status === 'cancelled';
  const showClosureControls = Boolean((onStartClosure || onCloseContract) && !isFinalContractStatus);
  const canCloseContract = pendingPhysicalReturns.length === 0 && Boolean(detail.contract.end_date);

  return (
    <div className="space-y-4">
      <Section title="Dados da locação">
        <dl className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Nº do Pedido" value={detail.contract.legacy_order_number ?? 'Não informado'} />
          <Field label="Cliente" value={detail.customer?.legal_name ?? 'Cliente indisponível'} />
          <Field label="Obra/local" value={detail.site?.name ?? 'Local indisponível'} />
          <Field label="Empresa" value={getContractCompanyLabel(detail.contract.contract_company)} />
          <Field label="Início" value={detail.contract.start_date} />
          <Field label="Status atual" value={detail.contract.status} />
          <Field label="Valor mensal total" value={formatBRL(monthlyTotal)} />
        </dl>
        {hasNotes ? (
          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">Observações: </span>
            {detail.contract.notes}
          </div>
        ) : null}
        {detail.contract.transport_notes?.trim() ? (
          <div className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span className="font-semibold">Transporte: </span>
            {detail.contract.transport_notes}
          </div>
        ) : null}
      </Section>

      <Section title="Equipamentos locados">
        {detail.items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
            Esta locação não possui equipamentos cadastrados.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
            <div className="grid min-w-[720px] grid-cols-5 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
              <span>Equipamento</span>
              <span>Série</span>
              <span>Quantidade</span>
              <span>Valor unitário</span>
              <span>Subtotal</span>
            </div>
            {detail.items.map((item) => (
              <div className="grid min-w-[720px] grid-cols-5 gap-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-700" key={item.id}>
                <div>
                  <p className="font-medium text-gray-900">{item.description}</p>
                  {item.equipment_type ? <p className="text-xs text-gray-500">{item.equipment_type}</p> : null}
                  {item.asset_id ? (
                    item.returned_at ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">Devolvido em {item.returned_at}</p>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-amber-700">Aguardando devolucao</p>
                    )
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">Item manual</p>
                  )}
                </div>
                <span>{item.serial_number || 'Sem série'}</span>
                <span>{item.quantity}</span>
                <span>{formatBRL(item.unit_amount)}</span>
                <span className="space-y-2 font-medium text-gray-900">
                  <span className="block">{formatBRL(calculateItemSubtotal(item))}</span>
                  {item.asset_id && !item.returned_at && onRegisterItemReturn && !isFinalContractStatus ? (
                    <span className="flex flex-col gap-2">
                      <input
                        aria-label={`Data de devolucao de ${item.description}`}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-normal text-gray-700"
                        min={detail.contract.end_date ?? detail.contract.start_date}
                        type="date"
                        value={returnDates[item.id] ?? ''}
                        onChange={(event) =>
                          setReturnDates((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      />
                      <button
                        className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        disabled={!returnDates[item.id]}
                        type="button"
                        onClick={() => void onRegisterItemReturn(item, returnDates[item.id])}
                      >
                        Registrar devolucao
                      </button>
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
            <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
              Total dos equipamentos: {formatBRL(monthlyTotal)}
            </div>
          </div>
        )}
      </Section>

      {showClosureControls ? (
        <Section title="Encerramento">
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            {onStartClosure && !isFinalContractStatus ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="contract-closure-end-date">
                  Data efetiva de termino
                </label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  id="contract-closure-end-date"
                  min={detail.contract.start_date}
                  type="date"
                  value={closureEndDate}
                  onChange={(event) => setClosureEndDate(event.target.value)}
                />
              </div>
            ) : null}
            {onStartClosure && !isFinalContractStatus ? (
              <button
                className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                disabled={!closureEndDate}
                type="button"
                onClick={() => void onStartClosure(closureEndDate)}
              >
                Iniciar encerramento
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pendingPhysicalReturns.length > 0
                ? `${pendingPhysicalReturns.length} ativo(s) físico(s) aguardando devolucao.`
                : 'Sem ativos fisicos pendentes de devolucao.'}
            </span>
            {onCloseContract && !isFinalContractStatus ? (
              <button
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={!canCloseContract}
                type="button"
                onClick={() => void onCloseContract()}
              >
                Finalizar locacao
              </button>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Financeiro da locação">
        {onAttachPaymentProof && onCreateBillingPeriod && onMarkBillingSent && onOpenPaymentProof && onRecordBillingPayment && onUpdateBillingPeriod ? (
          <ContractBillingSection
            detail={detail}
            openNewBillingForm={openNewBillingForm}
            paymentProofDocuments={paymentProofDocuments}
            onAttachPaymentProof={onAttachPaymentProof}
            onCreateBillingPeriod={onCreateBillingPeriod}
            onMarkBillingSent={onMarkBillingSent}
            onOpenPaymentProof={onOpenPaymentProof}
            onRecordBillingPayment={onRecordBillingPayment}
            onUpdateBillingPeriod={onUpdateBillingPeriod}
          />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-1 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">Valor mensal atual da locação</span>
              <span className="font-semibold">{formatBRL(monthlyTotal)}</span>
            </div>
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
              Nenhum período de cobrança gerado ainda.
            </div>
          </div>
        )}
      </Section>

      <Section title="NF de remessa">
        {detail.contract.has_remittance_invoice ? (
          <div className="mt-4 space-y-4">
            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Número" value={detail.contract.remittance_invoice_number ?? 'Sem número'} />
              <Field
                label="Empresa emissora"
                value={detail.contract.remittance_invoice_issuer ?? getContractCompanyLabel(detail.contract.contract_company)}
              />
              <Field label="Valor da NF" value={formatBRL(detail.contract.remittance_invoice_amount)} />
              <Field label="Data de emissão da NF" value={detail.contract.remittance_invoice_issue_date ?? 'Não informada'} />
            </dl>
            {remittanceAttachmentSlot}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
            Esta locação não possui NF de remessa.
          </div>
        )}
        {remittanceEditorSlot ? <div className="mt-4">{remittanceEditorSlot}</div> : null}
      </Section>
    </div>
  );
}
