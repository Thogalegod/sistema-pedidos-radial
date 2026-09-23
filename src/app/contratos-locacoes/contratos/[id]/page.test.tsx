'use client';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';
import ContractDetailPage from './page';

const mocks = vi.hoisted(() => ({
  getContract: vi.fn(),
  getCustomer: vi.fn(),
  getCurrentOrganizationId: vi.fn(),
  getPaymentProofSignedUrl: vi.fn(),
  getRemittanceInvoiceSignedUrl: vi.fn(),
  getBoletoSignedUrl: vi.fn(),
  loadContractAttachmentDocuments: vi.fn(),
  listAvailableRentalAssets: vi.fn(),
  listCustomers: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  repairPendingBoletoChange: vi.fn(),
  replaceBoletoDocument: vi.fn(),
  saveBoletoDocument: vi.fn(),
  startContractClosure: vi.fn(),
  updateContract: vi.fn(),
  updateContractSafely: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'contract-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/lib/contratos-locacoes/queries', () => ({
  createSupabaseContractsLocacoesReadClient: () => ({}),
  getContract: mocks.getContract,
  getCustomer: mocks.getCustomer,
  listAvailableRentalAssets: mocks.listAvailableRentalAssets,
  listCustomers: mocks.listCustomers,
}));

vi.mock('@/lib/contratos-locacoes/contract-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/contratos-locacoes/contract-edit')>()),
  updateContractSafely: mocks.updateContractSafely,
}));

vi.mock('@/lib/contratos-locacoes/mutations', () => ({
  closeContract: vi.fn(),
  createBillingCycle: vi.fn(),
  createSupabaseContractsLocacoesMutationClient: () => ({
    deleteMissingRentalItems: vi.fn(),
    getContractById: vi.fn(),
    getCurrentOrganizationId: mocks.getCurrentOrganizationId,
    listBillingCyclesByContractId: vi.fn(),
    listRentalItemsByContractId: vi.fn(),
    upsertRentalItems: vi.fn(),
    updateContract: mocks.updateContract,
  }),
  pauseContract: vi.fn(),
  reactivateContract: vi.fn(),
  registerRentalItemReturn: vi.fn(),
  recordBillingPayment: vi.fn(),
  startContractClosure: mocks.startContractClosure,
  updateBillingCycleDetails: vi.fn(),
}));

vi.mock('@/lib/contratos-locacoes/remittance-documents', () => ({
  createSupabaseContractsLocacoesRemittanceDocumentClient: () => ({}),
  getRemittanceInvoiceSignedUrl: mocks.getRemittanceInvoiceSignedUrl,
  loadContractAttachmentDocuments: mocks.loadContractAttachmentDocuments,
  saveRemittanceInvoiceDocument: vi.fn(),
}));

vi.mock('@/lib/contratos-locacoes/payment-proofs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/contratos-locacoes/payment-proofs')>()),
  createSupabaseContractsLocacoesPaymentProofClient: () => ({}),
  getPaymentProofSignedUrl: mocks.getPaymentProofSignedUrl,
  savePaymentProofDocument: vi.fn(),
}));

vi.mock('@/lib/contratos-locacoes/boleto-documents', () => ({
  createBoletoChangeOperationId: () => '00000000-0000-4000-8000-000000000001',
  createSupabaseContractsLocacoesBoletoDocumentClient: () => ({}),
  getBoletoSignedUrl: mocks.getBoletoSignedUrl,
  repairPendingBoletoChange: mocks.repairPendingBoletoChange,
  replaceBoletoDocument: mocks.replaceBoletoDocument,
  saveBoletoDocument: mocks.saveBoletoDocument,
}));

