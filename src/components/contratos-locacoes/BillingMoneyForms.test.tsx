'use client';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingPaymentForm } from './BillingPaymentForm';
import { BillingPeriodForm } from './BillingPeriodForm';

afterEach(() => {
  cleanup();
});

describe('billing money fields', () => {
  it('keeps the billing period amount read-only because it is derived from rental items', () => {
    render(
      <BillingPeriodForm
        initialValues={{
          period_start: '2026-08-01',
          period_end: '2026-08-31',
          issue_date: '2026-08-01',
          due_date: '2026-08-10',
          amount: '100',
          notes: null,
        }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        submitLabel="Salvar"
      />
    );

    const amount = screen.getByLabelText(/^valor$/i);
    expect(amount).toBeDisabled();
    expect(amount).toHaveValue('R$ 1,00');
    expect(screen.getByText(/para alterar o valor da locação, edite os valores dos equipamentos/i)).toBeInTheDocument();
  });

  it('keeps the received amount freely editable while focused', async () => {
    const user = userEvent.setup();

    render(
      <BillingPaymentForm
        initialAmount="100"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const amount = screen.getByLabelText(/valor recebido/i);
    await user.clear(amount);
    await user.type(amount, '900,50');

    expect(amount).toHaveValue('900,50');
  });
});
