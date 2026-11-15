import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { projectCalendar, type CalendarEntry, type CalendarScope } from './calendar';
import type { EventV1 } from './events';
import { mapTask, taskRowSchema, type TaskRow } from './mappers';
import type { Id, Subtask, TaskV1 } from './types';

const taskColumns = 'id,organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,responsavel_user_id,responsavel,vencimento,follow_up_date,waiting_type,waiting_user_id,waiting_note,concluido,updated_at,concluida_em';
const eventColumns = 'id,tipo,titulo,data,horario,responsavel_user_id,observacao,customer_id,pedido_id,frente_id,tarefa_id';

const subtaskRow = z.object({
  id: z.string(), tarefa_id: z.string(), descricao: z.string(), concluida: z.boolean().nullable(),
  vencimento: z.string().nullable(), prioridade: z.enum(['Urgente', 'Alta', 'Normal', 'Baixa']).nullable(),
  tarefas: taskRowSchema,
});
const eventRow = z.object({
  id: z.string(), tipo: z.enum(['meeting', 'visit', 'external_service', 'other']),
  titulo: z.string(), data: z.string(), horario: z.string(), responsavel_user_id: z.string(),
  observacao: z.string().nullable(), customer_id: z.string().nullable(),
  pedido_id: z.string().nullable(), frente_id: z.string().nullable(), tarefa_id: z.string().nullable(),
});

export async function loadCalendar(client: SupabaseClient, org: Id,
  scope: CalendarScope): Promise<CalendarEntry[]> {
  let dueQuery = client.from('tarefas').select(taskColumns).eq('organization_id', org)
    .gte('vencimento', scope.from).lte('vencimento', scope.to);
  let followUpQuery = client.from('tarefas').select(taskColumns).eq('organization_id', org)
    .neq('status', 'Concluída').gte('follow_up_date', scope.from).lte('follow_up_date', scope.to);
  let subtaskQuery = client.from('subtarefas')
    .select(`id,tarefa_id,descricao,concluida,vencimento,prioridade,tarefas!subtarefas_tarefa_org_fkey(${taskColumns})`)
    .eq('organization_id', org).eq('tarefas.organization_id', org)
    .gte('vencimento', scope.from).lte('vencimento', scope.to);
  let eventQuery = client.from('pedido_eventos').select(eventColumns).eq('organization_id', org)
    .gte('data', scope.from).lte('data', scope.to);
  if (scope.orderId) {
    dueQuery = dueQuery.eq('pedido_id', scope.orderId);
    followUpQuery = followUpQuery.eq('pedido_id', scope.orderId);
    subtaskQuery = subtaskQuery.eq('tarefas.pedido_id', scope.orderId);
    eventQuery = eventQuery.eq('pedido_id', scope.orderId);
  }

  const [dueResult, followUpResult, subtaskResult, eventResult] = await Promise.all([
    dueQuery, followUpQuery, subtaskQuery, eventQuery,
  ]);
  const dueRows = rowsOrThrow<TaskRow>(dueResult, 'Não foi possível carregar prazos de tarefas');
  const followUpRows = rowsOrThrow<TaskRow>(followUpResult, 'Não foi possível carregar follow-ups');
  const parsedSubtasks = subtaskRow.array().parse(
    rowsOrThrow<unknown>(subtaskResult, 'Não foi possível carregar prazos de subtarefas'));
  const parsedEvents = eventRow.array().parse(
    rowsOrThrow<unknown>(eventResult, 'Não foi possível carregar eventos'));

  const tasksById = new Map<Id, TaskV1>();
  [...dueRows, ...followUpRows, ...parsedSubtasks.map(row => row.tarefas)]
    .forEach(row => {
      const task = mapTask(row, 'v1');
      tasksById.set(task.id, task);
    });
  const subtasks: Subtask[] = parsedSubtasks.map(row => ({ id: row.id, taskId: row.tarefa_id,
    title: row.descricao, completed: row.concluida ?? false, dueDate: row.vencimento,
    priority: row.prioridade }));
  const events: EventV1[] = parsedEvents.map(row => ({ id: row.id, kind: row.tipo,
    title: row.titulo, date: row.data, time: row.horario.slice(0, 5),
    assigneeId: row.responsavel_user_id, note: row.observacao, customerId: row.customer_id,
    orderId: row.pedido_id, frontId: row.frente_id, taskId: row.tarefa_id }));

  return projectCalendar({ tasks: [...tasksById.values()], subtasks, events }, scope);
}

function rowsOrThrow<T>(result: { data: unknown[] | null; error: { message: string } | null },
  message: string): T[] {
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  return (result.data ?? []) as T[];
}
