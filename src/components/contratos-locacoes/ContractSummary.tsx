import { formatBRL } from '@/lib/contratos-locacoes/money';
import { getContractCompanyLabel } from '@/lib/contratos-locacoes/company';
import { buildRentalListReference } from '@/lib/contratos-locacoes/contract-reference';
import { getContractStatusLabel } from '@/lib/contratos-locacoes/contract-presentation';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';
import { getPendingPhysicalReturnItems } from '@/lib/contratos-locacoes/rental-closure';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';
import type { BillingCycle, BillingSendResult, ContractDocument, Payment, RentalItem } from '@/lib/contratos-locacoes/types';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ContractBillingSection } from './ContractBillingSection';
import type { BillingPaymentFormValues } from './BillingPaymentForm';
import type { BillingPeriodFormValues } from './BillingPeriodForm';

type ContractSummaryProps = {
  closureOpen?: boolean;
  detail: ContractDetail;
  openNewBillingForm?: boolean;
  onAttachPaymentProof?: (billing: BillingCycle, payment: Payment, file: File) => Promise<void>;
  onAttachBoleto?: (billing: BillingCycle, file: File) => Promise<void>;
  onBillingSent?: (result: BillingSendResult) => Promise<void>;
  onCreateBillingPeriod?: (values: BillingPeriodFormValues & { sequence_number: number }) => Promise<void>;
  onOpenBoleto?: (document: ContractDocument) => Promise<void>;
  onOpenPaymentProof?: (document: ContractDocument) => Promise<void>;
  onRecordBillingPayment?: (billing: BillingCycle, values: BillingPaymentFormValues, file: File | null) => Promise<void>;
  onRepairPendingBoleto?: (billing: BillingCycle, file: File) => Promise<void>;
  onReplaceBoleto?: (billing: BillingCycle, document: ContractDocument, file: File) => Promise<void>;
  onCloseContract?: () => Promise<void> | void;
  onClosureOpenChange?: (open: boolean) => void;
  onRegisterItemReturn?: (item: RentalItem, returnedAt: string) => Promise<void> | void;
  onSaveNotes?: (notes: string | null) => Promise<void>;
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
      <dt className="text-xs font-medium text-radial-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-radial-ink">{value}</dd>
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
      className={`rounded-xl border border-radial-border bg-radial-surface p-4 sm:p-5 ${className}`}
    >
      <h2 className="text-lg font-semibold tracking-tight text-radial-ink" id={sectionId}>{title}</h2>
      {children}
    </section>
  );
}

