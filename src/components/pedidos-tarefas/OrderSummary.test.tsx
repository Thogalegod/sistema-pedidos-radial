import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { orderFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { OrderSummary } from './OrderSummary';
import { OrderTabs } from './OrderTabs';

afterEach(cleanup);

const empty = { total: 0, completed: 0, percent: null, overdue: 0, today: 0,
  waiting: 0, followUps: 0, blocked: 0, readyToFinish: false };

describe('Pedido overview', () => {
  it('shows honest empty progress and no invented next action', () => {
    render(<OrderSummary order={orderFixture()} summary={empty} frontSummaries={[]}
      nextAction={null} recent={null} onOpenTask={vi.fn()} />);
    expect(screen.getByText('Nenhuma tarefa neste Pedido.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma próxima ação com prazo definida.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma atualização registrada.')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('shows front progress, signals, recent update and opens the next task', async () => {
    const onOpenTask = vi.fn();
    const summary = { ...empty, total: 3, completed: 1, percent: 33, overdue: 1,
      waiting: 1, followUps: 1, blocked: 1 };
    render(<OrderSummary order={orderFixture()} summary={summary}
      frontSummaries={[{ front: { id: 'f1', orderId: 'order-a', name: 'Geral', position: 0 }, summary }]}
      nextAction={{ taskId: 't1', reason: 'overdue', date: '2026-09-24', label: 'Atrasada · Conferir' }}
      recent={{ text: 'Visita concluída', at: '2026-09-25T10:00:00Z', author: 'Ana' }}
      onOpenTask={onOpenTask} />);
    expect(screen.getAllByText('33%').length).toBeGreaterThan(0);
    expect(screen.getByText('Geral')).toBeInTheDocument();
    expect(screen.getByText('Visita concluída')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Atrasada · Conferir/ }));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('offers legacy sections but keeps Calendar disabled', async () => {
    const onChange = vi.fn();
    render(<OrderTabs active="summary" onChange={onChange} calendarEnabled={false} />);
    expect(screen.getByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Calendário' })).toBeDisabled();
    await userEvent.click(screen.getByRole('tab', { name: 'Arquivos' }));
    expect(onChange).toHaveBeenCalledWith('files');
  });
});
