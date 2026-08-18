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
  it('keeps the billing period amount freely editable while focused', async () => {
    const user = userEvent.setup();

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
    await user.clear(amount);
    await user.type(amount, '900');

    expect(amount).toHaveValue('900');
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
