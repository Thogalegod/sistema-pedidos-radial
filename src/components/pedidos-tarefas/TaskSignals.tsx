import type { NextAction } from '@/lib/pedidos-tarefas/indicators';
import type { Member, TaskV1 } from '@/lib/pedidos-tarefas/types';
import { compareCivilDateKeys } from '@/lib/pedidos-tarefas/task-due';
import { differenceInCalendarDays, parseISO } from 'date-fns';

const waitingNames = { customer: 'Cliente', utility: 'Concessionária', supplier: 'Fornecedor',
  internal_user: 'Pessoa interna', other: 'Outro' } as const;

function memberName(members: Member[], id: string | null) {
  if (!id) return null;
  const member = members.find(candidate => candidate.userId === id);
  return member?.displayName?.trim() || `Membro sem nome · ${id.slice(0, 8)}`;
}

export function TaskSignals({ task, members, today, lastUpdate, nextAction }: { task: TaskV1;
  members: Member[]; today: string; lastUpdate: { text: string; at: string } | null;
  nextAction: NextAction | null }) {
  const dueCompare = task.status !== 'Concluída' && task.dueDate
    ? compareCivilDateKeys(task.dueDate, today) : null;
  const overdueDays = dueCompare === -1 && task.dueDate
    ? differenceInCalendarDays(parseISO(today), parseISO(task.dueDate)) : 0;
  const assignee = memberName(members, task.assigneeId)
    ?? (task.legacyAssignee ? `${task.legacyAssignee} · identidade pendente` : 'Não definido');
  const waiting = task.status === 'Aguardando' && task.waiting
    ? task.waiting.type === 'internal_user'
      ? memberName(members, task.waiting.userId) ?? 'Pessoa interna'
      : waitingNames[task.waiting.type] : null;
  const followUpCompare = task.status !== 'Concluída' && task.followUpDate
    ? compareCivilDateKeys(task.followUpDate, today) : null;
  return <section aria-label="Sinais operacionais" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
    {dueCompare === -1 && <span className="font-semibold text-red-700">Atrasada há {overdueDays} {overdueDays === 1 ? 'dia' : 'dias'}</span>}
    {dueCompare === 0 && <span className="font-semibold text-amber-700">Vence hoje</span>}
    {dueCompare === 1 && <span>Prazo · {task.dueDate}</span>}
    <span aria-label="Status da tarefa">{task.status}</span>
    <span>Prioridade · {task.priority}</span>
    <span>Responsável · {assignee}</span>
    {waiting && <span>Aguardando · {waiting}</span>}
    {followUpCompare === 0 && <span>Follow-up hoje</span>}
    {followUpCompare === -1 && <span>Follow-up atrasado · {task.followUpDate}</span>}
    {lastUpdate && <span>Última atualização · {lastUpdate.text} · {lastUpdate.at}</span>}
    {!lastUpdate && task.updatedAt && <span>Última atualização · {task.updatedAt}</span>}
    {!lastUpdate && !task.updatedAt && <span>Última atualização · Não registrada</span>}
    {nextAction && nextAction.taskId === task.id && <span>Próxima ação · {nextAction.label}</span>}
  </section>;
}
