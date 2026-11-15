'use client';

import type { DashboardTask, TaskFilter, TaskQueues } from '@/lib/pedidos-tarefas/dashboard';
import type { Member, WaitingType } from '@/lib/pedidos-tarefas/types';
import { OperationalTaskCard } from './OperationalTaskCard';
import { QuickTaskForm, type QuickTaskDraft } from './QuickTaskForm';

const QUEUES: Array<{ key: keyof TaskQueues; title: string }> = [
  { key: 'overdue', title: 'Atrasadas' },
  { key: 'today', title: 'Para hoje' },
  { key: 'followUps', title: 'Follow-ups' },
  { key: 'waiting', title: 'Aguardando' },
];

export function OperationalDashboard({ queues, members, today, error, filter = {}, currentUserId = null,
  onFilterChange, onOpenTask, onCreateQuick }: {
  queues: TaskQueues | null;
  members: Member[];
  today: string;
  error?: string | null;
  filter?: TaskFilter;
  currentUserId?: string | null;
  onFilterChange?: (filter: TaskFilter) => void;
  onOpenTask: (taskId: string, orderId: string | null) => void;
  onCreateQuick: (input: QuickTaskDraft) => Promise<boolean>;
}) {
  return <section aria-labelledby="operational-tasks-title" className="space-y-4">
    <div>
      <h2 id="operational-tasks-title" className="text-lg font-semibold tracking-tight text-slate-950">
        Tarefas operacionais
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        A mesma tarefa pode aparecer em mais de uma fila quando exige mais de um tipo de atenção.
      </p>
    </div>
    {onFilterChange && <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <button type="button" disabled={!currentUserId}
        aria-pressed={Boolean(currentUserId && filter.assigneeId === currentUserId)}
        onClick={() => onFilterChange({ ...filter,
          assigneeId: currentUserId && filter.assigneeId !== currentUserId ? currentUserId : undefined })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
        Minhas tarefas
      </button>
      <label className="text-sm font-medium text-slate-700">Filtrar por responsável
        <select value={filter.assigneeId ?? ''}
          onChange={event => onFilterChange({ ...filter, assigneeId: event.target.value || undefined })}
          className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Todos</option>
          {members.map(member => <option key={member.userId} value={member.userId}>
            {member.displayName || `Membro sem nome · ${member.userId.slice(0, 8)}`}
          </option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Filtrar por espera
        <select value={filter.waitingType ?? ''}
          onChange={event => onFilterChange({ ...filter,
            waitingType: event.target.value ? event.target.value as WaitingType : undefined })}
          className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Todos</option><option value="customer">Cliente</option>
          <option value="utility">Concessionária</option><option value="supplier">Fornecedor</option>
          <option value="internal_user">Pessoa interna</option><option value="other">Outro</option>
        </select>
      </label>
    </div>}
    <QuickTaskForm members={members} onCreate={onCreateQuick} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {error}
    </p>}
    {!queues && !error && <p role="status" className="rounded-xl border bg-white p-6 text-sm text-slate-500">
      Carregando tarefas…
    </p>}
    {queues && <div className="grid gap-4 xl:grid-cols-2">
      {QUEUES.map(queue => <TaskQueue key={queue.key} title={queue.title}
        items={queues[queue.key]} members={members} today={today} onOpenTask={onOpenTask} />)}
    </div>}
  </section>;
}

function TaskQueue({ title, items, members, today, onOpenTask }: {
  title: string;
  items: DashboardTask[];
  members: Member[];
  today: string;
  onOpenTask: (taskId: string, orderId: string | null) => void;
}) {
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        {items.length}
      </span>
    </header>
    {items.length === 0
      ? <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhuma tarefa nesta fila.</p>
      : items.map(item => <OperationalTaskCard key={item.task.id} item={item}
        members={members} today={today}
        onOpen={() => onOpenTask(item.task.id, item.task.orderId)} />)}
  </article>;
}
