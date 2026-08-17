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

function findMonthlyTotalSummary(amount: string) {
  return Array.from(document.querySelectorAll('p')).find((element) =>
    element.textContent?.includes(`Valor mensal total: ${amount}`)
  );
}

describe('ContractForm', () => {
  it('hydrates the create contract form without mismatched rental item ids', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Criar locação"
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
          submitLabel="Criar locação"
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

  it('hides the removed technical item fields and offers the customer creation shortcut', () => {
    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Criar locação"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/tipo do contrato/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status inicial/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^fim$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/recorrência/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/modelo de preço/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/valor mensal padrão/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/capacidade/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/código interno/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /novo cliente/i })).toHaveAttribute(
      'href',
      '/contratos-locacoes/clientes/novo?returnTo=/contratos-locacoes/contratos/novo'
    );
    expect(findMonthlyTotalSummary('R$ 0,00')).toBeTruthy();
  });

  it('derives the total from rental items and submits it as base_amount', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ContractForm
        customers={customers}
        customerSites={customerSites}
        submitLabel="Criar locação"
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/cliente/i), {
      target: { value: 'customer-1' },
    });
    fireEvent.change(screen.getByLabelText(/obra\/local/i), {
      target: { value: 'site-1' },
    });
    fireEvent.change(screen.getByLabelText(/início/i), {
      target: { value: '2026-07-06' },
    });

    fireEvent.change(screen.getByLabelText(/descrição do item/i), {
      target: { value: 'Gerador principal' },
    });
    fireEvent.change(screen.getByLabelText(/tipo do item/i), {
      target: { value: 'Gerador' },
    });
    fireEvent.change(screen.getByLabelText(/quantidade/i), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText(/valor unitário/i), {
      target: { value: 'R$ 1.000,00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

    const itemDescriptions = screen.getAllByLabelText(/descrição do item/i);
    const itemTypes = screen.getAllByLabelText(/tipo do item/i);
    const itemQuantities = screen.getAllByLabelText(/quantidade/i);
    const itemAmounts = screen.getAllByLabelText(/valor unitário/i);

    fireEvent.change(itemDescriptions[1], {
      target: { value: 'Bateria auxiliar' },
    });
    fireEvent.change(itemTypes[1], {
      target: { value: 'Bateria' },
    });
    fireEvent.change(itemQuantities[1], {
      target: { value: '1' },
    });
    fireEvent.change(itemAmounts[1], {
      target: { value: 'R$ 800,00' },
    });

    expect(findMonthlyTotalSummary('R$ 2.800,00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /criar locação/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    expect(handleSubmit.mock.calls[0][0].base_amount).toBe('280000');
    expect(handleSubmit.mock.calls[0][0].items[0]?.capacity).toBeNull();
    expect(handleSubmit.mock.calls[0][0].items[0]?.internal_code).toBeNull();
    expect(handleSubmit.mock.calls[0][0].items[1]?.capacity).toBeNull();
    expect(handleSubmit.mock.calls[0][0].items[1]?.internal_code).toBeNull();
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

  it('reveals and clears remittance invoice fields as expected', async () => {
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
    fireEvent.change(screen.getByLabelText(/início/i), {
      target: { value: '2026-07-06' },
    });
    fireEvent.change(screen.getByLabelText(/descrição do item/i), {
      target: { value: 'Gerador principal' },
    });
    fireEvent.change(screen.getByLabelText(/tipo do item/i), {
      target: { value: 'Gerador' },
    });
    fireEvent.change(screen.getByLabelText(/valor unitário/i), {
      target: { value: 'R$ 350,00' },
    });

    expect(screen.queryByLabelText(/número da nf/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/tem nota fiscal de remessa/i), {
      target: { value: 'yes' },
    });

    expect(screen.getByLabelText(/número da nf/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/empresa emissora/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/valor da nf/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data de emissão da nf/i)).toBeInTheDocument();

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
            capacity: null,
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
            capacity: null,
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
              asset_id: null,
              description: 'Gerador servidor',
              equipment_type: 'Gerador',
              capacity: null,
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
    expect(screen.getByRole('button', { name: /restaurar rascunho local/i })).toBeInTheDocument();
  });
});
