import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ContractEditForm } from './ContractEditForm';
import type { ContractEditInput } from '@/lib/contratos-locacoes/contract-edit';

const customers = [{
  id: 'customer-1', legal_name: 'Cliente 1', trade_name: 'Cliente 1', tax_id: null,
  active: true, site_count: 1, contact_count: 1, cities: ['Campinas'], updated_at: '',
}, {
  id: 'customer-2', legal_name: 'Cliente 2', trade_name: 'Cliente 2', tax_id: null,
  active: true, site_count: 1, contact_count: 1, cities: ['Campinas'], updated_at: '',
}];

const sites = [{
  id: 'site-1', organization_id: 'org-1', customer_id: 'customer-1', name: 'Obra 1',
  address_line: 'Rua A', number: '1', complement: null, district: 'Centro', city: 'Campinas',
  state: 'SP', postal_code: '13000-000', notes: null, active: true, created_at: '', updated_at: '',
}];

function initialValue(legacyOrderNumber: string | null = 'PED-8'): ContractEditInput {
  return {
    contract_company: 'fontes', customer_id: 'customer-1', site_id: 'site-1',
    legacy_order_number: legacyOrderNumber, transport_notes: null, start_date: '2026-08-01', notes: null,
    items: [{
      id: 'item-1', asset_id: null, description: 'Transformador', equipment_type: 'Transformador',
      capacity: '75 kVA', serial_number: 'SER-1', internal_code: 'AT-1', quantity: 1,
      unit_amount: '300000',
    }],
  };
}

afterEach(cleanup);

describe('ContractEditForm', () => {
  it('submits string cents when only the order changes and the initial runtime value was numeric', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const runtimeValue = initialValue();
    runtimeValue.items[0].unit_amount = 300000 as unknown as string;
    render(
      <ContractEditForm
        customers={customers}
        customerSites={sites}
        hasBilling={false}
        initialValue={runtimeValue}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Nº do pedido'), { target: { value: '20260807' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      legacy_order_number: '20260807',
      items: [expect.objectContaining({ unit_amount: '300000' })],
    })));
  });

  it('shows a friendly validation message instead of raw Zod issue JSON', async () => {
    render(
      <ContractEditForm
        customers={customers}
        customerSites={sites}
        hasBilling={false}
        initialValue={initialValue()}
        onCancel={vi.fn()}
        onSubmit={() => { z.string().parse(300000); }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Revise os dados da locação.')).toBeInTheDocument();
    expect(screen.queryByText(/expected|invalid_type|\"path\"/i)).not.toBeInTheDocument();
  });

  it('preserves an operational backend message when saving fails', async () => {
    render(
      <ContractEditForm
        customers={customers}
        customerSites={sites}
        hasBilling={false}
        initialValue={initialValue()}
        onCancel={vi.fn()}
        onSubmit={() => { throw new Error('Ativo indisponível para o período.'); }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Ativo indisponível para o período.')).toBeInTheDocument();
  });

  it('allows broad structural and item editing before the first billing', () => {
    render(
      <ContractEditForm
        customers={customers}
        customerSites={sites}
        hasBilling={false}
        initialValue={initialValue()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Empresa')).toBeEnabled();
    expect(screen.getByLabelText('Cliente')).toBeEnabled();
    expect(screen.getByLabelText('Obra/local')).toBeEnabled();
    expect(screen.getByLabelText('Início')).toBeEnabled();
    expect(screen.getByLabelText('Nº do pedido')).toBeEnabled();
    expect(screen.getByLabelText('Capacidade')).toBeEnabled();
    expect(screen.getByLabelText('Código interno')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    expect(screen.getAllByLabelText('Descrição do item')).toHaveLength(2);
  });

  it('locks historical structure but keeps transport, notes and prices editable after billing', () => {
    render(
      <ContractEditForm
        customers={customers}
        customerSites={sites}
        hasBilling
        initialValue={initialValue()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Empresa')).toBeDisabled();
    expect(screen.getByLabelText('Cliente')).toBeDisabled();
    expect(screen.getByLabelText('Obra/local')).toBeDisabled();
    expect(screen.getByLabelText('Início')).toBeDisabled();
    expect(screen.getByLabelText('Nº do pedido')).toBeDisabled();
    expect(screen.getByLabelText('Descrição do item')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeDisabled();
    expect(screen.getByLabelText('Transporte')).toBeEnabled();
    expect(screen.getByLabelText('Observações')).toBeEnabled();
    expect(screen.getByLabelText('Valor unitário')).toBeEnabled();
    expect(screen.getByText('Bloqueado porque esta locação já possui cobranças emitidas.')).toBeInTheDocument();
    expect(screen.getByText('Alterações de valor afetam somente os próximos períodos.')).toBeInTheDocument();
  });

  it('lets a billed historical rental fill a missing order and saves in place', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ContractEditForm
        customers={customers}
        customerSites={sites}
        hasBilling
        initialValue={initialValue(null)}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const order = screen.getByLabelText('Nº do pedido');
    expect(order).toBeEnabled();
    fireEvent.change(order, { target: { value: 'PED-LEGADO' } });
    fireEvent.change(screen.getByLabelText('Transporte'), { target: { value: 'Novo transporte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      legacy_order_number: 'PED-LEGADO', transport_notes: 'Novo transporte',
    })));
  });
});
