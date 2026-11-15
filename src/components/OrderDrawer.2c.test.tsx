import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { OrderDrawer } from './OrderDrawer';

afterEach(cleanup);
const order: Order = { id: 'order-a', orderNumber: '1', title: 'Pedido', client: 'Cliente',
  address: 'Rua', status: 'Em andamento', priority: 'Normal', createdAt: '2026-09-25T10:00:00Z',
  tasks: [{ id: 'task-a', title: 'Vistoria', completed: false }] };

describe('Pedido with 2C task detail', () => {
  it('shows the grouped list, not the old accordion, and Escape closes only the task detail', async () => {
    const onClose = vi.fn();
    const onCloseTask = vi.fn();
    render(<OrderDrawer order={order} isOpen activeTab="tasks" onClose={onClose}
      onToggleTask={vi.fn()} onChangePriority={vi.fn()} onAddTask={vi.fn()}
      onDeleteTask={vi.fn()} onDeleteOrder={vi.fn()} onAddAtividade={vi.fn()}
      onDeleteAtividade={vi.fn()} onEditTaskTitle={vi.fn()}
      taskSection={{ orderId: 'order-a', tasks: [taskFixture({ title: 'Vistoria' })],
        subtasks: [], dependencies: [], fronts: [{ id: 'front-a', orderId: 'order-a',
          name: 'Obra', position: 0 }], commentsByTask: {}, members: [], today: '2026-09-25',
        focusedTaskId: 'task-a', canManageOrder: false, defaultAssigneeId: null,
        onFocusTask: vi.fn(), onCloseTask, onCreateTask: vi.fn().mockResolvedValue(true),
        onSaveTask: vi.fn().mockResolvedValue(true), onToggleTask: vi.fn().mockResolvedValue(true),
        onDeleteTask: vi.fn().mockResolvedValue(true), onSaveSubtask: vi.fn().mockResolvedValue(true),
        onDeleteSubtask: vi.fn().mockResolvedValue(true), onAddNote: vi.fn().mockResolvedValue(true),
        onDeleteNote: vi.fn().mockResolvedValue(true), onAddDependency: vi.fn().mockResolvedValue(true),
        onRemoveDependency: vi.fn().mockResolvedValue(true), onSaveFront: vi.fn().mockResolvedValue(true),
        onRemoveFront: vi.fn().mockResolvedValue(true), onReorderFront: vi.fn().mockResolvedValue(true) }} />);
    expect(screen.getByRole('button', { name: 'Abrir tarefa Vistoria' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Detalhe da tarefa' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Nova tarefa...')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onCloseTask).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
