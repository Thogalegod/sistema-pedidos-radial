import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingPeriodForm } from './BillingPeriodForm';

afterEach(cleanup);

const initialValues = {
  period_start: '2026-09-01', period_end: '2026-09-30',
  issue_date: '2026-09-01', due_date: '2026-09-30',
  amount: '150000', notes: '', show_note_on_invoice: false,
};

describe('BillingPeriodForm invoice note visibility', () => {
  it('starts internal and disables public visibility until there is text', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BillingPeriodForm initialValues={initialValues} onCancel={vi.fn()} onSubmit={onSubmit} submitLabel="Salvar período" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Exibir esta observação na fatura' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Observação interna do período' }), 'Somente equipe');
    expect(checkbox).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Salvar período' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Somente equipe', show_note_on_invoice: false }));
  });

  it('persists explicit visibility and clears it when the note is removed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<BillingPeriodForm initialValues={{ ...initialValues, notes: 'Enviar ao cliente', show_note_on_invoice: true }} onCancel={vi.fn()} onSubmit={onSubmit} submitLabel="Salvar" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Exibir esta observação na fatura' });
    expect(checkbox).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ show_note_on_invoice: true }));

    await user.clear(screen.getByRole('textbox', { name: 'Observação interna do período' }));
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ show_note_on_invoice: false }));
  });
});
