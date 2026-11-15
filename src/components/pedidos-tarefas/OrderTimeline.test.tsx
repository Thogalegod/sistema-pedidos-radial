import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimelineEntry } from '@/lib/pedidos-tarefas/timeline';
import { OrderTimeline } from './OrderTimeline';

afterEach(cleanup);

const entries: TimelineEntry[] = [
  { id: 'system-1', orderId: 'order-1', frontId: null, taskId: null, kind: 'system',
    text: 'Pedido finalizado', authorId: null, authorName: 'Sistema',
    at: '2026-09-25T12:00:00Z', followUpDate: null },
  { id: 'manual-1', orderId: 'order-1', frontId: 'front-1', taskId: 'task-1', kind: 'manual',
    text: 'Cliente aprovou', authorId: 'user-1', authorName: 'Ana',
    at: '2026-09-25T11:00:00Z', followUpDate: '2026-09-30' },
];

describe('OrderTimeline', () => {
  it('distinguishes system and manual entries and shows their context', () => {
    render(<OrderTimeline entries={entries}
      fronts={[{ id: 'front-1', orderId: 'order-1', name: 'Documentação', position: 0 }]}
      tasks={[{ id: 'task-1', organizationId: 'org-1', orderId: 'order-1', frontId: 'front-1',
        title: 'Enviar projeto', description: null, status: 'Aberta', priority: 'Normal',
        assigneeId: null, legacyAssignee: null, dueDate: null, followUpDate: null,
        waiting: null, updatedAt: null, completedAt: null }]} />);

    expect(screen.getAllByText('Sistema')).toHaveLength(2);
    expect(screen.getByText('Atualização manual')).toBeInTheDocument();
    expect(screen.getByText('Documentação · Enviar projeto')).toBeInTheDocument();
    expect(screen.getByText('Follow-up · 30/09/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir atualização Pedido finalizado/ })).not.toBeInTheDocument();
  });

  it('confirms deletion only for a manual entry and reports failure', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn().mockResolvedValue(false);
    render(<OrderTimeline entries={entries} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir atualização Cliente aprovou' }));
    expect(onDelete).toHaveBeenCalledWith('manual-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir');
    expect(screen.getByText('Cliente aprovou')).toBeInTheDocument();
  });

  it('shows files attached to their update, without attaching them to a sibling', () => {
    render(<OrderTimeline entries={entries} attachments={[{
      id: 'file-a', pedido_id: 'order-1', atividade_id: 'manual-1',
      nome_arquivo: 'aprovacao.pdf', storage_path: 'org/order/aprovacao.pdf',
      tipo: 'application/pdf', criado_em: '2026-09-25T11:01:00Z',
    }]} onOpenAttachment={vi.fn()} />);
    const update = screen.getByText('Cliente aprovou').closest('article');
    expect(update).toHaveTextContent('aprovacao.pdf');
    expect(screen.getByText('Pedido finalizado').closest('article')).not.toHaveTextContent('aprovacao.pdf');
  });
});