function buildDetail(): ContractDetail {
  return {
    contract: {
      id: 'contract-1',
      organization_id: 'org-1',
      internal_number: '123',
      kind: 'rental',
      contract_company: 'fontes',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: null,
      transport_notes: null,
      has_remittance_invoice: false,
      remittance_invoice_number: null,
      remittance_invoice_issuer: null,
      remittance_invoice_amount: null,
      remittance_invoice_issue_date: null,
      start_date: '2026-08-01',
      end_date: null,
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '0',
      percentage_rate: null,
      status: 'active',
      pause_started_at: null,
      pause_reason: null,
      notes: null,
      created_at: '2026-08-01T12:00:00.000Z',
      updated_at: '2026-08-01T12:00:00.000Z',
    },
    customer: null,
    site: null,
    items: [],
    billingCycles: [],
    payments: [],
    membership: {
      organization_id: 'org-1',
      user_id: 'user-1',
      role: 'member',
      can_manage_billing: false,
      created_at: '2026-08-01T12:00:00.000Z',
    },
    boletoDocuments: [],
    billingDeliveryEvents: [],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const detail = buildDetail();
  mocks.getContract.mockResolvedValue(detail);
  mocks.getCurrentOrganizationId.mockResolvedValue('org-1');
  mocks.getPaymentProofSignedUrl.mockResolvedValue('https://storage.example/payment-proof.pdf');
  mocks.getRemittanceInvoiceSignedUrl.mockResolvedValue('https://storage.example/remittance.pdf');
  mocks.getBoletoSignedUrl.mockResolvedValue('https://storage.example/boleto.pdf');
  mocks.loadContractAttachmentDocuments.mockResolvedValue({
    remittanceDocument: null,
    paymentProofDocuments: [],
  });
  mocks.listCustomers.mockResolvedValue([]);
  mocks.getCustomer.mockResolvedValue({ sites: [] });
  mocks.listAvailableRentalAssets.mockResolvedValue([]);
  mocks.repairPendingBoletoChange.mockResolvedValue({});
  mocks.replaceBoletoDocument.mockResolvedValue({});
  mocks.saveBoletoDocument.mockResolvedValue({});
  mocks.updateContractSafely.mockImplementation(async (_client, _id, value) => ({
    contract: {
      ...detail.contract,
      transport_notes: value.transport_notes,
      notes: value.notes,
      legacy_order_number: value.legacy_order_number,
    },
    items: detail.items.map((item, index) => ({ ...item, unit_amount: value.items[index]?.unit_amount ?? item.unit_amount })),
  }));
  mocks.updateContract.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
    ...detail.contract,
    ...patch,
  }));
  mocks.startContractClosure.mockResolvedValue({ ...detail.contract, status: 'awaiting_return' });
});