export function ContractSummary({
  closureOpen = false,
  detail,
  onAttachBoleto,
  onAttachPaymentProof,
  onBillingSent,
  onCloseContract,
  onClosureOpenChange,
  onCreateBillingPeriod,
  onOpenBoleto,
  onOpenPaymentProof,
  onRegisterItemReturn,
  onRecordBillingPayment,
  onRepairPendingBoleto,
  onReplaceBoleto,
  onSaveNotes,
  onStartClosure,
  onUpdateBillingPeriod,
  openNewBillingForm = false,
  paymentProofDocuments = [],
  remittanceAttachmentSlot,
  remittanceEditorSlot,
}: ContractSummaryProps) {
  const monthlyTotal = calculateMonthlyTotal(detail.items);
  const reference = detail.contract.kind === 'rental'
    ? buildRentalListReference({
        legacyOrderNumber: detail.contract.legacy_order_number,
        internalNumber: detail.contract.internal_number,
      })
    : null;
  const [closureEndDate, setClosureEndDate] = useState(detail.contract.end_date ?? '');
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(detail.contract.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [returnDates, setReturnDates] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closureDateRef = useRef<HTMLInputElement>(null);
  const pendingPhysicalReturns = getPendingPhysicalReturnItems(detail.items);
  const isFinalContractStatus = detail.contract.status === 'closed' || detail.contract.status === 'cancelled';
  const canStartClosure = detail.contract.status === 'active' || detail.contract.status === 'paused';
  const isClosing = detail.contract.status === 'closing_requested'
    || detail.contract.status === 'awaiting_return'
    || detail.contract.status === 'inspection';
  const showClosureAction = Boolean(!isFinalContractStatus && ((canStartClosure && onStartClosure) || (isClosing && onCloseContract)));
  const canCloseContract = pendingPhysicalReturns.length === 0 && Boolean(detail.contract.end_date);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (closureOpen) {
      if (!dialog.open) dialog.showModal();
      closureDateRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
    return () => { if (dialog.open) dialog.close(); };
  }, [closureOpen]);

  const closeClosure = () => {
    dialogRef.current?.close();
    setClosureEndDate(detail.contract.end_date ?? '');
    setClosureError(null);
    onClosureOpenChange?.(false);
  };

  const saveNotes = async () => {
    if (!onSaveNotes) return;
    setSavingNotes(true);
    setNotesError(null);
    try {
      await onSaveNotes(notesDraft.trim() || null);
      setEditingNotes(false);
    } catch {
      setNotesError('Não foi possível salvar as observações. Tente novamente.');
    } finally {
      setSavingNotes(false);
    }
  };

  const submitClosure = async (action: () => Promise<void> | void) => {
    setClosureBusy(true);
    setClosureError(null);
    try {
      await action();
      closeClosure();
    } catch {
      setClosureError('Não foi possível concluir esta ação. Tente novamente.');
    } finally {
      setClosureBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Dados da locação">
        <dl className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Nº do Pedido"
            value={
              reference
                ? reference.primary
                : detail.contract.legacy_order_number ?? 'Não informado'
            }
          />
          <Field label="Cliente" value={detail.customer?.legal_name ?? 'Cliente indisponível'} />
          <Field label="Obra/local" value={detail.site?.name ?? 'Local indisponível'} />
          <Field label="Empresa" value={getContractCompanyLabel(detail.contract.contract_company)} />
          <Field label="Início" value={formatDateLabel(detail.contract.start_date)} />
          <Field label="Status atual" value={getContractStatusLabel(detail.contract.status)} />
        </dl>
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
                      <p className="mt-1 text-xs font-semibold text-emerald-700">Devolvido em {formatDateLabel(item.returned_at)}</p>
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

      <Section title="Financeiro da locação">
        {onAttachPaymentProof && onAttachBoleto && onCreateBillingPeriod && onOpenBoleto && onOpenPaymentProof && onRecordBillingPayment && onRepairPendingBoleto && onReplaceBoleto && onUpdateBillingPeriod ? (
          <ContractBillingSection
            detail={detail}
            openNewBillingForm={openNewBillingForm}
            paymentProofDocuments={paymentProofDocuments}
            onAttachPaymentProof={onAttachPaymentProof}
            onAttachBoleto={onAttachBoleto}
            onCreateBillingPeriod={onCreateBillingPeriod}
            onOpenBoleto={onOpenBoleto}
            onOpenPaymentProof={onOpenPaymentProof}
            onBillingSent={onBillingSent}
            onRecordBillingPayment={onRecordBillingPayment}
            onRepairPendingBoleto={onRepairPendingBoleto}
            onReplaceBoleto={onReplaceBoleto}
            onUpdateBillingPeriod={onUpdateBillingPeriod}
          />
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">Valor mensal atual da locação: <strong className="font-semibold text-slate-900">{formatBRL(monthlyTotal)}</strong></p>
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-600">
              Nenhum período de cobrança gerado ainda.
            </div>
          </div>
        )}
      </Section>

      <Section title="Documentos da locação">
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h3 className="text-sm font-semibold text-slate-900">NF de remessa</h3>
        {detail.contract.has_remittance_invoice ? (
          <div className="mt-3 space-y-4">
            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Número" value={detail.contract.remittance_invoice_number ?? 'Sem número'} />
              <Field
                label="Empresa emissora"
                value={detail.contract.remittance_invoice_issuer ?? getContractCompanyLabel(detail.contract.contract_company)}
              />
              <Field label="Valor da NF" value={formatBRL(detail.contract.remittance_invoice_amount)} />
              <Field
                label="Data de emissão da NF"
                value={detail.contract.remittance_invoice_issue_date
                  ? formatDateLabel(detail.contract.remittance_invoice_issue_date)
                  : 'Não informada'}
              />
            </dl>
            {remittanceAttachmentSlot}
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-600">
            Nenhum documento cadastrado.
          </div>
        )}
        {remittanceEditorSlot ? <div className="mt-3">{remittanceEditorSlot}</div> : null}
        </div>
      </Section>

      <Section title="Observações da locação">
        {editingNotes ? (
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="rental-general-notes">Anotações gerais</label>
            <textarea
              id="rental-general-notes"
              className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
            />
            {notesError ? <p role="alert" className="text-sm text-rose-700">{notesError}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={savingNotes} onClick={() => void saveNotes()}
                className="rounded-lg bg-radial-primary px-4 py-2 text-sm font-semibold text-white hover:bg-radial-primary-hover disabled:opacity-50">
                {savingNotes ? 'Salvando...' : 'Salvar observações'}
              </button>
              <button type="button" disabled={savingNotes} onClick={() => { setEditingNotes(false); setNotesError(null); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{detail.contract.notes?.trim() || 'Nenhuma observação.'}</p>
            {onSaveNotes ? (
              <button type="button" onClick={() => { setNotesDraft(detail.contract.notes ?? ''); setNotesError(null); setEditingNotes(true); }}
                className="self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">
                Editar observações
              </button>
            ) : null}
          </div>
        )}
      </Section>

      {closureOpen && showClosureAction ? (
        <dialog ref={dialogRef} aria-labelledby="rental-closure-title"
          onCancel={(event) => { event.preventDefault(); closeClosure(); }}
          onClick={(event) => { if (event.target === event.currentTarget) closeClosure(); }}
          className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-[480px] border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 id="rental-closure-title" className="text-lg font-semibold">Encerrar locação</h2>
              <button type="button" aria-label="Fechar encerramento" onClick={closeClosure}
                className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600">×</button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm">
              {canStartClosure ? (
                <div>
                  <label className="mb-1.5 block font-medium text-slate-800" htmlFor="contract-closure-end-date">Data efetiva de término</label>
                  <input ref={closureDateRef} id="contract-closure-end-date" type="date" min={detail.contract.start_date}
                    value={closureEndDate} onChange={(event) => setClosureEndDate(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                </div>
              ) : (
                <p className="text-slate-700">Data efetiva de término: {detail.contract.end_date ? formatDateLabel(detail.contract.end_date) : 'Não informada'}</p>
              )}
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-slate-700">
                {pendingPhysicalReturns.length > 0
                  ? `${pendingPhysicalReturns.length} ${pendingPhysicalReturns.length === 1 ? 'equipamento físico pendente' : 'equipamentos físicos pendentes'} de devolução.`
                  : 'Sem equipamentos físicos pendentes de devolução.'}
              </p>
              {isClosing && pendingPhysicalReturns.length > 0 ? (
                <p className="text-slate-600">Registre as devoluções na seção Equipamentos locados antes de finalizar.</p>
              ) : null}
              {closureError ? <p role="alert" className="text-rose-700">{closureError}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button type="button" disabled={closureBusy} onClick={closeClosure}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              {canStartClosure && onStartClosure ? (
                <button type="button" disabled={!closureEndDate || closureBusy}
                  onClick={() => void submitClosure(() => onStartClosure(closureEndDate))}
                  className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
                  {closureBusy ? 'Processando...' : 'Iniciar encerramento'}
                </button>
              ) : isClosing && canCloseContract && onCloseContract ? (
                <button type="button" disabled={closureBusy} onClick={() => void submitClosure(onCloseContract)}
                  className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
                  {closureBusy ? 'Processando...' : 'Finalizar locação'}
                </button>
              ) : null}
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
