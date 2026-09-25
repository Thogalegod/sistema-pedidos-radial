import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  DateKey,
  Id,
  OrderStatusV1,
  Subtask,
  TaskPriority,
  TaskV1,
  WriteResult,
} from './types';

export type OrderInput = {
  number: string;
  title: string;
  client: string;
  address: string;
  legacyPriority: 'Baixa' | 'Normal' | 'Alta';
  utilityDueDate: DateKey | null;
  customerId?: Id | null;
  siteId?: Id | null;
  contactId?: Id | null;
  cep?: string | null;
};

export type TaskPatch = Partial<Pick<
  TaskV1,
  'title' | 'description' | 'frontId' | 'status' | 'priority' |
  'assigneeId' | 'dueDate' | 'followUpDate' | 'waiting'
>>;

export type TaskInput = TaskPatch & {
  title: string;
  orderId: Id | null;
  frontId: Id | null;
};

export type SubtaskInput = {
  id: Id | null;
  taskId: Id;
  patch: Partial<Pick<Subtask, 'title' | 'completed' | 'dueDate' | 'priority'>>;
};

const taskStatusSchema = z.enum(['Aberta', 'Em andamento', 'Aguardando', 'Concluída']);
const prioritySchema = z.enum(['Urgente', 'Alta', 'Normal', 'Baixa']);
const dateSchema = z.iso.date();
const waitingSchema = z.object({
  type: z.enum(['customer', 'utility', 'supplier', 'internal_user', 'other']),
  userId: z.string().nullable(),
  note: z.string().nullable(),
}).strict();
const taskResultSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  orderId: z.string().nullable(),
  frontId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: prioritySchema,
  assigneeId: z.string().nullable(),
  legacyAssignee: z.string().nullable(),
  dueDate: dateSchema.nullable(),
  followUpDate: dateSchema.nullable(),
  waiting: waitingSchema.nullable(),
  updatedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
}).strict();

type CommandError = { code?: string; message: string };

function failure(error: CommandError): WriteResult<never> {
  const code = error.code === '42501'
    ? 'forbidden'
    : ['22023', '22P02', '23514'].includes(error.code ?? '')
      ? 'invalid'
      : ['23503', '23505'].includes(error.code ?? '')
        ? 'conflict'
        : 'reload';
  return { ok: false, code, message: error.message };
}

function malformedResult(command: string): WriteResult<never> {
  return { ok: false, code: 'reload', message: `Resposta inválida do comando ${command}` };
}

export async function createOrder(
  client: SupabaseClient,
  org: Id,
  input: OrderInput,
): Promise<WriteResult<Id>> {
  const { data, error } = await client.rpc('create_pedido', { p_org: org, p_input: input });
  if (error) return failure(error);
  const parsed = z.string().min(1).safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : malformedResult('create_pedido');
}

export async function updateOrder(
  client: SupabaseClient,
  org: Id,
  id: Id,
  patch: Partial<OrderInput>,
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('update_pedido', { p_org: org, p_id: id, p_patch: patch });
  return error ? failure(error) : { ok: true, value: undefined };
}

export async function createTask(
  client: SupabaseClient,
  org: Id,
  input: TaskInput,
): Promise<WriteResult<Id>> {
  if (input.orderId === null && input.frontId !== null) {
    return { ok: false, code: 'invalid', message: 'Tarefa avulsa não pode ter Frente' };
  }
  if (input.orderId === null && !input.assigneeId) {
    return { ok: false, code: 'invalid', message: 'Tarefa avulsa exige responsável' };
  }
  const { data, error } = await client.rpc('create_pedido_task', { p_org: org, p_input: input });
  if (error) return failure(error);
  const parsed = z.string().min(1).safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : malformedResult('create_pedido_task');
}

export async function updateTask(
  client: SupabaseClient,
  org: Id,
  id: Id,
  patch: TaskPatch,
): Promise<WriteResult<TaskV1>> {
  const { data, error } = await client.rpc('update_pedido_task', {
    p_org: org,
    p_id: id,
    p_patch: patch,
  });
  if (error) return failure(error);
  const parsed = taskResultSchema.safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : malformedResult('update_pedido_task');
}

export async function setOrderStatus(
  client: SupabaseClient,
  org: Id,
  id: Id,
  status: OrderStatusV1,
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('set_pedido_status', {
    p_org: org,
    p_id: id,
    p_status: status,
  });
  return error ? failure(error) : { ok: true, value: undefined };
}

export async function saveSubtask(
  client: SupabaseClient,
  org: Id,
  input: SubtaskInput,
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('save_pedido_subtask', { p_org: org, p_input: input });
  return error ? failure(error) : { ok: true, value: undefined };
}

export async function removeTask(
  client: SupabaseClient,
  org: Id,
  id: Id,
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('remove_pedido_task', { p_org: org, p_id: id });
  return error ? failure(error) : { ok: true, value: undefined };
}

export async function removeFront(
  client: SupabaseClient,
  org: Id,
  frontId: Id,
  destinationId: Id | null,
): Promise<WriteResult<void>> {
  const { error } = await client.rpc('remove_pedido_front', {
    p_org: org,
    p_front: frontId,
    p_destination: destinationId,
  });
  return error ? failure(error) : { ok: true, value: undefined };
}

export type { OrderStatusV1, TaskPriority };
