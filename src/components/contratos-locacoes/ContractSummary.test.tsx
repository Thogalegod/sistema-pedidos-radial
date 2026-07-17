'use client';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContractSummary } from './ContractSummary';

afterEach(() => {
  cleanup();
});

describe('ContractSummary', () => {
  it('shows transport and remittance invoice details when the contract has NF data', () => {
    render(
      <ContractSummary
        remittanceAttachmentSlot={
          <div>
            <span>Anexo da NF de remessa</span>
            <button type="button">Anexar NF</button>
          </div>
        }
        detail={{
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
            base_amount: '150000',
            percentage_rate: null,
            status: 'active',
            pause_started_at: null,
            pause_reason: null,
            notes: null,
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
          items: [],
        } as any}
      />
    );

    expect(screen.getByText(/logística e documentação/i)).toBeInTheDocument();
    expect(screen.getByText(/^empresa$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^radial$/i)).toHaveLength(2);
    expect(screen.getByText(/nota fiscal de remessa/i)).toBeInTheDocument();
    expect(screen.getByText(/^sim$/i)).toBeInTheDocument();
    expect(screen.getByText(/radial entrega com caminhão próprio/i)).toBeInTheDocument();
    expect(screen.getByText('NF-1000')).toBeInTheDocument();
    expect(screen.getAllByText(/^radial$/i)).toHaveLength(2);
    expect(screen.getByText('R$ 3.500,00')).toBeInTheDocument();
    expect(screen.getByText('2026-07-08')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument();
    expect(screen.getByText(/anexo da nf de remessa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /anexar nf/i })).toBeInTheDocument();
  });

  it('does not render the attachment area when remittance NF is disabled', () => {
    render(
      <ContractSummary
        remittanceAttachmentSlot={
          <div>
            <span>Anexo da NF de remessa</span>
          </div>
        }
        detail={{
          contract: {
            id: 'contract-3',
            organization_id: 'org-1',
            internal_number: '125',
            kind: 'rental',
            contract_company: 'fontes',
            customer_id: 'customer-1',
            site_id: 'site-1',
            legacy_order_number: null,
            transport_notes: 'Sem NF nesta locação',
            has_remittance_invoice: false,
            remittance_invoice_number: null,
            remittance_invoice_issuer: null,
            remittance_invoice_amount: null,
            remittance_invoice_issue_date: null,
            start_date: '2026-07-06',
            end_date: null,
            recurrence_days: 30,
            pricing_model: 'fixed',
            base_amount: '150000',
            percentage_rate: null,
            status: 'draft',
            pause_started_at: null,
            pause_reason: null,
            notes: null,
            created_at: '2026-07-06T00:00:00.000Z',
            updated_at: '2026-07-06T00:00:00.000Z',
          },
          customer: null,
          site: null,
          items: [],
        } as any}
      />
    );

    expect(screen.queryByText(/anexo da nf de remessa/i)).not.toBeInTheDocument();
  });

  it('hides logistics details for non-rental contracts', () => {
    render(
      <ContractSummary
        detail={{
          contract: {
            id: 'contract-2',
            organization_id: 'org-1',
            internal_number: '124',
            kind: 'energy_management',
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
            base_amount: '150000',
            percentage_rate: null,
            status: 'draft',
            pause_started_at: null,
            pause_reason: null,
            notes: null,
            created_at: '2026-07-06T00:00:00.000Z',
            updated_at: '2026-07-06T00:00:00.000Z',
          },
          customer: null,
          site: null,
          items: [],
        } as any}
      />
    );

    expect(screen.queryByText(/logística e documentação/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nota fiscal de remessa/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^empresa$/i)).toBeInTheDocument();
    expect(screen.getByText(/^fontes$/i)).toBeInTheDocument();
  });
});
