'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleStop, Pause, Pencil, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { ContractEditForm } from '@/components/contratos-locacoes/ContractEditForm';
import { ContractSummary } from '@/components/contratos-locacoes/ContractSummary';
import { RemittanceInvoiceAttachmentCard } from '@/components/contratos-locacoes/RemittanceInvoiceAttachmentCard';
import { RemittanceInvoiceEditor } from '@/components/contratos-locacoes/RemittanceInvoiceEditor';
import type { BillingPaymentFormValues } from '@/components/contratos-locacoes/BillingPaymentForm';
import type { BillingPeriodFormValues } from '@/components/contratos-locacoes/BillingPeriodForm';
import type { BillingSendResult } from '@/lib/contratos-locacoes/types';
import {
  createSupabaseContractsLocacoesReadClient,
  getContract,
  getCustomer,
  listAvailableRentalAssets,
  listCustomers,
  type ContractDetail,
  type CustomerListItem,
} from '@/lib/contratos-locacoes/queries';
import {
  buildContractEditInput,
  updateContractSafely,
  type ContractEditMutationClient,
  type ContractEditInput,
} from '@/lib/contratos-locacoes/contract-edit';
import { buildRentalItemBillingLines } from '@/lib/contratos-locacoes/billing-periods';
import {
  closeContract,
  createBillingCycle,
  createSupabaseContractsLocacoesMutationClient,
  pauseContract,
  reactivateContract,
  registerRentalItemReturn,
  recordBillingPayment,
  startContractClosure,
  updateBillingCycleDetails,
} from '@/lib/contratos-locacoes/mutations';
import {
  createBoletoChangeOperationId,
  createSupabaseContractsLocacoesBoletoDocumentClient,
  getBoletoSignedUrl,
  repairPendingBoletoChange,
  replaceBoletoDocument,
  saveBoletoDocument,
} from '@/lib/contratos-locacoes/boleto-documents';
import {
  createSupabaseContractsLocacoesRemittanceDocumentClient,
  getRemittanceInvoiceSignedUrl,
  loadContractAttachmentDocuments,
  saveRemittanceInvoiceDocument,
} from '@/lib/contratos-locacoes/remittance-documents';
import {
  createSupabaseContractsLocacoesPaymentProofClient,
  getPaymentProofSignedUrl,
  savePaymentProofDocument,
} from '@/lib/contratos-locacoes/payment-proofs';
import {
  updateRemittanceInvoice,
  type RemittanceInvoiceUpdateInput,
} from '@/lib/contratos-locacoes/remittance-invoice-update';
import { openDocumentInNewTab } from '@/lib/contratos-locacoes/open-document-window';
import type { BillingCycle, ContractDocument, CustomerSite, Payment, RentalAsset, RentalItem } from '@/lib/contratos-locacoes/types';
import { supabase } from '@/lib/supabase';

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const contractId = params.id;
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [remittanceDocument, setRemittanceDocument] = useState<ContractDocument | null>(null);
  const [paymentProofDocuments, setPaymentProofDocuments] = useState<ContractDocument[]>([]);
  const [editing, setEditing] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [editCustomers, setEditCustomers] = useState<CustomerListItem[]>([]);
  const [editSites, setEditSites] = useState<CustomerSite[]>([]);
  const [editAssets, setEditAssets] = useState<RentalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingAttachment, setOpeningAttachment] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [closureOpen, setClosureOpen] = useState(false);
  const boletoChangesInFlight = useRef(new Set<string>());
  const closureTriggerRef = useRef<HTMLButtonElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const contractStatus = detail?.contract.status;
  const canPause = contractStatus === 'active';
  const canReactivate = contractStatus === 'paused';
  const canStartClosure = contractStatus === 'active' || contractStatus === 'paused';
  const isClosing = contractStatus === 'closing_requested'
    || contractStatus === 'awaiting_return'
    || contractStatus === 'inspection';
  const showClosureAction = canStartClosure || isClosing;

  useEffect(() => {
    const dialog = editDialogRef.current;
    if (!editing || !dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, [editing]);

  const closeEditor = () => {
    setEditing(false);
    queueMicrotask(() => editTriggerRef.current?.focus());
  };

  const load = async () => {
    setLoading(true);
    try {
      const readClient = createSupabaseContractsLocacoesReadClient(supabase);
      const data = await getContract(readClient, contractId);
      const documentClient = createSupabaseContractsLocacoesRemittanceDocumentClient(supabase);
      const attachments = await loadContractAttachmentDocuments(documentClient, data.contract);
      setDetail(data);
      setRemittanceDocument(attachments.remittanceDocument);
      setPaymentProofDocuments(attachments.paymentProofDocuments);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o contrato.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;
    const readClient = createSupabaseContractsLocacoesReadClient(supabase);
    const documentClient = createSupabaseContractsLocacoesRemittanceDocumentClient(supabase);

    async function loadInitialDetail() {
      try {
        const data = await getContract(readClient, contractId);
        const attachments = await loadContractAttachmentDocuments(documentClient, data.contract);
        if (!isActive) {
          return;
        }

        setDetail(data);
        setRemittanceDocument(attachments.remittanceDocument);
        setPaymentProofDocuments(attachments.paymentProofDocuments);
      } catch (error) {
        if (!isActive) {
          return;
        }

        toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o contrato.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadInitialDetail();

    return () => {
      isActive = false;
    };
  }, [contractId]);

  const handlePause = async () => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await pauseContract(mutationClient, contractId, {
      pause_started_at: new Date().toISOString().slice(0, 10),
      pause_reason: 'Pausado manualmente pelo usuário',
    });
    toast.success('Contrato pausado.');
    await load();
  };

  const handleReactivate = async () => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await reactivateContract(mutationClient, contractId, {
      reactivated_at: new Date().toISOString().slice(0, 10),
    });
    toast.success('Contrato reativado.');
    await load();
  };

  const handleUploadAttachment = async (file: File) => {
    if (!detail) {
      return;
    }

    setUploadingAttachment(true);
    try {
      const documentClient = createSupabaseContractsLocacoesRemittanceDocumentClient(supabase);
      const document = await saveRemittanceInvoiceDocument(documentClient, detail.contract, file);
      setRemittanceDocument(document);
      toast.success('Anexo da NF de remessa salvo com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível anexar a NF de remessa.');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleOpenAttachment = async () => {
    if (!remittanceDocument) {
      return;
    }

    setOpeningAttachment(true);
    try {
      await openDocumentInNewTab(() => {
        const documentClient = createSupabaseContractsLocacoesRemittanceDocumentClient(supabase);
        return getRemittanceInvoiceSignedUrl(documentClient, remittanceDocument);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o anexo da NF de remessa.');
    } finally {
      setOpeningAttachment(false);
    }
  };

  const handleUpdateRemittanceInvoice = async (value: RemittanceInvoiceUpdateInput) => {
    if (!detail) {
      return;
    }

    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const contract = await updateRemittanceInvoice(
      mutationClient,
      detail.contract,
      value,
      { hasAttachedDocument: Boolean(remittanceDocument) }
    );

    setDetail((current) => current ? { ...current, contract } : current);
    toast.success('Dados da NF de remessa atualizados.');
  };

  const handleCreateBillingPeriod = async (values: BillingPeriodFormValues & { sequence_number: number }) => {
    if (!detail) {
      return;
    }

    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await createBillingCycle(mutationClient, {
      contract_id: detail.contract.id,
      period_start: values.period_start,
      period_end: values.period_end,
      issue_date: values.issue_date,
      due_date: values.due_date,
      document_type: 'receipt',
      document_number: '',
      sequence_number: values.sequence_number,
      discount_amount: '0',
      surcharge_amount: '0',
      exemption_amount: '0',
      notes: values.notes,
      show_note_on_invoice: values.show_note_on_invoice,
      items: buildRentalItemBillingLines(detail.items, () => crypto.randomUUID()),
    });
    toast.success('Período de cobrança salvo.');
    await load();
  };

  const handleStartClosure = async (endDate: string) => {
    try {
      const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
      const contract = await startContractClosure(mutationClient, contractId, { end_date: endDate });
      toast.success(contract.status === 'closed' ? 'Locação encerrada.' : 'Encerramento iniciado.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar o encerramento.');
      throw error;
    }
  };

  const handleRegisterItemReturn = async (item: RentalItem, returnedAt: string) => {
    try {
      const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
      await registerRentalItemReturn(mutationClient, contractId, item.id, { returned_at: returnedAt });
      toast.success('Devolução registrada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a devolução.');
    }
  };

  const handleCloseContract = async () => {
    try {
      const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
      await closeContract(mutationClient, contractId);
      toast.success('Locação encerrada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível finalizar a locação.');
      throw error;
    }
  };

  const handleUpdateBillingPeriod = async (billing: BillingCycle, values: BillingPeriodFormValues) => {
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    await updateBillingCycleDetails(mutationClient, billing.id, values);
    toast.success('Período atualizado.');
    await load();
  };

  const handleAttachBoleto = async (billing: BillingCycle, file: File) => {
    if (!detail || boletoChangesInFlight.current.has(billing.id)) return;
    boletoChangesInFlight.current.add(billing.id);
    try {
      const client = createSupabaseContractsLocacoesBoletoDocumentClient(supabase);
      await saveBoletoDocument(client, detail.contract, billing, file, createBoletoChangeOperationId());
      toast.success('Boleto anexado.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível anexar o boleto.');
      await load();
    } finally {
      boletoChangesInFlight.current.delete(billing.id);
    }
  };

  const handleReplaceBoleto = async (billing: BillingCycle, document: ContractDocument, file: File) => {
    if (!detail || boletoChangesInFlight.current.has(billing.id)) return;
    boletoChangesInFlight.current.add(billing.id);
    try {
      const client = createSupabaseContractsLocacoesBoletoDocumentClient(supabase);
      await replaceBoletoDocument(client, detail.contract, billing, document, file, createBoletoChangeOperationId());
      toast.success('Boleto substituído.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível substituir o boleto.');
      await load();
    } finally {
      boletoChangesInFlight.current.delete(billing.id);
    }
  };

  const handleRepairPendingBoleto = async (billing: BillingCycle, file: File) => {
    if (!detail || boletoChangesInFlight.current.has(billing.id)) return;
    boletoChangesInFlight.current.add(billing.id);
    try {
      const client = createSupabaseContractsLocacoesBoletoDocumentClient(supabase);
      await repairPendingBoletoChange(client, detail.contract, billing, file);
      toast.success('Alteração pendente concluída.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a alteração pendente.');
      await load();
    } finally {
      boletoChangesInFlight.current.delete(billing.id);
    }
  };

  const handleOpenBoleto = async (document: ContractDocument) => {
    try {
      await openDocumentInNewTab(() => getBoletoSignedUrl(
        createSupabaseContractsLocacoesBoletoDocumentClient(supabase),
        document
      ));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o boleto.');
    }
  };

  const handleAttachPaymentProof = async (billing: BillingCycle, payment: Payment, file: File) => {
    if (!detail) {
      return;
    }

    const proofClient = createSupabaseContractsLocacoesPaymentProofClient(supabase);
    const document = await savePaymentProofDocument(proofClient, detail.contract, billing, payment, file);
    setPaymentProofDocuments((current) => [document, ...current.filter((entry) => entry.id !== document.id)]);
    toast.success('Comprovante anexado.');
    await load();
  };

  const handleRecordBillingPayment = async (
    billing: BillingCycle,
    values: BillingPaymentFormValues,
    file: File | null
  ) => {
    if (!detail) {
      return;
    }

    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const result = await recordBillingPayment(mutationClient, billing.id, {
      billing_cycle_id: billing.id,
      paid_at: values.paid_at,
      amount: values.amount,
      notes: values.notes,
    });

    if (!file) {
      toast.success('Recebimento registrado.');
      await load();
      return;
    }

    try {
      await handleAttachPaymentProof(result.billing, result.payment, file);
      toast.success('Recebimento registrado com comprovante.');
    } catch (proofError) {
      toast.error(
        proofError instanceof Error
          ? `Recebimento salvo, mas o comprovante não foi anexado: ${proofError.message}`
          : 'Recebimento salvo, mas o comprovante não foi anexado.'
      );
      await load();
    }
  };

  const handleOpenPaymentProof = async (document: ContractDocument) => {
    try {
      await openDocumentInNewTab(() => {
        const proofClient = createSupabaseContractsLocacoesPaymentProofClient(supabase);
        return getPaymentProofSignedUrl(proofClient, document);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o comprovante.');
    }
  };

  const loadEditAssets = useCallback(async (startDate: string) => {
    if (!detail) return [];
    const readClient = createSupabaseContractsLocacoesReadClient(supabase);
    return listAvailableRentalAssets(readClient, {
      start_date: startDate,
      end_date: detail.contract.end_date,
      exclude_contract_id: detail.contract.id,
    });
  }, [detail]);

  const handleOpenEditor = async () => {
    if (!detail) return;
    setLoadingEditor(true);
    try {
      const readClient = createSupabaseContractsLocacoesReadClient(supabase);
      const customers = await listCustomers(readClient, { status: 'all' });
      const customerDetails = await Promise.all(customers.map((customer) => getCustomer(readClient, customer.id)));
      const assets = detail.billingCycles.length === 0
        ? await loadEditAssets(detail.contract.start_date)
        : [];
      setEditCustomers(customers);
      setEditSites(customerDetails.flatMap((customerDetail) => customerDetail.sites));
      setEditAssets(assets);
      setEditing(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível preparar a edição da locação.');
    } finally {
      setLoadingEditor(false);
    }
  };

  const handleBillingSent = async (result: BillingSendResult) => {
    if (result.status === 'sent_content_changed' || (result.status === 'reconciled' && result.review_required)) {
      toast.success('Cobrança enviada. O conteúdo mudou durante a finalização; revise e reenvie.');
    } else {
      toast.success(result.status === 'reconciled' ? 'Envio reconciliado com sucesso.' : 'Cobrança enviada com sucesso.');
    }
    await load();
  };

  const handleSaveEdit = async (value: ContractEditInput) => {
    if (!detail) return;
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const editClient: ContractEditMutationClient = {
      getCurrentOrganizationId: mutationClient.getCurrentOrganizationId.bind(mutationClient),
      getContractById: requireEditMethod(mutationClient.getContractById, 'getContractById').bind(mutationClient),
      listRentalItemsByContractId: requireEditMethod(mutationClient.listRentalItemsByContractId, 'listRentalItemsByContractId').bind(mutationClient),
      listBillingCyclesByContractId: requireEditMethod(mutationClient.listBillingCyclesByContractId, 'listBillingCyclesByContractId').bind(mutationClient),
      updateContract: mutationClient.updateContract.bind(mutationClient),
      upsertRentalItems: mutationClient.upsertRentalItems.bind(mutationClient),
      deleteMissingRentalItems: mutationClient.deleteMissingRentalItems.bind(mutationClient),
    };
    const result = await updateContractSafely(editClient, detail.contract.id, value);
    setDetail((current) => current ? { ...current, contract: result.contract, items: result.items } : current);
    closeEditor();
    toast.success('Locação atualizada com sucesso.');
  };

  const handleSaveNotes = async (notes: string | null) => {
    if (!detail) return;
    const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
    const organizationId = await mutationClient.getCurrentOrganizationId();
    const contract = await mutationClient.updateContract(detail.contract.id, {
      organization_id: organizationId,
      notes,
    });
    setDetail((current) => current ? { ...current, contract } : current);
    toast.success('Observações atualizadas.');
  };

  const handleClosureOpenChange = (open: boolean) => {
    setClosureOpen(open);
    if (!open) {
      closureTriggerRef.current?.focus();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          href="/contratos-locacoes/contratos"
        >
          <ArrowLeft size={16} />
          Voltar para contratos
        </Link>

        <div aria-label="Ações da locação" className="flex flex-wrap gap-2 sm:justify-end" role="group">
          {detail ? (
            <button
              ref={editTriggerRef}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-60"
              disabled={loadingEditor}
              onClick={() => void handleOpenEditor()}
              type="button"
            >
              <Pencil size={16} />
              {loadingEditor ? 'Preparando edição...' : 'Editar locação'}
            </button>
          ) : null}
          {canPause ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:border-amber-300 hover:bg-amber-100"
              onClick={() => void handlePause()}
              type="button"
            >
              <Pause size={16} />
              Pausar locação
            </button>
          ) : null}
          {canReactivate ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100"
              onClick={() => void handleReactivate()}
              type="button"
            >
              <Play size={16} />
              Reativar locação
            </button>
          ) : null}
          {showClosureAction ? (
            <button
              ref={closureTriggerRef}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100"
              onClick={() => setClosureOpen(true)}
              type="button"
            >
              <CircleStop size={16} />
              {canStartClosure ? 'Encerrar locação' : 'Acompanhar encerramento'}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando contrato...</div>
      ) : detail ? (
        <>
          {editing ? (
            <dialog
              ref={editDialogRef}
              aria-labelledby="contract-edit-title"
              onCancel={(event) => { event.preventDefault(); closeEditor(); }}
              className={`fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40 ${detail.billingCycles.length > 0 ? 'max-w-[620px]' : 'max-w-[920px]'}`}
            >
              <ContractEditForm
                availableAssets={editAssets}
                customers={editCustomers}
                customerSites={editSites}
                hasBilling={detail.billingCycles.length > 0}
                initialValue={buildContractEditInput(detail.contract, detail.items)}
                loadAvailableAssets={loadEditAssets}
                onCancel={closeEditor}
                onSubmit={handleSaveEdit}
              />
            </dialog>
          ) : null}
          <ContractSummary
            closureOpen={closureOpen}
            detail={detail}
            openNewBillingForm={searchParams.get('action') === 'new-billing'}
            paymentProofDocuments={paymentProofDocuments}
            onAttachBoleto={handleAttachBoleto}
            onAttachPaymentProof={handleAttachPaymentProof}
            onCloseContract={handleCloseContract}
            onCreateBillingPeriod={handleCreateBillingPeriod}
            onOpenBoleto={handleOpenBoleto}
            onOpenPaymentProof={handleOpenPaymentProof}
            onBillingSent={handleBillingSent}
            onClosureOpenChange={handleClosureOpenChange}
            onRegisterItemReturn={handleRegisterItemReturn}
            onRecordBillingPayment={handleRecordBillingPayment}
            onRepairPendingBoleto={handleRepairPendingBoleto}
            onReplaceBoleto={handleReplaceBoleto}
            onSaveNotes={handleSaveNotes}
            onStartClosure={handleStartClosure}
            onUpdateBillingPeriod={handleUpdateBillingPeriod}
            remittanceAttachmentSlot={
              <RemittanceInvoiceAttachmentCard
                document={remittanceDocument}
                onOpen={handleOpenAttachment}
                onUpload={handleUploadAttachment}
                opening={openingAttachment}
                uploading={uploadingAttachment}
              />
            }
            remittanceEditorSlot={
              <RemittanceInvoiceEditor
                contract={detail.contract}
                hasAttachedDocument={Boolean(remittanceDocument)}
                onSave={handleUpdateRemittanceInvoice}
              />
            }
          />
        </>
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Contrato não encontrado.
        </div>
      )}
    </div>
  );
}

function requireEditMethod<T>(method: T | undefined, name: string): T {
  if (!method) {
    throw new Error(`Cliente de mutação sem suporte para ${name}`);
  }
  return method;
}
