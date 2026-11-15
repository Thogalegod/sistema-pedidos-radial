import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateComposer } from './UpdateComposer';

afterEach(cleanup);

describe('UpdateComposer', () => {
  it('persists the update before its files and retries upload without duplicating text', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true, value: 'update-1' });
    const onUpload = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onSaved = vi.fn();
    render(<UpdateComposer context={{ orderId: 'order-1', frontId: 'front-1', taskId: 'task-1' }}
      onSave={onSave} onUpload={onUpload} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('Texto da atualização'), 'Cliente aprovou');
    await userEvent.type(screen.getByLabelText('Follow-up da atualização'), '2026-09-30');
    await userEvent.upload(screen.getByLabelText('Arquivos da atualização'),
      new File(['pdf'], 'aprovacao.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar atualização' }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(
      { orderId: 'order-1', frontId: 'front-1', taskId: 'task-1', updateId: 'update-1' },
      [expect.objectContaining({ caption: '', file: expect.objectContaining({ name: 'aprovacao.pdf' }) })]));
    expect(onSave).toHaveBeenCalledWith({ orderId: 'order-1', frontId: 'front-1', taskId: 'task-1',
      text: 'Cliente aprovou', followUpDate: '2026-09-30' });
    expect(screen.getByRole('alert')).toHaveTextContent('A atualização foi salva');
    expect(onSaved).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Reenviar arquivos' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledOnce();
    expect(onUpload).toHaveBeenCalledTimes(2);
  });

  it('does not offer upload for a standalone task', () => {
    render(<UpdateComposer context={{ orderId: null, frontId: null, taskId: 'task-1' }}
      onSave={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText('Arquivos da atualização')).not.toBeInTheDocument();
  });
});
