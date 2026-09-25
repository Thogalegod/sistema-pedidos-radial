import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { TaskDetailDrawer } from './TaskDetailDrawer';

afterEach(cleanup);
const task = taskFixture({ title: 'Vistoria', frontId: 'front-a' });
const fronts = [{ id: 'front-a', orderId: 'order-a', name: 'Obra', position: 0 },
  { id: 'front-b', orderId: 'order-a', name: 'Documentos', position: 1 }];
const base = { taskId: 'task-a', orderId: 'order-a', task, fronts, members: [],
  subtasks: [], comments: [], dependencies: [], orderTasks: [task], today: '2026-09-23',
  onClose: vi.fn(), onChanged: vi.fn(), onSaveTask: vi.fn().mockResolvedValue(true),
  onSaveSubtask: vi.fn().mockResolvedValue(true), onDeleteSubtask: vi.fn().mockResolvedValue(true),
  onAddNote: vi.fn().mockResolvedValue(true), onDeleteNote: vi.fn().mockResolvedValue(true),
  onToggleTask: vi.fn().mockResolvedValue(true), onAddDependency: vi.fn().mockResolvedValue(true),
  onRemoveDependency: vi.fn().mockResolvedValue(true) };

describe('TaskDetailDrawer', () => {
  it('saves a move within the Pedido without changing task identity', async () => {
    const onSaveTask = vi.fn().mockResolvedValue(true);
    render(<TaskDetailDrawer {...base} onSaveTask={onSaveTask} />);
    await userEvent.selectOptions(screen.getByLabelText('Frente da tarefa'), 'front-b');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
    await waitFor(() => expect(onSaveTask).toHaveBeenCalledWith('task-a',
      expect.objectContaining({ frontId: 'front-b', title: 'Vistoria' })));
  });

  it('keeps the editable form and shows failure when the command rejects', async () => {
    render(<TaskDetailDrawer {...base} onSaveTask={vi.fn().mockResolvedValue(false)} />);
    await userEvent.clear(screen.getByLabelText('Título da tarefa'));
    await userEvent.type(screen.getByLabelText('Título da tarefa'), 'Novo título');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
    expect(screen.getByLabelText('Título da tarefa')).toHaveValue('Novo título');
  });

  it('requires real member for internal waiting and keeps other dimensions separate', async () => {
    render(<TaskDetailDrawer {...base} members={[{ userId: 'user-a', displayName: 'Katlyn' }]} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status da tarefa' }), 'Aguardando');
    await userEvent.selectOptions(screen.getByLabelText('Aguardando de'), 'internal_user');
    expect(screen.getByLabelText('Pessoa interna aguardada')).toBeRequired();
    expect(screen.getByLabelText('Prioridade da tarefa')).toHaveValue('Normal');
  });

  it('requires explicit confirmation to complete with open subtasks and never changes the Pedido', async () => {
    const onToggleTask = vi.fn().mockResolvedValue(true);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TaskDetailDrawer {...base} onToggleTask={onToggleTask}
      subtasks={[{ id: 'sub-a', taskId: 'task-a', title: 'Medição', completed: false,
        dueDate: null, priority: null }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Concluir tarefa' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onToggleTask).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('keeps a note when deletion is cancelled and reports a rejected deletion', async () => {
    const onDeleteNote = vi.fn().mockResolvedValue(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TaskDetailDrawer {...base} onDeleteNote={onDeleteNote} comments={[{
      id: 'note-a', tarefa_id: 'task-a', texto: 'Visita feita', usuario: 'Roberto',
      criado_em: '2026-09-23T12:00:00Z',
    }]} />);
    const button = screen.getByRole('button', { name: 'Excluir nota de campo Visita feita' });
    await userEvent.click(button);
    expect(onDeleteNote).not.toHaveBeenCalled();
    expect(screen.getByText('Visita feita')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await userEvent.click(button);
    expect(onDeleteNote).toHaveBeenCalledWith('note-a');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir a nota');
  });

  it('saves subtask due date and priority without changing the main task', async () => {
    const onSaveSubtask = vi.fn().mockResolvedValue(true);
    render(<TaskDetailDrawer {...base} onSaveSubtask={onSaveSubtask} subtasks={[{
      id: 'sub-a', taskId: 'task-a', title: 'Medição', completed: false,
      dueDate: null, priority: null,
    }]} />);
    await userEvent.type(screen.getByLabelText('Prazo da subtarefa Medição'), '2026-09-30');
    await waitFor(() => expect(onSaveSubtask).toHaveBeenCalledWith({
      id: 'sub-a', taskId: 'task-a', patch: { dueDate: '2026-09-30' },
    }));
    await userEvent.selectOptions(screen.getByLabelText('Prioridade da subtarefa Medição'), 'Alta');
    await waitFor(() => expect(onSaveSubtask).toHaveBeenCalledWith({
      id: 'sub-a', taskId: 'task-a', patch: { priority: 'Alta' },
    }));
  });
});
