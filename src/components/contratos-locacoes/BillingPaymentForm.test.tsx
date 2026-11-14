'use client';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPaymentForm } from './BillingPaymentForm';
import { PaymentNotSavedError } from '@/lib/contratos-locacoes/payment-errors';

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('receipt confirmation recovery', () => {
  it('preserves the same immutable operation after a connection error and remount', async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    const props = { requestKey: 'owner:bill', initialAmount: '10000', onCancel: vi.fn(), onSubmit: submit };
    const first = render(<BillingPaymentForm {...props} />);
    await user.click(screen.getByRole('button', { name: 'Registrar recebimento' }));
    await screen.findByText(/não foi possível confirmar/i);
    const operation = submit.mock.calls[0][0];
    expect(operation.operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByLabelText('Valor recebido')).toBeDisabled();
    first.unmount();
    render(<BillingPaymentForm {...props} initialAmount="99999" />);
    expect(screen.getByLabelText('Valor recebido')).toHaveValue('R$ 100,00');
    await user.click(screen.getByRole('button', { name: 'Confirmar recebimento pendente' }));
    expect(submit.mock.calls[1][0]).toEqual(operation);
    await waitFor(() => expect(sessionStorage.length).toBe(0));
  });
  it('ignores repeated submit events while a request is in flight', async () => {
    let resolve!: () => void;
    const submit = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const view = render(<BillingPaymentForm requestKey="owner:bill" initialAmount="100" onCancel={vi.fn()} onSubmit={submit} />);
    const form = view.container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled();
    await act(async () => resolve());
  });
  it('allows correction only after explicit server rejection', async () => {
    const submit = vi.fn().mockRejectedValue(new PaymentNotSavedError('Valor acima do saldo'));
    render(<BillingPaymentForm requestKey="owner:bill" initialAmount="100" onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recebimento' }));
    await screen.findByText('Valor acima do saldo');
    expect(screen.getByLabelText('Valor recebido')).toBeEnabled();
    expect(sessionStorage.length).toBe(0);
  });
  it('does not send when it cannot preserve a retry key', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    const submit = vi.fn();
    render(<BillingPaymentForm requestKey="owner:bill" initialAmount="100" onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recebimento' }));
    await screen.findByText(/não foi possível confirmar/i);
    expect(submit).not.toHaveBeenCalled();
  });
  it('isolates pending operations between accounts and billings', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('network'));
    const first = render(<BillingPaymentForm requestKey="owner:bill" initialAmount="100" onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recebimento' }));
    await screen.findByText(/não foi possível confirmar/i);
    first.unmount();
    render(<BillingPaymentForm requestKey="other:bill" initialAmount="200" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Valor recebido')).toBeEnabled();
    expect(screen.getByLabelText('Valor recebido')).toHaveValue('R$ 2,00');
  });
});
