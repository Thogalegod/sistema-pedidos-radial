import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Anexo } from '@/types';
import { OrderFiles } from './OrderFiles';

afterEach(cleanup);

const attachments: Anexo[] = [
  { id: 'file-task', pedido_id: 'order-1', frente_id: 'front-1', tarefa_id: 'task-1',
    atividade_id: 'update-1', nome_arquivo: 'vistoria.pdf', storage_path: 'org/order/file.pdf',
    tipo: 'application/pdf', criado_em: '2026-09-25T12:00:00Z' },
  { id: 'file-order', pedido_id: 'order-1', frente_id: null, tarefa_id: null,
    atividade_id: null, nome_arquivo: 'pedido.jpg', storage_path: 'org/order/file.jpg',
    tipo: 'image/jpeg', criado_em: '2026-09-25T11:00:00Z' },
];

describe('OrderFiles', () => {
  it('filters a task context and requests a signed URL only when opening the file', async () => {
    const onOpen = vi.fn().mockResolvedValue('https://signed.test/file');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<OrderFiles attachments={attachments}
      context={{ orderId: 'order-1', frontId: 'front-1', taskId: 'task-1', updateId: null }}
      onOpen={onOpen} />);

    expect(screen.getByText('vistoria.pdf')).toBeInTheDocument();
    expect(screen.queryByText('pedido.jpg')).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir arquivo vistoria.pdf' }));
    expect(onOpen).toHaveBeenCalledWith(attachments[0]);
    expect(open).toHaveBeenCalledWith('https://signed.test/file', '_blank', 'noopener,noreferrer');
  });

  it('keeps a file visible when deletion is cancelled or rejected', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDelete = vi.fn().mockResolvedValue(false);
    render(<OrderFiles attachments={[attachments[1]]}
      context={{ orderId: 'order-1', frontId: null, taskId: null, updateId: null }}
      onDelete={onDelete} />);
    const button = screen.getByRole('button', { name: 'Excluir arquivo pedido.jpg' });
    await userEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir');
    expect(screen.getByText('pedido.jpg')).toBeInTheDocument();
  });

  it('shows a thumbnail for a visible image using a temporary URL', async () => {
    const onOpen = vi.fn().mockResolvedValue('https://signed.test/photo');
    render(<OrderFiles attachments={[attachments[1]]}
      context={{ orderId: 'order-1', frontId: null, taskId: null, updateId: null }}
      onOpen={onOpen} />);
    expect(await screen.findByRole('img', { name: 'pedido.jpg' }))
      .toHaveAttribute('src', 'https://signed.test/photo');
  });
});
