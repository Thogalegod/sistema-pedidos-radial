import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Order } from '@/types';
import { OrderDrawer } from './OrderDrawer';
import { NewOrderDrawer } from './NewOrderDrawer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const order: Order = {
  id: 'order-a', orderNumber: 'PED-1', title: 'Pedido', client: 'Cliente',
  address: 'Rua A', priority: 'Normal', status: 'Em andamento',
  createdAt: '2026-09-24T10:00:00Z',
  tasks: [{ id: 'task-a', title: 'Última tarefa', completed: false }],
};

function drawerProps(overrides: Partial<React.ComponentProps<typeof OrderDrawer>> = {}) {
  return {
    order, isOpen: true, onClose: vi.fn(), onToggleTask: vi.fn().mockResolvedValue(true),
    onChangePriority: vi.fn(), onAddTask: vi.fn().mockResolvedValue(true),
    onDeleteTask: vi.fn(), onDeleteOrder: vi.fn(), onAddAtividade: vi.fn(),
    onDeleteAtividade: vi.fn(), onEditTaskTitle: vi.fn(),
    onSetOrderStatus: vi.fn().mockResolvedValue(true),
    ...overrides,
  } satisfies React.ComponentProps<typeof OrderDrawer>;
}

describe('explicit order and task transitions', () => {
  it('completing the last task never finalizes the order implicitly', async () => {
    const user = userEvent.setup();
    const props = drawerProps();
    render(<OrderDrawer {...props} />);

    await user.click(screen.getByRole('checkbox'));

    expect(props.onToggleTask).toHaveBeenCalledWith('order-a', 'task-a');
    expect(props.onSetOrderStatus).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before finalizing the order', async () => {
    const user = userEvent.setup();
    const onSetOrderStatus = vi.fn().mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<OrderDrawer {...drawerProps({ onSetOrderStatus })} />);

    const finalize = screen.getByRole('button', { name: 'Finalizar pedido' });
    await user.click(finalize);
    expect(onSetOrderStatus).not.toHaveBeenCalled();

    await user.click(finalize);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onSetOrderStatus).toHaveBeenCalledWith('order-a', 'Finalizado');
  });

  it('keeps a new task in the form when the command fails', async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn().mockResolvedValue(false);
    render(<OrderDrawer {...drawerProps({ onAddTask })} />);

    const input = screen.getByPlaceholderText('Nova tarefa...');
    await user.type(input, 'Não perder esta tarefa{enter}');

    expect(onAddTask).toHaveBeenCalledOnce();
    expect(input).toHaveValue('Não perder esta tarefa');
  });

  it('sends the selected member identity instead of a display label', async () => {
    const user = userEvent.setup();
    const onAddTask = vi.fn().mockResolvedValue(true);
    render(<OrderDrawer {...drawerProps({
      onAddTask,
      members: [{ userId: 'member-a', displayName: 'Pessoa QA' }],
    })} />);

    await user.type(screen.getByPlaceholderText('Nova tarefa...'), 'Tarefa identificada');
    await user.selectOptions(screen.getByTitle('Responsável'), 'member-a');
    await user.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));

    expect(onAddTask).toHaveBeenCalledWith('order-a', 'Tarefa identificada', 'member-a', undefined);
  });

  it('keeps the new-order drawer open when creation fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(false);
    render(<NewOrderDrawer isOpen onClose={onClose} onSave={onSave} />);

    await user.type(screen.getByPlaceholderText('Ex: PED-2050'), 'PED-2');
    await user.type(screen.getByPlaceholderText('Ex: Instalação de Painel Solar'), 'Projeto');
    await user.type(screen.getByPlaceholderText('Ex: Empresa Silva'), 'Cliente');
    await user.type(screen.getByPlaceholderText('Ex: Rua das Flores'), 'Rua A');
    await user.click(screen.getByRole('button', { name: /salvar pedido/i }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Ex: PED-2050')).toHaveValue('PED-2');
  });
});
