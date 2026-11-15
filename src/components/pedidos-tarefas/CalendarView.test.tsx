import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEntry } from '@/lib/pedidos-tarefas/calendar';
import { CalendarView } from './CalendarView';

const mocks = vi.hoisted(() => ({
  getCurrentOrganizationId: vi.fn(),
  loadCalendar: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { marker: 'authenticated-client' } }));
vi.mock('@/lib/pedidos-tarefas/organization', () => ({
  getCurrentOrganizationId: mocks.getCurrentOrganizationId,
}));
vi.mock('@/lib/pedidos-tarefas/calendar-queries', () => ({ loadCalendar: mocks.loadCalendar }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const entries: CalendarEntry[] = [
  { key: 'task_due:t1', kind: 'task_due', sourceId: 't1', taskId: 't1', orderId: 'p1',
    date: '2026-09-02', time: null, title: 'Prazo da tarefa', completed: false, href: '/?pedido=p1&tarefa=t1' },
  { key: 'subtask_due:s1', kind: 'subtask_due', sourceId: 's1', taskId: 't1', orderId: 'p1',
    date: '2026-09-03', time: null, title: 'Prazo da subtarefa', completed: false, href: '/?pedido=p1&tarefa=t1' },
  { key: 'follow_up:t2', kind: 'follow_up', sourceId: 't2', taskId: 't2', orderId: null,
    date: '2026-09-04', time: null, title: 'Follow-up', completed: false, href: '/?tarefa=t2' },
  ...(['meeting', 'visit', 'external_service', 'other'] as const).map((kind, index) => ({
    key: `${kind}:e${index}`, kind, sourceId: `e${index}`, taskId: null, orderId: index === 0 ? 'p1' : null,
    date: `2026-09-0${index + 5}` as CalendarEntry['date'], time: '09:00',
    title: `Evento ${index + 1}`, completed: false, href: `/calendario?evento=e${index}`,
  })),
];

describe('CalendarView', () => {
  it('lists all seven projected kinds and opens the real source instead of editing a projection', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('org-a');
    mocks.loadCalendar.mockResolvedValue(entries);
    const onOpenEntry = vi.fn();

    render(<CalendarView scope={{ from: '2026-09-01', to: '2026-09-30' }} onOpenEntry={onOpenEntry} />);

    expect(await screen.findByRole('button', { name: /Prazo da tarefa/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prazo da subtarefa/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Follow-up/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Evento \d/ })).toHaveLength(4);

    await userEvent.click(screen.getByRole('button', { name: /Prazo da tarefa/ }));
    expect(onOpenEntry).toHaveBeenCalledWith(entries[0]);
    expect(mocks.loadCalendar).toHaveBeenCalledWith(
      { marker: 'authenticated-client' }, 'org-a', { from: '2026-09-01', to: '2026-09-30' });
  });

  it('applies only the Pedido scope, advances the month, and renders an accessible empty state', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('org-a');
    mocks.loadCalendar.mockResolvedValue([]);

    render(<CalendarView scope={{ orderId: 'p1', from: '2026-09-01', to: '2026-09-30' }}
      onOpenEntry={vi.fn()} />);

    expect(await screen.findByText('Nenhum item neste mês.')).toBeInTheDocument();
    expect(mocks.loadCalendar).toHaveBeenLastCalledWith(
      { marker: 'authenticated-client' }, 'org-a',
      { orderId: 'p1', from: '2026-09-01', to: '2026-09-30' });

    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await waitFor(() => expect(mocks.loadCalendar).toHaveBeenLastCalledWith(
      { marker: 'authenticated-client' }, 'org-a',
      { orderId: 'p1', from: '2026-10-01', to: '2026-10-31' }));
  });
});
