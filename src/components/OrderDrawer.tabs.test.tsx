import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Order } from '../types';
import { orderFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { OrderDrawer } from './OrderDrawer';

afterEach(cleanup);
const order: Order = { id: 'p1', orderNumber: '1', title: 'Pedido', client: 'Cliente',
  address: 'Rua', status: 'Em andamento', priority: 'Normal', createdAt: '2026-09-25T10:00:00Z',
  tasks: [], atividades: [], anexos: [] };
const empty = { total: 0, completed: 0, percent: null, overdue: 0, today: 0,
  waiting: 0, followUps: 0, blocked: 0, readyToFinish: false };
const callbacks = { onClose: vi.fn(), onToggleTask: vi.fn(), onChangePriority: vi.fn(),
  onAddTask: vi.fn(), onDeleteTask: vi.fn(), onDeleteOrder: vi.fn(), onAddAtividade: vi.fn(),
  onDeleteAtividade: vi.fn(), onEditTaskTitle: vi.fn() };
const overview = { order: orderFixture({ id: 'p1' }), summary: empty,
  frontSummaries: [], nextAction: null, recent: null };

describe('Pedido sections', () => {
  it('uses the unified timeline and composer in Updates', () => {
    render(<OrderDrawer order={order} isOpen activeTab="updates" onTabChange={vi.fn()}
      overview={overview} {...callbacks} timelineEntries={[{
        id: 'update-1', orderId: 'p1', frontId: null, taskId: null, kind: 'manual',
        text: 'Cliente aprovou', authorId: 'user-1', authorName: 'Ana',
        at: '2026-09-25T11:00:00Z', followUpDate: null,
      }]} onSaveUpdate={vi.fn()} />);

    expect(screen.getByText('Cliente aprovou')).toBeInTheDocument();
    expect(screen.getByLabelText('Texto da atualização')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Adicionar resumo de reunião ou observação...')).not.toBeInTheDocument();
  });

  it('lets an organization member delete only manual timeline updates', async () => {
    const onDeleteAtividade = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OrderDrawer order={{ ...order, atividades: [
      { id: 'manual-1', descricao: 'Registro manual', usuario: 'Ana',
        criado_em: '2026-09-25T11:00:00Z', kind: 'manual' },
      { id: 'system-1', descricao: 'Pedido finalizado', usuario: 'Sistema',
        criado_em: '2026-09-25T10:00:00Z', kind: 'system' },
    ] }} isOpen activeTab="updates" canManageOrder={false}
      onTabChange={vi.fn()} overview={overview} {...callbacks}
      onDeleteAtividade={onDeleteAtividade} />);

    const deleteButtons = screen.getAllByTitle('Deletar registro');
    expect(deleteButtons).toHaveLength(1);
    await userEvent.click(deleteButtons[0]);
    expect(onDeleteAtividade).toHaveBeenCalledWith('p1', 'manual-1');
  });

  it('offers file deletion to a member and keeps it visible if deletion fails', async () => {
    const onDeleteAnexo = vi.fn().mockResolvedValue(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OrderDrawer order={{ ...order, anexos: [{
      id: 'file-a', pedido_id: 'p1', nome_arquivo: 'proposta.pdf',
      storage_path: 'org/p1/proposta.pdf', tipo: 'application/pdf',
      criado_em: '2026-09-25T11:00:00Z',
    }] }} isOpen activeTab="files" canManageOrder={false}
      onTabChange={vi.fn()} overview={overview} {...callbacks}
      onDeleteAnexo={onDeleteAnexo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir arquivo proposta.pdf' }));
    expect(onDeleteAnexo).toHaveBeenCalledWith('p1', 'file-a', 'org/p1/proposta.pdf');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir');
    expect(screen.getByText('proposta.pdf')).toBeInTheDocument();
  });

  it('opens in Summary and only exposes legacy content in its selected tab', async () => {
    const onTabChange = vi.fn();
    const { rerender } = render(<OrderDrawer order={order} isOpen activeTab="summary"
      onTabChange={onTabChange} overview={overview} {...callbacks} />);
    expect(screen.getByText('Progresso do Pedido')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Calendário' })).toBeEnabled();
    expect(screen.queryByText('Checklist de Tarefas')).not.toBeInTheDocument();
    expect(screen.queryByText('Documentos e Fotos')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Tarefas' }));
    expect(onTabChange).toHaveBeenCalledWith('tasks');
    rerender(<OrderDrawer order={order} isOpen activeTab="tasks"
      onTabChange={onTabChange} overview={overview} {...callbacks} />);
    expect(screen.getByText('Checklist de Tarefas')).toBeInTheDocument();
    expect(screen.queryByText('Progresso do Pedido')).not.toBeInTheDocument();
  });

  it('shows an error instead of stale order content on failed detail load', () => {
    render(<OrderDrawer order={null} isOpen activeTab="summary" onTabChange={vi.fn()}
      overview={null} detailError="Pedido indisponível" {...callbacks} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Pedido indisponível');
    expect(screen.queryByText('Pedido')).not.toBeInTheDocument();
  });

  it('focuses the drawer close control and closes with Escape', async () => {
    const onClose = vi.fn();
    render(<OrderDrawer order={order} isOpen activeTab="summary" onTabChange={vi.fn()}
      overview={overview} {...callbacks} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Fechar Pedido' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('moves focus into the drawer after an asynchronous detail load', () => {
    const { rerender } = render(<OrderDrawer order={null} isOpen activeTab="summary"
      onTabChange={vi.fn()} overview={null} {...callbacks} />);
    rerender(<OrderDrawer order={order} isOpen activeTab="summary"
      onTabChange={vi.fn()} overview={overview} {...callbacks} />);
    expect(screen.getByRole('button', { name: 'Fechar Pedido' })).toHaveFocus();
  });
});