describe('ContractDetailPage remittance editing', () => {
  it('groups active-contract actions in the header without duplicating a summary or final action section', async () => {
    render(<ContractDetailPage />);

    const actions = await screen.findByRole('group', { name: 'Ações da locação' });
    expect(within(actions).getByRole('button', { name: 'Editar locação' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Pausar locação' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Encerrar locação' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Reativar locação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resumo operacional' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Ações da locação' })).not.toBeInTheDocument();

    expect(within(actions).getByRole('button', { name: 'Editar locação' }).querySelector('.lucide-pencil')).not.toBeNull();
    expect(within(actions).getByRole('button', { name: 'Pausar locação' }).querySelector('.lucide-pause')).not.toBeNull();
    expect(within(actions).getByRole('button', { name: 'Encerrar locação' }).querySelector('.lucide-circle-stop')).not.toBeNull();
  });

  it('shows Reactivate instead of Pause for a paused contract', async () => {
    const detail = buildDetail();
    detail.contract.status = 'paused';
    mocks.getContract.mockResolvedValue(detail);
    render(<ContractDetailPage />);

    const actions = await screen.findByRole('group', { name: 'Ações da locação' });
    expect(within(actions).getByRole('button', { name: 'Reativar locação' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Pausar locação' })).not.toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Reativar locação' }).querySelector('.lucide-play')).not.toBeNull();
  });

  it('hides lifecycle actions for a closed contract', async () => {
    const detail = buildDetail();
    detail.contract.status = 'closed';
    detail.contract.end_date = '2026-08-20';
    mocks.getContract.mockResolvedValue(detail);
    render(<ContractDetailPage />);

    const actions = await screen.findByRole('group', { name: 'Ações da locação' });
    expect(within(actions).getByRole('button', { name: 'Editar locação' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Pausar locação' })).not.toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Reativar locação' })).not.toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Encerrar locação' })).not.toBeInTheDocument();
  });

  it('saves general observations in the existing contract notes field', async () => {
    const user = userEvent.setup();
    render(<ContractDetailPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar observações' }));
    await user.type(screen.getByRole('textbox', { name: 'Anotações gerais' }), 'Retirada prevista para sexta.');
    await user.click(screen.getByRole('button', { name: 'Salvar observações' }));

    await waitFor(() => expect(mocks.updateContract).toHaveBeenCalledWith('contract-1', {
      organization_id: 'org-1',
      notes: 'Retirada prevista para sexta.',
    }));
    expect(await screen.findByText('Retirada prevista para sexta.')).toBeInTheDocument();
  });

  it('starts closure through the existing mutation with the selected effective date', async () => {
    const user = userEvent.setup();
    render(<ContractDetailPage />);

    await user.click(await screen.findByRole('button', { name: 'Encerrar locação' }));
    const drawer = screen.getByRole('dialog', { name: 'Encerrar locação' });
    fireEvent.change(within(drawer).getByLabelText('Data efetiva de término'), { target: { value: '2026-08-20' } });
    await user.click(within(drawer).getByRole('button', { name: 'Iniciar encerramento' }));

    await waitFor(() => expect(mocks.startContractClosure).toHaveBeenCalledWith(
      expect.objectContaining({ getCurrentOrganizationId: mocks.getCurrentOrganizationId }),
      'contract-1',
      { end_date: '2026-08-20' }
    ));
  });

  it('finishes a boleto attachment before showing success and reloading the detail', async () => {
    const user = userEvent.setup();
    const detail = buildDetail();
    detail.membership.can_manage_billing = true;
    detail.billingCycles = [buildBilling()];
    mocks.getContract.mockResolvedValue(detail);

    render(<ContractDetailPage />);
    await user.click(await screen.findByRole('button', { name: /detalhes da cobrança/i }));
    await user.upload(await screen.findByLabelText('Anexar boleto'), new File(['%PDF'], 'boleto.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(mocks.saveBoletoDocument).toHaveBeenCalledOnce());
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Boleto anexado.');
    expect(mocks.getContract).toHaveBeenCalledTimes(2);
  });

  it('keeps a partial boleto failure without a success toast', async () => {
    const user = userEvent.setup();
    const detail = buildDetail();
    detail.membership.can_manage_billing = true;
    detail.billingCycles = [buildBilling()];
    mocks.getContract.mockResolvedValue(detail);
    mocks.saveBoletoDocument.mockRejectedValue(new Error('alteração permaneceu pendente'));

    render(<ContractDetailPage />);
    await user.click(await screen.findByRole('button', { name: /detalhes da cobrança/i }));
    await user.upload(await screen.findByLabelText('Anexar boleto'), new File(['%PDF'], 'boleto.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('alteração permaneceu pendente'));
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('Boleto anexado.');
  });

  it('reuploads a selected PDF to repair the operation loaded with a pending cycle', async () => {
    const user = userEvent.setup();
    const detail = buildDetail();
    detail.membership.can_manage_billing = true;
    detail.billingCycles = [buildBilling({
      boleto_change_pending: true,
      boleto_change_operation_id: '00000000-0000-4000-8000-000000000009',
      boleto_change_started_at: '2026-08-24T10:00:00.000Z',
    })];
    mocks.getContract.mockResolvedValue(detail);

    render(<ContractDetailPage />);
    await user.click(await screen.findByRole('button', { name: /detalhes da cobrança/i }));
    const file = new File(['%PDF repaired'], 'boleto.pdf', { type: 'application/pdf' });
    await user.upload(await screen.findByLabelText('Concluir alteração pendente'), file);

    await waitFor(() => expect(mocks.repairPendingBoletoChange).toHaveBeenCalledWith(
      expect.anything(), detail.contract, detail.billingCycles[0], file
    ));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Alteração pendente concluída.');
  });

  it('opens the dedicated rental editor and reflects a saved change without leaving the detail', async () => {
    const user = userEvent.setup();
    render(<ContractDetailPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar locação' }));
    const drawer = await screen.findByRole('dialog', { name: 'Editar locação' });
    expect(drawer).toHaveClass('max-w-[920px]');
    expect(within(drawer).getByLabelText('Empresa')).toBeEnabled();
    await user.type(screen.getByLabelText('Transporte'), 'Retirada pelo cliente');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.updateContractSafely).toHaveBeenCalled());
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Locação atualizada com sucesso.');
    expect(screen.queryByRole('heading', { name: 'Editar locação' })).not.toBeInTheDocument();
  });

  it('uses a compact edit drawer after billing and returns focus on cancellation', async () => {
    const user = userEvent.setup();
    const detail = buildDetail();
    detail.billingCycles = [buildBilling()];
    mocks.getContract.mockResolvedValue(detail);
    render(<ContractDetailPage />);

    const trigger = await screen.findByRole('button', { name: 'Editar locação' });
    await user.click(trigger);
    const drawer = await screen.findByRole('dialog', { name: 'Editar locação' });
    expect(drawer).toHaveClass('max-w-[620px]');
    expect(within(drawer).queryByLabelText('Empresa')).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Editar locação' })).not.toBeInTheDocument();
  });

  it('updates the NF data and reflects it immediately in the detail', async () => {
    const user = userEvent.setup();
    render(<ContractDetailPage />);

    await user.click(await screen.findByRole('button', { name: /(editar|adicionar) dados da nf de remessa/i }));
    await user.selectOptions(screen.getByLabelText(/possui nf de remessa/i), 'yes');
    await user.type(screen.getByLabelText(/número da nf/i), 'NF-900');
    await user.clear(screen.getByLabelText(/valor da nf/i));
    await user.type(screen.getByLabelText(/valor da nf/i), '900,50');
    await user.type(screen.getByLabelText(/data de emissão da nf/i), '2026-08-18');
    await user.click(screen.getByRole('button', { name: /salvar dados da nf de remessa/i }));

    await waitFor(() => {
      expect(screen.getByText('NF-900')).toBeInTheDocument();
      expect(screen.getByText('R$ 900,50')).toBeInTheDocument();
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Dados da NF de remessa atualizados.');
  });

  it('opens the remittance NF only in a blank isolated tab', async () => {
    const user = userEvent.setup();
    const detail = buildDetail();
    detail.contract = {
      ...detail.contract,
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-100',
      remittance_invoice_issuer: 'Fontes',
      remittance_invoice_amount: '10000',
      remittance_invoice_issue_date: '2026-08-01',
    };
    const document = {
      id: 'document-1',
      organization_id: 'org-1',
      contract_id: 'contract-1',
      billing_cycle_id: null,
      payment_id: null,
      inspection_id: null,
      kind: 'remittance_nf',
      storage_path: 'org-1/contract-1/remittance_nf/nf.pdf',
      file_name: 'nf.pdf',
      content_type: 'application/pdf',
      created_by: 'user-1',
      created_at: '2026-08-01T12:00:00.000Z',
    };
    const openedWindow = { close: vi.fn(), location: { href: 'about:blank' }, opener: window };
    vi.spyOn(window, 'open').mockReturnValue(openedWindow as unknown as Window);
    mocks.getContract.mockResolvedValue(detail);
    mocks.loadContractAttachmentDocuments.mockResolvedValue({
      remittanceDocument: document,
      paymentProofDocuments: [],
    });

    render(<ContractDetailPage />);
    await user.click(await screen.findByRole('button', { name: /abrir\/baixar/i }));

    await waitFor(() => {
      expect(openedWindow.location.href).toBe('https://storage.example/remittance.pdf');
    });
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(openedWindow.opener).toBeNull();
  });

  it('opens a payment proof only in a blank isolated tab', async () => {
    const user = userEvent.setup();
    const detail = buildDetail();
    detail.billingCycles = [
      {
        id: 'billing-1',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        sequence_number: 1,
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        issue_date: '2026-08-01',
        due_date: '2026-08-10',
        base_amount: '10000',
        discount_amount: '0',
        surcharge_amount: '0',
        exemption_amount: '0',
        total_amount: '10000',
        document_type: 'receipt',
        document_number: 'REC-1',
        status: 'paid',
        sent_at: null,
        needs_resend: false,
        content_revision: '0',
        boleto_change_pending: false,
        boleto_change_operation_id: null,
        boleto_change_started_at: null,
        notes: null,
        created_at: '2026-08-01T12:00:00.000Z',
        updated_at: '2026-08-01T12:00:00.000Z',
      },
    ];
    detail.payments = [
      {
        id: 'payment-1',
        organization_id: 'org-1',
        billing_cycle_id: 'billing-1',
        paid_at: '2026-08-10T12:00:00.000Z',
        amount: '10000',
        notes: null,
        created_at: '2026-08-10T12:00:00.000Z',
        updated_at: '2026-08-10T12:00:00.000Z',
      },
    ];
    const proof = {
      id: 'proof-1',
      organization_id: 'org-1',
      contract_id: 'contract-1',
      billing_cycle_id: 'billing-1',
      payment_id: 'payment-1',
      inspection_id: null,
      kind: 'payment_proof',
      storage_path: 'org-1/contract-1/payment_proof/proof.pdf',
      file_name: 'proof.pdf',
      content_type: 'application/pdf',
      created_by: 'user-1',
      created_at: '2026-08-10T12:00:00.000Z',
    };
    const openedWindow = { close: vi.fn(), location: { href: 'about:blank' }, opener: window };
    vi.spyOn(window, 'open').mockReturnValue(openedWindow as unknown as Window);
    mocks.getContract.mockResolvedValue(detail);
    mocks.loadContractAttachmentDocuments.mockResolvedValue({
      remittanceDocument: null,
      paymentProofDocuments: [proof],
    });

    render(<ContractDetailPage />);
    await user.click(await screen.findByRole('button', { name: /detalhes da cobrança/i }));
    await user.click(await screen.findByRole('button', { name: /abrir comprovante/i }));

    await waitFor(() => {
      expect(openedWindow.location.href).toBe('https://storage.example/payment-proof.pdf');
    });
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(openedWindow.opener).toBeNull();
  });
});

function buildBilling(overrides: Partial<ContractDetail['billingCycles'][number]> = {}): ContractDetail['billingCycles'][number] {
  return {
    id: 'billing-1', organization_id: 'org-1', contract_id: 'contract-1', sequence_number: 1,
    period_start: '2026-08-01', period_end: '2026-08-31', issue_date: '2026-08-01', due_date: '2026-08-10',
    base_amount: '10000', discount_amount: '0', surcharge_amount: '0', exemption_amount: '0', total_amount: '10000',
    document_type: 'receipt', document_number: 'REC-1', status: 'issued', sent_at: null, needs_resend: false,
    content_revision: '0', boleto_change_pending: false, boleto_change_operation_id: null,
    boleto_change_started_at: null, notes: null, created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}
