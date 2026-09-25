import type { SupabaseClient } from '@supabase/supabase-js';
import type { ComentarioTarefa } from '@/types';
import { mapTask, type TaskRow } from './mappers';
import type { Capabilities, Id, Subtask, TaskPriority, TaskV1 } from './types';
import { listTaskNotes } from './task-notes';

type SubtaskRow = {
  id: Id;
  tarefa_id: Id;
  descricao: string;
  concluida: boolean | null;
  vencimento: string | null;
  prioridade: TaskPriority | null;
};

export interface StandaloneTaskReadClient {
  getTask(org: Id, taskId: Id): Promise<TaskRow | null>;
  listSubtasks(org: Id, taskId: Id): Promise<SubtaskRow[]>;
  listNotes(org: Id, taskId: Id): Promise<ComentarioTarefa[]>;
}

export type StandaloneTaskDetail = {
  task: TaskV1;
  subtasks: Subtask[];
  comments: ComentarioTarefa[];
};

export async function loadStandaloneTaskDetail(
  client: StandaloneTaskReadClient,
  org: Id,
  taskId: Id,
): Promise<StandaloneTaskDetail | null> {
  const row = await client.getTask(org, taskId);
  if (!row || row.pedido_id !== null) return null;
  const [subtasks, comments] = await Promise.all([
    client.listSubtasks(org, taskId),
    client.listNotes(org, taskId),
  ]);
  return {
    task: mapTask(row, 'v1'),
    subtasks: subtasks.map(subtask => ({
      id: subtask.id,
      taskId: subtask.tarefa_id,
      title: subtask.descricao,
      completed: subtask.concluida ?? false,
      dueDate: subtask.vencimento,
      priority: subtask.prioridade,
    })),
    comments,
  };
}

export function createSupabaseStandaloneTaskReadClient(
  client: SupabaseClient,
  timelineMode: Capabilities['timelineMode'] = 'legacy',
): StandaloneTaskReadClient {
  return {
    async getTask(org, taskId) {
      const { data, error } = await client.from('tarefas')
        .select('id,organization_id,pedido_id,frente_id,descricao,descricao_detalhada,status,prioridade,responsavel_user_id,responsavel,vencimento,follow_up_date,waiting_type,waiting_user_id,waiting_note,concluido,updated_at,concluida_em')
        .eq('organization_id', org)
        .eq('id', taskId)
        .maybeSingle();
      if (error) throw new Error(`Não foi possível carregar a tarefa: ${error.message}`);
      return data as TaskRow | null;
    },
    async listSubtasks(org, taskId) {
      const { data, error } = await client.from('subtarefas')
        .select('id,tarefa_id,descricao,concluida,vencimento,prioridade')
        .eq('organization_id', org)
        .eq('tarefa_id', taskId)
        .order('criado_em', { ascending: true });
      if (error) throw new Error(`Não foi possível carregar as subtarefas: ${error.message}`);
      return (data ?? []) as SubtaskRow[];
    },
    async listNotes(org, taskId) {
      if (timelineMode === 'v1') return listTaskNotes(client, org, taskId, timelineMode);
      const { data, error } = await client.from('comentarios_tarefa')
        .select('id,tarefa_id,texto,usuario,criado_em,event_type')
        .eq('organization_id', org)
        .eq('tarefa_id', taskId)
        .order('criado_em', { ascending: true });
      if (error) throw new Error(`Não foi possível carregar as notas: ${error.message}`);
      return (data ?? []) as ComentarioTarefa[];
    },
  };
}
