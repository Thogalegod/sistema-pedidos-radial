import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { TaskSignals } from './TaskSignals';
afterEach(cleanup);

describe('TaskSignals', () => {
  it('separates overdue urgency, status, manual priority and who is awaited', () => {
    render(<TaskSignals task={taskFixture({ status: 'Aguardando', priority: 'Alta',
      waiting: { type: 'customer', userId: null, note: null }, dueDate: '2026-09-20' })}
      members={[]} today="2026-09-23" lastUpdate={null} nextAction={null} />);
    expect(screen.getByText('Atrasada há 3 dias')).toBeInTheDocument();
    expect(screen.getByText('Aguardando · Cliente')).toBeInTheDocument();
    expect(screen.getByText('Prioridade · Alta')).toBeInTheDocument();
    expect(screen.getByLabelText('Status da tarefa')).toHaveTextContent('Aguardando');
  });

  it('resolves real members and labels missing identity without guessing', () => {
    render(<TaskSignals task={taskFixture({ assigneeId: 'user-a', legacyAssignee: 'Thomás',
      status: 'Aguardando', waiting: { type: 'internal_user', userId: 'user-b', note: null } })}
      members={[{ userId: 'user-a', displayName: 'Roberto' },
        { userId: 'user-b', displayName: 'Katlyn' }]}
      today="2026-09-23" lastUpdate={null} nextAction={null} />);
    expect(screen.getByText('Responsável · Roberto')).toBeInTheDocument();
    expect(screen.getByText('Aguardando · Katlyn')).toBeInTheDocument();
    expect(screen.queryByText(/Thomás/)).not.toBeInTheDocument();
  });

  it('keeps follow-up, last update and next action distinct from status', () => {
    render(<TaskSignals task={taskFixture({ followUpDate: '2026-09-23', updatedAt: null })}
      members={[]} today="2026-09-23"
      lastUpdate={{ text: 'Cliente retornou', at: '2026-09-22T12:00:00Z' }}
      nextAction={{ taskId: 'task-a', reason: 'follow_up', date: '2026-09-23', label: 'Follow-up · Tarefa' }} />);
    expect(screen.getByText('Follow-up hoje')).toBeInTheDocument();
    expect(screen.getByText(/Última atualização · Cliente retornou/)).toBeInTheDocument();
    expect(screen.getByText('Próxima ação · Follow-up · Tarefa')).toBeInTheDocument();
  });

  it('uses the task change timestamp only when there is no manual update', () => {
    render(<TaskSignals task={taskFixture({ updatedAt: '2026-09-22T12:00:00Z' })}
      members={[]} today="2026-09-23" lastUpdate={null} nextAction={null} />);
    expect(screen.getByText(/Última atualização · 2026-09-22/)).toBeInTheDocument();
  });
});
