import { describe, expect, it } from 'vitest';
import { buildCentralViewHref, getCentralPendingSections, parseCentralView } from './view';
import type { CentralOperationalSnapshot } from './operational';

describe('Central pending views', () => {
  it('normalizes unknown filters to all and builds shareable URLs', () => {
    expect(parseCentralView(null)).toBe('all');
    expect(parseCentralView('overdue-billings')).toBe('overdue-billings');
    expect(parseCentralView('invented')).toBe('all');
    expect(buildCentralViewHref('all')).toBe('/hub');
    expect(buildCentralViewHref('periods-to-bill')).toBe('/hub?view=periods-to-bill');
  });

  it('groups all categories and limits the overview to four items', () => {
    const sections = getCentralPendingSections(makeSnapshot(), 'all', 4);
    expect(sections.map((section) => [section.id, section.count, section.items.length])).toEqual([
      ['overdue-tasks', 5, 4],
      ['today-tasks', 1, 1],
      ['periods-to-bill', 1, 1],
      ['overdue-billings', 1, 1],
    ]);
    expect(sections[0].showAllHref).toBe('/hub?view=overdue-tasks');
  });

  it('returns the complete selected category without duplicating other groups', () => {
    const sections = getCentralPendingSections(makeSnapshot(), 'overdue-tasks', 4);
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(5);
    expect(sections[0].showAllHref).toBeNull();
  });
});

function makeSnapshot(): CentralOperationalSnapshot {
  const overdueTasks = Array.from({ length: 5 }, (_, index) => ({
    kind: 'task_overdue' as const,
    id: `task-${index}`,
    orderId: 'order-1',
    orderNumber: '42',
    orderTitle: 'Projeto',
    customerName: 'Cliente',
    title: `Tarefa ${index}`,
    dueDate: '2026-09-20',
    href: '/?pedido=order-1',
  }));
  const todayTask = { ...overdueTasks[0], id: 'today', kind: 'task_today' as const, dueDate: '2026-09-22' };
  const period = {
    kind: 'period_to_bill' as const,
    contractId: 'contract-1', internalNumber: '1', customerName: 'Cliente',
    previousPeriodEnd: '2026-09-21', nextPeriodStart: '2026-09-22', href: '/contratos-locacoes/contratos/contract-1',
  };
  const billing = {
    kind: 'overdue_billing' as const,
    id: 'billing-1', contractId: 'contract-1', internalNumber: '1', customerName: 'Cliente',
    dueDate: '2026-09-20', balanceAmount: '10000', href: '/contratos-locacoes/contratos/contract-1',
  };
  return {
    summary: { overdueTasks: 5, tasksToday: 1, periodsToBill: 1, overdueBillings: 1 },
    priorities: [...overdueTasks, todayTask, period, billing],
    tasks: [...overdueTasks, todayTask],
    periodsToBill: [period],
    overdueBillings: [billing],
  };
}
