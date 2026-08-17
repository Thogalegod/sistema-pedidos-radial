'use client';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractSummary } from './ContractSummary';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';

afterEach(() => {
  cleanup();
});

function buildDetail(overrides: Partial<ContractDetail> = {}): ContractDetail {
  return {
    contract: {
      id: 'contract-1',
      organization_id: 'org-1',
      internal_number: '123',
      kind: 'rental',
      contract_company: 'radial',
      customer_id: 'customer-1',
      site_id: 'site-1',
      legacy_order_number: 'OS-1',
      transport_notes: 'Radial entrega com caminhão próprio',
      has_remittance_invoice: true,
      remittance_invoice_number: 'NF-1000',
      remittance_invoice_issuer: 'Radial',
      remittance_invoice_amount: '350000',
      remittance_invoice_issue_date: '2026-07-08',
      start_date: '2026-07-06',
      end_date: null,
      recurrence_days: 30,
      pricing_model: 'fixed',
      base_amount: '999999',
      percentage_rate: null,
      status: 'active',
      pause_started_at: null,
      pause_reason: null,
      notes: 'Locação com acesso pela portaria principal.',
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
    },
    customer: {
      id: 'customer-1',
      organization_id: 'org-1',
      legal_name: 'Radial Energia',
      trade_name: 'Radial',
      tax_id: null,
      state_registration: null,
      municipal_registration: null,
      notes: null,
      active: true,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
    },
    site: {
      id: 'site-1',
      organization_id: 'org-1',
      customer_id: 'customer-1',
      name: 'Matriz',
      address_line: 'Rua A',
      number: '100',
      complement: null,
      district: 'Centro',
      city: 'Campinas',
      state: 'SP',
      postal_code: '13000-000',
      notes: null,
      active: true,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
    },
    items: [
      {
        id: 'item-1',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        asset_id: 'asset-1',
        description: 'Transformador 150 kVA',
        equipment_type: 'Transformador',
        capacity: '150 kVA',
        serial_number: 'SER-150',
        internal_code: 'INT-150',
        quantity: 2,
        unit_amount: '150000',
        status: 'rented',
        returned_at: null,
        future_inventory_item_id: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      },
      {
        id: 'item-2',
        organization_id: 'org-1',
        contract_id: 'contract-1',
        asset_id: null,
        description: 'Cabo de interligação',
        equipment_type: 'Acessório',
        capacity: '',
        serial_number: '',
        internal_code: '',
        quantity: 1,
        unit_amount: '25000',
        status: 'rented',
        returned_at: null,
        future_inventory_item_id: null,
        created_at: '2026-07-06T00:00:00.000Z',
        updated_at: '2026-07-06T00:00:00.000Z',
      },
    ],
    billingCycles: [],
    payments: [],
    ...overrides,
  } as ContractDetail;
}

