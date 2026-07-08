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

    let root: ReturnType<typeof hydrateRoot> | null = null;

    await act(async () => {
      root = hydrateRoot(
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

    root?.unmount();
    consoleErrorSpy.mockRestore();

    expect(hydrationMismatchFound).toBe(false);
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
    fireEvent.change(screen.getByLabelText(/início/i), {
      target: { value: '2026-07-06' },
    });
    fireEvent.change(screen.getByLabelText(/valor base/i), {
      target: { value: '150000' },
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
      target: { value: '45000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar contrato/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    expect(handleSubmit.mock.calls[0][0].items).toHaveLength(1);
  });

  it('shows a conservative conflict warning when the server changed after a local edit', async () => {
    const storageKey = createLocalDraftKey('contratos/customer-1');

    saveLocalDraft(storageKey, {
      data: {
        kind: 'rental',
        customer_id: 'customer-1',
        site_id: 'site-1',
        legacy_order_number: null,
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
        customer_id: 'customer-1',
        site_id: 'site-1',
        legacy_order_number: null,
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
          customer_id: 'customer-1',
          site_id: 'site-1',
          legacy_order_number: null,
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
    expect(screen.getByDisplayValue('180000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restaurar rascunho local/i }));

    expect(await screen.findByDisplayValue('250000')).toBeInTheDocument();
  });
});
