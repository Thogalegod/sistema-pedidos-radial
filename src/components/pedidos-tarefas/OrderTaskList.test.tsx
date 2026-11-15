import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { OrderTaskList } from './OrderTaskList';

const fronts = [
  { id: 'front-a', orderId: 'order-a', name: 'Obra', position: 0 },
  { id: 'front-b', orderId: 'order-a', name: 'Documentos', position: 1 },
];
const tasks = [
  taskFixture({ id: 'task-a', title: 'Vistoria', frontId: 'front-a', dueDate: '2026-09-22' }),
  taskFixture({ id: 'task-b', title: 'Contrato', frontId: 'front-b', dueDate: null }),
];
afterEach(cleanup);

describe('OrderTaskList', () => {
  it('groups by Front, opens the selected task and preselects the Front when adding', async () => {
    const onOpenTask = vi.fn();
    const onAddTaskInFront = vi.fn();
    render(<OrderTaskList tasks={tasks} fronts={fronts} groupBy="stage" today="2026-09-23"
      members={[]} onOpenTask={onOpenTask} onAddTaskInFront={onAddTaskInFront} />);
    expect(screen.getByRole('heading', { name: 'Obra' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Documentos' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir tarefa Vistoria' }));
    expect(onOpenTask).toHaveBeenCalledWith('task-a');
    await userEvent.click(screen.getByRole('button', { name: 'Nova tarefa em Documentos' }));
    expect(onAddTaskInFront).toHaveBeenCalledWith('front-b');
  });

  it('groups the same tasks by due date without losing undated tasks', () => {
    render(<OrderTaskList tasks={tasks} fronts={fronts} groupBy="due" today="2026-09-23"
      members={[]} onOpenTask={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Atrasadas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sem prazo' })).toBeInTheDocument();
    expect(screen.getByText('Vistoria')).toBeInTheDocument();
    expect(screen.getByText('Contrato')).toBeInTheDocument();
  });
});
