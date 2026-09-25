import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingEmailModal } from './BillingEmailModal';
import type { BillingSendClient } from '@/lib/contratos-locacoes/billing-send-client';

afterEach(cleanup);

function makeClient(): BillingSendClient {
  return {
    prepare: vi.fn().mockResolvedValue({
      contacts: [
        { id: '1', name: 'Financeiro', email: 'financeiro@cliente.com', receives_billing: true },
        { id: '2', name: 'Compras', email: 'compras@cliente.com', receives_billing: false },
      ],
      defaultRecipients: ['financeiro@cliente.com'],
      allowedRecipients: ['financeiro@cliente.com', 'extra@cliente.com'],
      mode: 'restricted',
      hasBoleto: true,
      invoiceFileName: 'fatura.pdf',
      boletoFileName: 'boleto.pdf',
    }),
    send: vi.fn().mockResolvedValue({ status: 'sent' }),
  } as unknown as BillingSendClient;
}

describe('BillingEmailModal', () => {
  it('shows homologation, approved defaults and the two attachments', async () => {
    render(<BillingEmailModal billingId="billing-1" client={makeClient()} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByText(/ambiente de homologação/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /financeiro/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /compras/i })).toBeDisabled();
    expect(screen.getByText('fatura.pdf')).toBeInTheDocument();
    expect(screen.getByText('boleto.pdf')).toBeInTheDocument();
  });

  it('deduplicates extras, includes the message and sends once on double click', async () => {
    const client = makeClient();
    render(<BillingEmailModal billingId="billing-1" client={client} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/ambiente de homologação/i);

    fireEvent.change(screen.getByLabelText(/destinatário adicional/i), { target: { value: ' EXTRA@CLIENTE.COM ' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar destinatário/i }));
    fireEvent.change(screen.getByLabelText(/mensagem adicional/i), { target: { value: 'Mensagem do financeiro' } });
    const send = screen.getByRole('button', { name: /^enviar cobrança$/i });
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(client.send).toHaveBeenCalledTimes(1));
    expect(client.send).toHaveBeenCalledWith('billing-1', expect.objectContaining({
      recipients: ['extra@cliente.com', 'financeiro@cliente.com'],
      additional_message: 'Mensagem do financeiro',
    }));
  });

  it('keeps the same intent and choices after a failure so retry is deliberate', async () => {
    const client = makeClient();
    vi.mocked(client.send).mockRejectedValueOnce(new Error('Falha temporária')).mockResolvedValueOnce({ status: 'sent' } as never);
    render(<BillingEmailModal billingId="billing-1" client={client} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByText(/ambiente de homologação/i);
    fireEvent.change(screen.getByLabelText(/mensagem adicional/i), { target: { value: 'Manter isto' } });

    fireEvent.click(screen.getByRole('button', { name: /^enviar cobrança$/i }));
    expect(await screen.findByText('Falha temporária')).toBeInTheDocument();
    const firstIntent = vi.mocked(client.send).mock.calls[0][1];
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    await waitFor(() => expect(client.send).toHaveBeenCalledTimes(2));

    expect(vi.mocked(client.send).mock.calls[1][1]).toEqual(firstIntent);
    expect(screen.getByLabelText(/mensagem adicional/i)).toHaveValue('Manter isto');
  });

  it('requires at least one recipient', async () => {
    const client = makeClient();
    render(<BillingEmailModal billingId="billing-1" client={client} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const checkbox = await screen.findByRole('checkbox', { name: /financeiro/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /^enviar cobrança$/i }));

    expect(await screen.findByText(/selecione ao menos um destinatário/i)).toBeInTheDocument();
    expect(client.send).not.toHaveBeenCalled();
  });
});
