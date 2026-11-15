import type { Member, Front, TaskV1 } from '@/lib/pedidos-tarefas/types';
import type { ComentarioTarefa } from '@/types';
import { chooseNextAction } from '@/lib/pedidos-tarefas/indicators';
import { getTaskDueStatus } from '@/lib/pedidos-tarefas/task-due';
import { TaskSignals } from './TaskSignals';

function lastManualUpdate(comments: ComentarioTarefa[] | undefined) {
  const note = comments?.reduce<ComentarioTarefa | null>((latest, candidate) =>
    !latest || candidate.criado_em > latest.criado_em ? candidate : latest, null);
  return note ? { text: note.texto, at: note.criado_em } : null;
}

export function OrderTaskList({ tasks, fronts, groupBy, today, members, commentsByTask = {}, onOpenTask,
  onAddTaskInFront, onToggleTask, busyTaskId = null }: { tasks: TaskV1[]; fronts: Front[];
  groupBy: 'stage' | 'due'; today: string; members: Member[];
  commentsByTask?: Record<string, ComentarioTarefa[]>;
  onOpenTask: (taskId: string) => void; onAddTaskInFront?: (frontId: string) => void;
  onToggleTask?: (taskId: string) => void; busyTaskId?: string | null }) {
  const orderedFronts = [...fronts].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const groups = groupBy === 'stage'
    ? orderedFronts.map(front => ({ key: front.id, name: front.name,
      items: tasks.filter(task => task.frontId === front.id), frontId: front.id }))
    : ([
      { key: 'overdue', name: 'Atrasadas' }, { key: 'today', name: 'Hoje' },
      { key: 'upcoming', name: 'Próximos prazos' }, { key: 'undated', name: 'Sem prazo' },
      { key: 'completed', name: 'Concluídas' },
    ] as const).map(group => ({ ...group,
      items: tasks.filter(task => getTaskDueStatus({ completed: task.status === 'Concluída',
        dueDate: task.dueDate }, today) === group.key), frontId: null }));

  return <section aria-label="Tarefas do Pedido" className="space-y-4">
    {tasks.length === 0 && <p className="text-sm text-slate-500">Nenhuma tarefa neste Pedido.</p>}
    {groups.map(group => <section key={group.key} className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h4 className="font-semibold text-slate-800">{group.name}</h4>
          <span className="text-xs text-slate-500">{group.items.length}</span></div>
        {group.frontId && onAddTaskInFront && <button type="button"
          onClick={() => onAddTaskInFront(group.frontId!)}
          aria-label={`Nova tarefa em ${group.name}`}
          className="text-xs font-semibold text-blue-700 hover:underline">+ Nova tarefa</button>}
      </div>
      {group.items.length === 0 && <p className="text-xs text-slate-500">Sem tarefas.</p>}
      {group.items.map(task => <div key={task.id} id={`task-${task.id}`}
        className="flex items-start gap-2 rounded-md border border-slate-100 bg-white p-2">
        {onToggleTask && <input type="checkbox" checked={task.status === 'Concluída'}
          disabled={busyTaskId !== null}
          onChange={() => onToggleTask(task.id)} aria-label={`${task.status === 'Concluída' ? 'Reabrir' : 'Concluir'} tarefa ${task.title}`}
          className="mt-1" />}
        <div className="min-w-0 flex-1 space-y-1">
          <button type="button" onClick={() => onOpenTask(task.id)}
            aria-label={`Abrir tarefa ${task.title}`}
            className="text-left font-medium text-slate-800 hover:text-blue-700">{task.title}</button>
          <TaskSignals task={task} members={members} today={today}
            lastUpdate={lastManualUpdate(commentsByTask[task.id])}
            nextAction={chooseNextAction([task], today)} />
        </div>
      </div>)}
    </section>)}
    {groupBy === 'stage' && tasks.some(task => !orderedFronts.some(front => front.id === task.frontId)) &&
      <p role="alert" className="text-sm text-red-700">Há tarefas com Frente inválida. Recarregue o Pedido.</p>}
  </section>;
}
