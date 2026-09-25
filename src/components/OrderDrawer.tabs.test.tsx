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

  it('opens in Summary and only exposes legacy content in its selected tab', async () => {
    const onTabChange = vi.fn();
    const { rerender } = render(<OrderDrawer order={order} isOpen activeTab="summary"
      onTabChange={onTabChange} overview={overview} {...callbacks} />);
    expect(screen.getByText('Progresso do Pedido')).toBeInTheDocument();
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
