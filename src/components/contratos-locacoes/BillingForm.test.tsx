'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingForm } from './BillingForm';

describe('BillingForm', () => {
  it('submits a manual billing period with receipt short number and recurring line', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <BillingForm
        contractOptions={[
          {
            id: 'contract-1',
            label: '#12 • Radial Energia • Obra Centro',
          },
        ]}
        submitLabel="Emitir cobrança"
        onSubmit={handleSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/contrato/i), { target: { value: 'contract-1' } });
    fireEvent.change(screen.getByLabelText(/início do período/i), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText(/fim do período/i), { target: { value: '2026-07-30' } });
    fireEvent.change(screen.getByLabelText(/emissão/i), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText(/vencimento/i), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText(/número do documento/i), { target: { value: 'R260701001' } });
    fireEvent.change(screen.getByLabelText(/descrição da linha/i), { target: { value: 'Locação mensal gerador' } });
    fireEvent.change(screen.getByLabelText(/quantidade/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/valor unitário/i), { target: { value: 'R$ 1.500,00' } });
    expect(screen.getByLabelText(/valor unitário/i)).toHaveValue('R$ 1.500,00');

    fireEvent.click(screen.getByRole('button', { name: /emitir cobrança/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));
    expect(handleSubmit.mock.calls[0][0].items).toHaveLength(1);
  });
});