describe('ContractSummary', () => {
  it('renders the rental detail in the operational Lote 1 structure', () => {
    render(
      <ContractSummary
        remittanceAttachmentSlot={<span>Anexo da NF de remessa</span>}
        detail={buildDetail()}
      />
    );

    const sections = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(sections).toEqual([
      'Dados da locação',
      'Equipamentos locados',
      'Financeiro da locação',
      'Documentos',
    ]);

    const rentalData = screen.getByRole('region', { name: 'Dados da locação' });
    expect(within(rentalData).getByText('#123')).toBeInTheDocument();
    expect(within(rentalData).getByText('Radial Energia')).toBeInTheDocument();
    expect(within(rentalData).getByText('Matriz')).toBeInTheDocument();
    expect(within(rentalData).getAllByText('Radial')).toHaveLength(1);
    expect(within(rentalData).getByText('2026-07-06')).toBeInTheDocument();
    expect(within(rentalData).getByText('OS-1')).toBeInTheDocument();
    expect(within(rentalData).getByText('active')).toBeInTheDocument();
    expect(within(rentalData).getByText('Locação com acesso pela portaria principal.')).toBeInTheDocument();
    expect(within(rentalData).getByText('R$ 3.250,00')).toBeInTheDocument();

    expect(screen.queryByText(/^Tipo$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^rental$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recorrência/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/modelo de preço/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fim$/i)).not.toBeInTheDocument();
  });

  it('shows item quantity, unit amount and subtotal without old technical fields', () => {
    render(<ContractSummary detail={buildDetail()} />);

    const equipment = screen.getByRole('region', { name: 'Equipamentos locados' });
    expect(within(equipment).getByText('Transformador 150 kVA')).toBeInTheDocument();
    expect(within(equipment).getByText('SER-150')).toBeInTheDocument();
    expect(within(equipment).getByText('2')).toBeInTheDocument();
    expect(within(equipment).getByText('R$ 1.500,00')).toBeInTheDocument();
    expect(within(equipment).getByText('R$ 3.000,00')).toBeInTheDocument();
    expect(within(equipment).getByText(/R\$ 3\.250,00/)).toBeInTheDocument();
    expect(screen.queryByText(/capacidade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/código interno/i)).not.toBeInTheDocument();
    expect(screen.queryByText('INT-150')).not.toBeInTheDocument();
  });

  it('shows an empty financial state when the rental has no billing cycle yet', () => {
    render(<ContractSummary detail={buildDetail()} />);

    const finance = screen.getByRole('region', { name: 'Financeiro da locação' });
    expect(within(finance).getByText('R$ 3.250,00')).toBeInTheDocument();
    expect(within(finance).getByText('Nenhum período de cobrança gerado ainda.')).toBeInTheDocument();
  });

  it('preserves remittance invoice metadata and attachment slot in Documents', () => {
    render(
      <ContractSummary
        detail={buildDetail()}
        remittanceAttachmentSlot={<button type="button">Abrir/Baixar</button>}
      />
    );

    const documents = screen.getByRole('region', { name: 'Documentos' });
    expect(within(documents).getByText('Nota fiscal de remessa')).toBeInTheDocument();
    expect(within(documents).getByText('NF-1000')).toBeInTheDocument();
    expect(within(documents).getByText('Radial')).toBeInTheDocument();
    expect(within(documents).getByText('R$ 3.500,00')).toBeInTheDocument();
    expect(within(documents).getByText('2026-07-08')).toBeInTheDocument();
    expect(within(documents).getByRole('button', { name: /abrir\/baixar/i })).toBeInTheDocument();
  });

  it('keeps the Documents block clear when remittance NF is disabled', () => {
    const detail = buildDetail({
      contract: {
        ...buildDetail().contract,
        has_remittance_invoice: false,
        remittance_invoice_number: null,
        remittance_invoice_issuer: null,
        remittance_invoice_amount: null,
        remittance_invoice_issue_date: null,
      },
    });

    render(<ContractSummary detail={detail} remittanceAttachmentSlot={<span>Anexo</span>} />);

    const documents = screen.getByRole('region', { name: 'Documentos' });
    expect(within(documents).getByText('Sem NF de remessa informada.')).toBeInTheDocument();
    expect(within(documents).queryByText('Anexo')).not.toBeInTheDocument();
  });

  it('shows closure controls and registers physical item return', () => {
    const handleStartClosure = vi.fn();
    const handleClose = vi.fn();
    const handleRegisterReturn = vi.fn();
    render(
      <ContractSummary
        detail={buildDetail()}
        onCloseContract={handleClose}
        onRegisterItemReturn={handleRegisterReturn}
        onStartClosure={handleStartClosure}
      />
    );

    const closure = screen.getByRole('region', { name: 'Encerramento' });
    fireEvent.change(within(closure).getByLabelText(/data efetiva de termino/i), {
      target: { value: '2026-08-20' },
    });
    fireEvent.click(within(closure).getByRole('button', { name: /iniciar encerramento/i }));

    expect(handleStartClosure).toHaveBeenCalledWith('2026-08-20');

    const equipment = screen.getByRole('region', { name: 'Equipamentos locados' });
    fireEvent.change(within(equipment).getByLabelText(/data de devolucao de transformador 150 kva/i), {
      target: { value: '2026-08-21' },
    });
    fireEvent.click(within(equipment).getByRole('button', { name: /registrar devolucao/i }));

    expect(handleRegisterReturn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1' }),
      '2026-08-21'
    );
  });

  it('shows returned_at and enables final closure when physical assets are returned', () => {
    const handleClose = vi.fn();
    const detail = buildDetail({
      contract: {
        ...buildDetail().contract,
        status: 'awaiting_return',
        end_date: '2026-08-20',
      },
      items: [
        {
          ...buildDetail().items[0],
          status: 'returned',
          returned_at: '2026-08-21',
        },
      ],
    });

    render(<ContractSummary detail={detail} onCloseContract={handleClose} />);

    expect(screen.getByText(/devolvido em 2026-08-21/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /finalizar locacao/i }));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('does not offer final closure before an effective end_date exists', () => {
    const detail = buildDetail({
      items: [
        {
          ...buildDetail().items[1],
          asset_id: null,
        },
      ],
    });

    render(<ContractSummary detail={detail} onCloseContract={vi.fn()} onStartClosure={vi.fn()} />);

    expect(screen.getByRole('button', { name: /finalizar locacao/i })).toBeDisabled();
  });

  it('hides closure actions for contracts already in a final status', () => {
    const detail = buildDetail({
      contract: {
        ...buildDetail().contract,
        status: 'closed',
        end_date: '2026-08-20',
      },
    });

    render(
      <ContractSummary
        detail={detail}
        onCloseContract={vi.fn()}
        onRegisterItemReturn={vi.fn()}
        onStartClosure={vi.fn()}
      />
    );

    expect(screen.queryByRole('region', { name: 'Encerramento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar devolucao/i })).not.toBeInTheDocument();
  });
});
