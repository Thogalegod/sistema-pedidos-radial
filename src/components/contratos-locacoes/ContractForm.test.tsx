'use client';

import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractForm } from './ContractForm';
import { createLocalDraftKey, saveLocalDraft } from '@/lib/contratos-locacoes/local-draft';

const customers = [
  {
    id: 'customer-1',
    legal_name: 'Radial Energia',
    trade_name: 'Radial',
    tax_id: null,
    active: true,
    site_count: 2,
    contact_count: 2,
    cities: ['Campinas'],
    updated_at: '2026-07-06T00:00:00.000Z',
  },
];

const customerSites = [
  {
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
    created_at: '',
    updated_at: '',
  },
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ContractForm', () => {
  it('hydrates the create contract form without mismatched rental item ids', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={vi.fn()}
      />
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const root: { current: ReturnType<typeof hydrateRoot> | null } = { current: null };

    await act(async () => {
      root.current = hydrateRoot(
        container,
        <ContractForm
          customers={customers}
          customerSites={customerSites}
          submitLabel="Salvar contrato"
          onSubmit={vi.fn()}
        />
      );
      await Promise.resolve();
    });

    const hydrationMismatchFound = consoleErrorSpy.mock.calls.some((call) =>
      call.some((value) => String(value).includes('A tree hydrated but some attributes'))
    );

    root.current?.unmount();
    consoleErrorSpy.mockRestore();

    expect(hydrationMismatchFound).toBe(false);
  });

  it('starts new contracts as rental and keeps operational fields visible only for rental', () => {
    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/tipo do contrato/i)).toHaveValue('rental');
    expect(screen.getByLabelText(/^empresa$/i)).toHaveValue('fontes');
    expect(screen.getByLabelText(/transporte/i)).toBeInTheDocument();
    expect(screen.getByText(/itens da locação/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tem nota fiscal de remessa/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/tipo do contrato/i), {
      target: { value: 'energy_management' },
    });

    expect(screen.queryByLabelText(/transporte/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tem nota fiscal de remessa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/itens da locação/i)).not.toBeInTheDocument();
  });

  it('preserves the start date after input and change events when submitting', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/cliente/i), {
      target: { value: 'customer-1' },
    });
    fireEvent.change(screen.getByLabelText(/obra\/local/i), {
      target: { value: 'site-1' },
    });

    const startDateInput = screen.getByLabelText(/início/i);
    fireEvent.input(startDateInput, {
      target: { value: '2026-07-17' },
    });
    fireEvent.change(startDateInput, {
      target: { value: '2026-07-17' },
    });
    fireEvent.blur(startDateInput);

    fireEvent.change(screen.getByLabelText(/descrição do item/i), {
      target: { value: 'Equipamento de QA' },
    });
    fireEvent.change(screen.getByLabelText(/tipo do item/i), {
      target: { value: 'Equipamento' },
    });
    fireEvent.change(screen.getByLabelText(/capacidade/i), {
      target: { value: '1 unidade' },
    });
    fireEvent.click(screen.getByRole('button', { name: /salvar contrato/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    expect(handleSubmit.mock.calls[0][0].start_date).toBe('2026-07-17');
    expect(screen.queryByText('Data de início é obrigatória')).not.toBeInTheDocument();
  });

  it('keeps requiring an empty start date', () => {
    const handleSubmit = vi.fn();

    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/cliente/i), {
      target: { value: 'customer-1' },
    });
    fireEvent.change(screen.getByLabelText(/obra\/local/i), {
      target: { value: 'site-1' },
    });
    fireEvent.change(screen.getByLabelText(/descrição do item/i), {
      target: { value: 'Equipamento de QA' },
    });
    fireEvent.change(screen.getByLabelText(/tipo do item/i), {
      target: { value: 'Equipamento' },
    });
    fireEvent.change(screen.getByLabelText(/capacidade/i), {
      target: { value: '1 unidade' },
    });
    fireEvent.click(screen.getByRole('button', { name: /salvar contrato/i }));

    expect(screen.getByText('Data de início é obrigatória')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('submits a rental contract with manual items and site contacts', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/tipo do contrato/i), {
      target: { value: 'rental' },
    });
    fireEvent.change(screen.getByLabelText(/cliente/i), {
      target: { value: 'customer-1' },
    });
    fireEvent.change(screen.getByLabelText(/obra\/local/i), {
      target: { value: 'site-1' },
    });
    fireEvent.change(screen.getByLabelText(/^empresa$/i), {
      target: { value: 'radial' },
    });
    fireEvent.change(screen.getByLabelText(/início/i), {
      target: { value: '2026-07-06' },
    });
    fireEvent.change(screen.getByLabelText(/transporte/i), {
      target: { value: 'Retira por conta do cliente' },
    });
    fireEvent.change(screen.getByLabelText(/valor base/i), {
      target: { value: 'R$ 1.500,00' },
    });
    expect(screen.getByLabelText(/valor base/i)).toHaveValue('R$ 1.500,00');
    fireEvent.change(screen.getByLabelText(/tem nota fiscal de remessa/i), {
      target: { value: 'yes' },
    });
    expect(screen.getByLabelText(/empresa emissora/i)).toHaveValue('Radial');
    expect(screen.getByLabelText(/empresa emissora/i)).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText(/número da nf/i), {
      target: { value: 'NF-1000' },
    });
    fireEvent.change(screen.getByLabelText(/valor da nf/i), {
      target: { value: 'R$ 3.500,00' },
    });
    expect(screen.getByLabelText(/valor da nf/i)).toHaveValue('R$ 3.500,00');
    fireEvent.change(screen.getByLabelText(/data de emissão da nf/i), {
      target: { value: '2026-07-05' },
    });
    fireEvent.change(screen.getByLabelText(/descrição do item/i), {
      target: { value: 'Gerador principal' },
    });
    fireEvent.change(screen.getByLabelText(/tipo do item/i), {
      target: { value: 'Gerador' },
    });
    fireEvent.change(screen.getByLabelText(/capacidade/i), {
      target: { value: '150 kVA' },
    });
    fireEvent.change(screen.getByLabelText(/valor unitário/i), {
      target: { value: 'R$ 450,00' },
    });
    expect(screen.getByLabelText(/valor unitário/i)).toHaveValue('R$ 450,00');

    fireEvent.click(screen.getByRole('button', { name: /salvar contrato/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    expect(handleSubmit.mock.calls[0][0].items).toHaveLength(1);
    expect(handleSubmit.mock.calls[0][0].contract_company).toBe('radial');
    expect(handleSubmit.mock.calls[0][0].transport_notes).toBe('Retira por conta do cliente');
    expect(handleSubmit.mock.calls[0][0].has_remittance_invoice).toBe(true);
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_number).toBe('NF-1000');
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_issuer).toBe('Radial');
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_amount).toBe('350000');
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_issue_date).toBe('2026-07-05');
    expect(handleSubmit.mock.calls[0][0].base_amount).toBe('150000');
    expect(handleSubmit.mock.calls[0][0].items[0]?.unit_amount).toBe('45000');
  });

  it('mirrors company into remittance issuer and keeps it read only for rental NF', () => {
    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/^empresa$/i), {
      target: { value: 'radial' },
    });
    fireEvent.change(screen.getByLabelText(/tem nota fiscal de remessa/i), {
      target: { value: 'yes' },
    });

    const issuerField = screen.getByLabelText(/empresa emissora/i);

    expect(issuerField).toHaveValue('Radial');
    expect(issuerField).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText(/^empresa$/i), {
      target: { value: 'fontes' },
    });

    expect(screen.getByLabelText(/empresa emissora/i)).toHaveValue('Fontes');
  });

  it('reveals remittance invoice fields only when set to yes', () => {
    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/número da nf/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/valor base/i)).toHaveValue('R$ 0,00');

    fireEvent.change(screen.getByLabelText(/tem nota fiscal de remessa/i), {
      target: { value: 'yes' },
    });

    expect(screen.getByLabelText(/número da nf/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/empresa emissora/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/valor da nf/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data de emissão da nf/i)).toBeInTheDocument();
  });

  it('clears remittance invoice fields when switched back to no', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Salvar contrato"
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/tipo do contrato/i), {
      target: { value: 'rental' },
    });
    fireEvent.change(screen.getByLabelText(/cliente/i), {
      target: { value: 'customer-1' },
    });
    fireEvent.change(screen.getByLabelText(/obra\/local/i), {
      target: { value: 'site-1' },
    });
    fireEvent.change(screen.getByLabelText(/início/i), {
      target: { value: '2026-07-06' },
    });
    fireEvent.change(screen.getByLabelText(/tem nota fiscal de remessa/i), {
      target: { value: 'yes' },
    });
    fireEvent.change(screen.getByLabelText(/número da nf/i), {
      target: { value: 'NF-1000' },
    });
    fireEvent.change(screen.getByLabelText(/empresa emissora/i), {
      target: { value: 'Radial Energia LTDA' },
    });
    fireEvent.change(screen.getByLabelText(/valor da nf/i), {
      target: { value: 'R$ 3.500,00' },
    });
    fireEvent.change(screen.getByLabelText(/data de emissão da nf/i), {
      target: { value: '2026-07-05' },
    });
    fireEvent.change(screen.getByLabelText(/tem nota fiscal de remessa/i), {
      target: { value: 'no' },
    });

    expect(screen.queryByLabelText(/número da nf/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/descrição do item/i), {
      target: { value: 'Gerador principal' },
    });
    fireEvent.change(screen.getByLabelText(/tipo do item/i), {
      target: { value: 'Gerador' },
    });
    fireEvent.change(screen.getByLabelText(/capacidade/i), {
      target: { value: '150 kVA' },
    });
    fireEvent.change(screen.getByLabelText(/valor unitário/i), {
      target: { value: 'R$ 450,00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar contrato/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    expect(handleSubmit.mock.calls[0][0].has_remittance_invoice).toBe(false);
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_number).toBeNull();
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_issuer).toBeNull();
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_amount).toBeNull();
    expect(handleSubmit.mock.calls[0][0].remittance_invoice_issue_date).toBeNull();
  });

  it('shows a conservative conflict warning when the server changed after a local edit', async () => {
    const storageKey = createLocalDraftKey('contratos/customer-1');

    saveLocalDraft(storageKey, {
      data: {
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
        start_date: '2026-07-10',
        end_date: null,
        recurrence_days: 30,
        pricing_model: 'fixed',
        base_amount: '250000',
        percentage_rate: null,
        status: 'draft',
        notes: 'Rascunho local',
        items: [
          {
            id: 'item-1',
            description: 'Gerador local',
            equipment_type: 'Gerador',
            capacity: '150 kVA',
            serial_number: null,
            internal_code: null,
            quantity: 1,
            unit_amount: '50000',
            status: 'rented',
            notes: null,
          },
        ],
      },
      baseFingerprint: {
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
        start_date: '2026-07-01',
        end_date: null,
        recurrence_days: 30,
        pricing_model: 'fixed',
        base_amount: '150000',
        percentage_rate: null,
        status: 'draft',
        notes: null,
        items: [
          {
            id: 'item-1',
            description: 'Gerador anterior',
            equipment_type: 'Gerador',
            capacity: '150 kVA',
            serial_number: null,
            internal_code: null,
            quantity: 1,
            unit_amount: '45000',
            status: 'rented',
            notes: null,
          },
        ],
      },
    });

    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        draftStorageKey={storageKey}
        initialValue={{
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
          start_date: '2026-07-06',
          end_date: null,
          recurrence_days: 30,
          pricing_model: 'fixed',
          base_amount: '180000',
          percentage_rate: null,
          status: 'draft',
          notes: null,
          items: [
            {
              id: 'item-1',
              description: 'Gerador servidor',
              equipment_type: 'Gerador',
              capacity: '150 kVA',
              serial_number: null,
              internal_code: null,
              quantity: 1,
              unit_amount: '45000',
              status: 'rented',
              notes: null,
            },
          ],
        }}
        submitLabel="Salvar contrato"
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByText(/os dados do servidor mudaram/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('R$ 1.800,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restaurar rascunho local/i }));

    expect(await screen.findByDisplayValue('R$ 2.500,00')).toBeInTheDocument();
  });
});
