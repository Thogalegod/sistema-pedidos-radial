import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { OrderTasksSection } from './OrderTasksSection';

afterEach(cleanup);
const base = { orderId: 'order-a', tasks: [], subtasks: [], commentsByTask: {}, dependencies: [],
  fronts: [], members: [{ userId: 'user-a', displayName: 'Roberto' }], today: '2026-09-23', focusedTaskId: null, canManageOrder: false,
  defaultAssigneeId: 'user-a', onFocusTask: vi.fn(), onCloseTask: vi.fn(),
  onCreateTask: vi.fn().mockResolvedValue(true), onSaveTask: vi.fn().mockResolvedValue(true),
  onToggleTask: vi.fn().mockResolvedValue(true), onDeleteTask: vi.fn().mockResolvedValue(true),
  onSaveSubtask: vi.fn().mockResolvedValue(true), onDeleteSubtask: vi.fn().mockResolvedValue(true),
  onAddNote: vi.fn().mockResolvedValue(true), onDeleteNote: vi.fn().mockResolvedValue(true),
  onAddDependency: vi.fn().mockResolvedValue(true), onRemoveDependency: vi.fn().mockResolvedValue(true),
  onSaveFront: vi.fn().mockResolvedValue(true), onRemoveFront: vi.fn().mockResolvedValue(true),
  onReorderFront: vi.fn().mockResolvedValue(true) };

describe('OrderTasksSection', () => {
  it('creates first task with a General Front via the existing RPC fallback', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(true);
    render(<OrderTasksSection {...base} onCreateTask={onCreateTask} />);
    await userEvent.type(screen.getByLabelText('Título da nova tarefa'), 'Vistoria');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-a', frontId: null, title: 'Vistoria', assigneeId: 'user-a',
    }));
  });

  it('requires choosing a Front when several exist and preserves the form on failure', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(false);
    render(<OrderTasksSection {...base} onCreateTask={onCreateTask} fronts={[
      { id: 'front-a', orderId: 'order-a', name: 'Obra', position: 0 },
      { id: 'front-b', orderId: 'order-a', name: 'Documentos', position: 1 },
    ]} tasks={[taskFixture({ frontId: 'front-a' })]} />);
    await userEvent.type(screen.getByLabelText('Título da nova tarefa'), 'Contrato');
    expect(screen.getByRole('button', { name: 'Adicionar tarefa' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Frente da nova tarefa'), 'front-b');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ frontId: 'front-b' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível criar');
    expect(screen.getByLabelText('Título da nova tarefa')).toHaveValue('Contrato');
  });

  it('requires choosing a real assignee when the creator is not resolved', async () => {
    render(<OrderTasksSection {...base} defaultAssigneeId={null} members={[]} />);
    await userEvent.type(screen.getByLabelText('Título da nova tarefa'), 'Vistoria');
    expect(screen.getByRole('button', { name: 'Adicionar tarefa' })).toBeDisabled();
  });

  it('does not show a failed task completion as successful', async () => {
    render(<OrderTasksSection {...base} tasks={[taskFixture()]}
      fronts={[{ id: 'front-a', orderId: 'order-a', name: 'Obra', position: 0 }]}
      onToggleTask={vi.fn().mockResolvedValue(false)} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Concluir tarefa Tarefa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível alterar a tarefa');
    expect(screen.getByRole('checkbox', { name: 'Concluir tarefa Tarefa' })).not.toBeChecked();
  });
});
