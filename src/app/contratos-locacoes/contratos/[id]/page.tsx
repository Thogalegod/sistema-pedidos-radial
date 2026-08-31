'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Play, Pause } from 'lucide-react';
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
  const boletoChangesInFlight = useRef(new Set<string>());
  const isFinalContractStatus = detail?.contract.status === 'closed' || detail?.contract.status === 'cancelled';

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
    setEditing(false);
    toast.success('Locação atualizada com sucesso.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          href="/contratos-locacoes/contratos"
        >
          <ArrowLeft size={16} />
          Voltar para contratos
        </Link>

        <div className="flex flex-wrap justify-end gap-2">
          {detail ? (
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
              disabled={loadingEditor}
              onClick={() => void handleOpenEditor()}
              type="button"
            >
              <Pencil size={16} />
              {loadingEditor ? 'Preparando edição...' : 'Editar locação'}
            </button>
          ) : null}
        {detail?.contract.status === 'paused' && !isFinalContractStatus ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            onClick={() => void handleReactivate()}
            type="button"
          >
            <Play size={16} />
            Reativar
          </button>
        ) : detail && !isFinalContractStatus ? (
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            onClick={() => void handlePause()}
            type="button"
          >
            <Pause size={16} />
            Pausar
          </button>
        ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando contrato...</div>
      ) : detail ? (
        <>
          {editing ? (
            <ContractEditForm
              availableAssets={editAssets}
              customers={editCustomers}
              customerSites={editSites}
              hasBilling={detail.billingCycles.length > 0}
              initialValue={buildContractEditInput(detail.contract, detail.items)}
              loadAvailableAssets={loadEditAssets}
              onCancel={() => setEditing(false)}
              onSubmit={handleSaveEdit}
            />
          ) : null}
          <ContractSummary
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
            onRegisterItemReturn={handleRegisterItemReturn}
            onRecordBillingPayment={handleRecordBillingPayment}
            onRepairPendingBoleto={handleRepairPendingBoleto}
            onReplaceBoleto={handleReplaceBoleto}
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
