import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import type { DashboardTask, TaskQueues } from '@/lib/pedidos-tarefas/dashboard';
import { OperationalDashboard } from './OperationalDashboard';

afterEach(cleanup);

const members = [{ userId: 'user-1', displayName: 'Roberto' }];
const standalone: DashboardTask = {
  task: taskFixture({ id: 'quick-1', orderId: null, frontId: null, title: 'Retornar cliente',
    status: 'Aguardando', priority: 'Alta', assigneeId: 'user-1', dueDate: '2026-09-20',
    followUpDate: '2026-09-23', waiting: { type: 'customer', userId: null, note: null },
    updatedAt: null }),
  order: null,
  lastUpdate: null,
};
const queues: TaskQueues = {
  overdue: [standalone], today: [], followUps: [standalone], waiting: [standalone],
};

describe('OperationalDashboard', () => {
  it('shows overlapping queues, standalone context and all operational dimensions', async () => {
    const onOpenTask = vi.fn();
    render(<OperationalDashboard queues={queues} members={members} today="2026-09-23"
      onOpenTask={onOpenTask} onCreateQuick={vi.fn().mockResolvedValue(true)} />);

    expect(screen.getAllByText('Retornar cliente')).toHaveLength(3);
    expect(screen.getAllByText('Tarefa avulsa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Atrasada há 3 dias').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aguardando · Cliente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prioridade · Alta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Responsável · Roberto').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Follow-up hoje').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Última atualização · Não registrada').length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Abrir tarefa Retornar cliente' })[0]);
    expect(onOpenTask).toHaveBeenCalledWith('quick-1', null);
  });

  it('creates a quick task only with title and an explicit real member', async () => {
    const onCreateQuick = vi.fn().mockResolvedValue(true);
    render(<OperationalDashboard queues={{ overdue: [], today: [], followUps: [], waiting: [] }}
      members={members} today="2026-09-23" onOpenTask={vi.fn()}
      onCreateQuick={onCreateQuick} />);

    await userEvent.type(screen.getByLabelText('Título da tarefa rápida'), 'Confirmar entrega');
    await userEvent.selectOptions(screen.getByLabelText('Responsável da tarefa rápida'), 'user-1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar tarefa rápida' }));

    await waitFor(() => expect(onCreateQuick).toHaveBeenCalledWith({
      title: 'Confirmar entrega', assigneeId: 'user-1',
    }));
    expect(screen.getByLabelText('Título da tarefa rápida')).toHaveValue('');
  });

  it('shows query failure without claiming that work is up to date', () => {
    render(<OperationalDashboard queues={null} members={members} today="2026-09-23"
      error="Não foi possível carregar as tarefas" onOpenTask={vi.fn()}
      onCreateQuick={vi.fn().mockResolvedValue(true)} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as tarefas');
    expect(screen.queryByText(/Nenhuma tarefa pendente|Tudo em dia/)).not.toBeInTheDocument();
  });

  it('applies Minhas and waiting filters without losing the other dimension', async () => {
    const onFilterChange = vi.fn();
    render(<OperationalDashboard queues={queues} members={members} today="2026-09-23"
      currentUserId="user-1" filter={{ waitingType: 'customer' }}
      onFilterChange={onFilterChange} onOpenTask={vi.fn()}
      onCreateQuick={vi.fn().mockResolvedValue(true)} />);

    await userEvent.click(screen.getByRole('button', { name: 'Minhas tarefas' }));
    expect(onFilterChange).toHaveBeenCalledWith({ assigneeId: 'user-1', waitingType: 'customer' });
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por espera'), 'supplier');
    expect(onFilterChange).toHaveBeenCalledWith({ waitingType: 'supplier' });
  });
});
