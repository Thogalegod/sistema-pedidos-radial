import type { CentralOperationalSnapshot, CentralPriority } from './operational';

export type CentralView = 'all' | 'overdue-tasks' | 'today-tasks' | 'periods-to-bill' | 'overdue-billings';

export interface CentralPendingSection {
  id: Exclude<CentralView, 'all'>;
  title: string;
  count: number;
  items: CentralPriority[];
  showAllHref: string | null;
}

const VALID_VIEWS = new Set<CentralView>(['all', 'overdue-tasks', 'today-tasks', 'periods-to-bill', 'overdue-billings']);

export function parseCentralView(value: string | null): CentralView {
  return value && VALID_VIEWS.has(value as CentralView) ? value as CentralView : 'all';
}

export function buildCentralViewHref(view: CentralView) {
  return view === 'all' ? '/hub' : `/hub?view=${view}`;
}

export function getCentralPendingSections(snapshot: CentralOperationalSnapshot, view: CentralView, overviewLimit = 4): CentralPendingSection[] {
  const definitions: Array<{ id: Exclude<CentralView, 'all'>; title: string; items: CentralPriority[] }> = [
    { id: 'overdue-tasks', title: 'Tarefas atrasadas', items: snapshot.tasks.filter((task) => task.kind === 'task_overdue') },
    { id: 'today-tasks', title: 'Tarefas para hoje', items: snapshot.tasks.filter((task) => task.kind === 'task_today') },
    { id: 'periods-to-bill', title: 'Períodos a faturar', items: snapshot.periodsToBill },
    { id: 'overdue-billings', title: 'Cobranças vencidas', items: snapshot.overdueBillings },
  ];

  return definitions
    .filter((definition) => view === 'all' || definition.id === view)
    .map((definition) => {
      const count = definition.items.length;
      return {
        id: definition.id,
        title: definition.title,
        count,
        items: view === 'all' ? definition.items.slice(0, overviewLimit) : definition.items,
        showAllHref: view === 'all' && count > overviewLimit ? buildCentralViewHref(definition.id) : null,
      };
    });
}
