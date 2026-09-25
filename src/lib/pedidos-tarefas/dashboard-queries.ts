import type { SupabaseClient } from '@supabase/supabase-js';
import { mapTask, type TaskRow } from './mappers';
import type { DashboardTask, TaskFilter } from './dashboard';
import type { DateKey, Id } from './types';

type OrderRow = { id: Id; numero_pedido: string; cliente: string };
type TaskNoteRow = { tarefa_id: Id; texto: string; criado_em: string };
type OrderActivityRow = { pedido_id: Id; descricao: string; criado_em: string };

export interface DashboardReadClient {
  listRelevantTasks(org: Id, today: DateKey, filter: TaskFilter): Promise<TaskRow[]>;
  listOrdersByIds(org: Id, orderIds: Id[]): Promise<OrderRow[]>;
  listManualTaskNotes(org: Id, taskIds: Id[]): Promise<TaskNoteRow[]>;
  listManualOrderActivities(org: Id, orderIds: Id[]): Promise<OrderActivityRow[]>;
}

export async function loadDashboardTasks(
  client: DashboardReadClient,
  org: Id,
  today: DateKey,
  filter: TaskFilter,
): Promise<DashboardTask[]> {
  const rows = await client.listRelevantTasks(org, today, filter);
  const tasks = rows.map(row => mapTask(row, 'v1'));
  const taskIds = tasks.map(task => task.id);
  const orderIds = unique(tasks.flatMap(task => task.orderId ? [task.orderId] : []));
  const [orders, notes, activities] = await Promise.all([
    orderIds.length ? client.listOrdersByIds(org, orderIds) : [],
    taskIds.length ? client.listManualTaskNotes(org, taskIds) : [],
    orderIds.length ? client.listManualOrderActivities(org, orderIds) : [],
  ]);
  const ordersById = new Map(orders.map(order => [order.id, order]));
  const notesByTask = latestBy(notes, row => row.tarefa_id, row => row.criado_em);
  const activitiesByOrder = latestBy(activities, row => row.pedido_id, row => row.criado_em);

  return tasks.map(task => {
    const order = task.orderId ? ordersById.get(task.orderId) : undefined;
    const note = notesByTask.get(task.id);
    const activity = task.orderId ? activitiesByOrder.get(task.orderId) : undefined;
    const latest = [
      note && { text: note.texto, at: note.criado_em },
      activity && { text: activity.descricao, at: activity.criado_em },
    ].filter((value): value is { text: string; at: string } => Boolean(value))
      .sort((left, right) => right.at.localeCompare(left.at))[0] ?? null;
    return {
      task,
      order: order ? { number: order.numero_pedido, client: order.cliente } : null,
      lastUpdate: latest,
    };
  });
}

export function createSupabaseDashboardReadClient(client: SupabaseClient): DashboardReadClient {
  return {
    async listRelevantTasks(org, today, filter) {
      let query = client.from('tarefas')
        .select('id,organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,responsavel_user_id,responsavel,vencimento,follow_up_date,waiting_type,waiting_user_id,waiting_note,concluido,updated_at,concluida_em')
        .eq('organization_id', org)
        .neq('status', 'Concluída')
        .or(`vencimento.lte.${today},follow_up_date.lte.${today},status.eq.Aguardando`)
        .order('vencimento', { ascending: true, nullsFirst: false });
      if (filter.assigneeId) query = query.eq('responsavel_user_id', filter.assigneeId);
      if (filter.waitingType) query = query.eq('waiting_type', filter.waitingType);
      const { data, error } = await query;
      return rowsOrThrow<TaskRow>(data, error, 'Não foi possível carregar as tarefas operacionais');
    },

    async listOrdersByIds(org, orderIds) {
      const { data, error } = await client.from('pedidos')
        .select('id,numero_pedido,cliente')
        .eq('organization_id', org)
        .in('id', orderIds);
      return rowsOrThrow<OrderRow>(data, error, 'Não foi possível carregar o contexto dos Pedidos');
    },

    async listManualTaskNotes(org, taskIds) {
      const { data, error } = await client.from('comentarios_tarefa')
        .select('tarefa_id,texto,criado_em')
        .eq('organization_id', org)
        .in('tarefa_id', taskIds)
        .is('event_type', null)
        .order('criado_em', { ascending: false });
      return rowsOrThrow<TaskNoteRow>(data, error, 'Não foi possível carregar as notas das tarefas');
    },

    async listManualOrderActivities(org, orderIds) {
      const { data, error } = await client.from('atividades')
        .select('pedido_id,descricao,criado_em')
        .eq('organization_id', org)
        .in('pedido_id', orderIds)
        .or('migration_key.is.null,migration_key.not.like.system:%')
        .order('criado_em', { ascending: false });
      return rowsOrThrow<OrderActivityRow>(data, error, 'Não foi possível carregar as atualizações dos Pedidos');
    },
  };
}

function latestBy<T>(rows: T[], key: (row: T) => string, at: (row: T) => string) {
  const latest = new Map<string, T>();
  rows.forEach(row => {
    const id = key(row);
    const current = latest.get(id);
    if (!current || at(row) > at(current)) latest.set(id, row);
  });
  return latest;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function rowsOrThrow<T>(data: unknown[] | null, error: { message: string } | null, message: string) {
  if (error) throw new Error(`${message}: ${error.message}`);
  return (data ?? []) as T[];
}
