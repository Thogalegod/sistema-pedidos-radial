import type { DashboardTask } from '@/lib/pedidos-tarefas/dashboard';
import type { Member } from '@/lib/pedidos-tarefas/types';
import { TaskSignals } from './TaskSignals';

export function OperationalTaskCard({ item, members, today, onOpen }: {
  item: DashboardTask;
  members: Member[];
  today: string;
  onOpen: () => void;
}) {
  const context = item.order
    ? `Pedido #${item.order.number} · ${item.order.client}`
    : 'Tarefa avulsa';
  return <button type="button" onClick={onOpen}
    aria-label={`Abrir tarefa ${item.task.title}`}
    className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600">
    <span className="block text-sm font-semibold text-slate-950">{item.task.title}</span>
    <span className="mt-1 block text-xs text-slate-500">{context}</span>
    <div className="mt-2">
      <TaskSignals task={item.task} members={members} today={today}
        lastUpdate={item.lastUpdate} nextAction={null} />
    </div>
  </button>;
}
