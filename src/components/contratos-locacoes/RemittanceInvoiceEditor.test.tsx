'use client';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contract } from '@/lib/contratos-locacoes/types';
import { RemittanceInvoiceEditor } from './RemittanceInvoiceEditor';

afterEach(() => {
  cleanup();
});

function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
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
    base_amount: '10000',
    percentage_rate: null,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
    notes: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('RemittanceInvoiceEditor', () => {
  it('enables and saves remittance metadata with the issuer derived from the contract company', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <RemittanceInvoiceEditor
        contract={buildContract()}
        hasAttachedDocument={false}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('button', { name: /editar dados da nf de remessa/i }));
    await user.selectOptions(screen.getByLabelText(/possui nf de remessa/i), 'yes');

    expect(screen.getByLabelText(/empresa emissora/i)).toHaveValue('Fontes');
    expect(screen.getByLabelText(/empresa emissora/i)).toHaveAttribute('readonly');

    await user.type(screen.getByLabelText(/número da nf/i), 'NF-900');
    await user.clear(screen.getByLabelText(/valor da nf/i));
    await user.type(screen.getByLabelText(/valor da nf/i), '900,50');
    await user.type(screen.getByLabelText(/data de emissão da nf/i), '2026-08-18');
    await user.click(screen.getByRole('button', { name: /salvar dados da nf de remessa/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        has_remittance_invoice: true,
        remittance_invoice_number: 'NF-900',
        remittance_invoice_amount: '90050',
        remittance_invoice_issue_date: '2026-08-18',
      });
    });
  });

  it('keeps metadata editable but blocks changing to no while a document is attached', async () => {
    const user = userEvent.setup();

    render(
      <RemittanceInvoiceEditor
        contract={buildContract({
          has_remittance_invoice: true,
          remittance_invoice_number: 'NF-100',
          remittance_invoice_issuer: 'Fontes',
          remittance_invoice_amount: '10000',
          remittance_invoice_issue_date: '2026-08-01',
        })}
        hasAttachedDocument
        onSave={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /editar dados da nf de remessa/i }));

    const hasInvoice = screen.getByLabelText(/possui nf de remessa/i);
    expect(hasInvoice).toBeEnabled();
    expect(within(hasInvoice).getByRole('option', { name: 'Não' })).toBeDisabled();
    expect(within(hasInvoice).getByRole('option', { name: 'Sim' })).toBeEnabled();
    expect(screen.getByLabelText(/número da nf/i)).toBeEnabled();
    expect(screen.getByLabelText(/valor da nf/i)).toBeEnabled();
    expect(screen.getByLabelText(/data de emissão da nf/i)).toBeEnabled();
    expect(screen.getByText(/existe um arquivo de nf de remessa anexado/i)).toBeInTheDocument();
  });

  it('allows disabling metadata and clears it when there is no attached document', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <RemittanceInvoiceEditor
        contract={buildContract({
          has_remittance_invoice: true,
          remittance_invoice_number: 'NF-100',
          remittance_invoice_issuer: 'Fontes',
          remittance_invoice_amount: '10000',
          remittance_invoice_issue_date: '2026-08-01',
        })}
        hasAttachedDocument={false}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('button', { name: /editar dados da nf de remessa/i }));
    await user.selectOptions(screen.getByLabelText(/possui nf de remessa/i), 'no');

    expect(screen.queryByLabelText(/número da nf/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /salvar dados da nf de remessa/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        has_remittance_invoice: false,
        remittance_invoice_number: null,
        remittance_invoice_amount: null,
        remittance_invoice_issue_date: null,
      });
    });
  });
});
