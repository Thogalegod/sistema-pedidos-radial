import { z } from 'zod';
import type { InstanceDateRule, TaskPriority } from './types';

const keySchema = z.string().trim().min(1).max(100);
const labelSchema = z.string().trim().min(1);
const prioritySchema = z.enum(['Urgente', 'Alta', 'Normal', 'Baixa']);
const offsetSchema = z.number().int().nonnegative();

const creationRuleSchema = z.object({
  kind: z.literal('creation'), offsetDays: offsetSchema,
}).strict();
const completionRuleSchema = z.object({
  kind: z.literal('completion'), sourceTaskKey: keySchema, offsetDays: offsetSchema,
}).strict();
const dateRuleSchema = z.discriminatedUnion('kind', [creationRuleSchema, completionRuleSchema]);

const frontSchema = z.object({
  key: keySchema, name: labelSchema, position: z.number().int().nonnegative(),
}).strict();
const taskSchema = z.object({
  key: keySchema, frontKey: keySchema, title: labelSchema, description: z.string().nullable(),
  priority: prioritySchema, dueRule: dateRuleSchema.nullable(), followUpRule: dateRuleSchema.nullable(),
}).strict();
const subtaskSchema = z.object({
  key: keySchema, taskKey: keySchema, title: labelSchema, priority: prioritySchema.nullable(),
  dueRule: dateRuleSchema.nullable(),
}).strict();
const dependencySchema = z.object({
  taskKey: keySchema, predecessorKey: keySchema,
}).strict();

export type DateRule = z.infer<typeof dateRuleSchema>;
export type TemplateDefinition = {
  schemaVersion: 1;
  fronts: Array<{ key: string; name: string; position: number }>;
  tasks: Array<{ key: string; frontKey: string; title: string; description: string | null;
    priority: TaskPriority; dueRule: DateRule | null; followUpRule: DateRule | null }>;
  subtasks: Array<{ key: string; taskKey: string; title: string; priority: TaskPriority | null;
    dueRule: DateRule | null }>;
  dependencies: Array<{ taskKey: string; predecessorKey: string }>;
};

function duplicateKeys(values: string[]) {
  return new Set(values).size !== values.length;
}

function graphHasCycle(nodes: string[], edges: Array<[string, string]>) {
  const outgoing = new Map(nodes.map(node => [node, [] as string[]]));
  for (const [from, to] of edges) outgoing.get(from)?.push(to);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(node: string): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if (outgoing.get(node)?.some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return nodes.some(visit);
}

export const templateDefinitionSchema: z.ZodType<TemplateDefinition> = z.object({
  schemaVersion: z.literal(1),
  fronts: z.array(frontSchema),
  tasks: z.array(taskSchema),
  subtasks: z.array(subtaskSchema),
  dependencies: z.array(dependencySchema),
}).strict().superRefine((definition, context) => {
  const frontKeys = definition.fronts.map(front => front.key);
  const taskKeys = definition.tasks.map(task => task.key);
  const subtaskKeys = definition.subtasks.map(subtask => subtask.key);
  const fronts = new Set(frontKeys);
  const tasks = new Set(taskKeys);

  if (duplicateKeys(frontKeys)) context.addIssue({ code: 'custom', message: 'Chave de Frente duplicada' });
  if (duplicateKeys(taskKeys)) context.addIssue({ code: 'custom', message: 'Chave de tarefa duplicada' });
  if (duplicateKeys(subtaskKeys)) context.addIssue({ code: 'custom', message: 'Chave de subtarefa duplicada' });
  for (const task of definition.tasks) {
    if (!fronts.has(task.frontKey)) context.addIssue({ code: 'custom', message: 'Frente da tarefa não existe' });
  }
  for (const subtask of definition.subtasks) {
    if (!tasks.has(subtask.taskKey)) context.addIssue({ code: 'custom', message: 'Tarefa da subtarefa não existe' });
  }
  const dependencyEdges: Array<[string, string]> = [];
  const dependencyKeys = new Set<string>();
  for (const dependency of definition.dependencies) {
    if (!tasks.has(dependency.taskKey) || !tasks.has(dependency.predecessorKey)) {
      context.addIssue({ code: 'custom', message: 'Dependência referencia tarefa ausente' });
      continue;
    }
    const key = `${dependency.taskKey}\u0000${dependency.predecessorKey}`;
    if (dependencyKeys.has(key)) context.addIssue({ code: 'custom', message: 'Dependência duplicada' });
    dependencyKeys.add(key);
    dependencyEdges.push([dependency.taskKey, dependency.predecessorKey]);
  }
  if (graphHasCycle(taskKeys, dependencyEdges)) {
    context.addIssue({ code: 'custom', message: 'Dependências não podem formar ciclo' });
  }

  const completionEdges: Array<[string, string]> = [];
  const collectRule = (owner: string, rule: DateRule | null) => {
    if (rule?.kind !== 'completion') return;
    if (!tasks.has(rule.sourceTaskKey)) {
      context.addIssue({ code: 'custom', message: 'Regra referencia tarefa origem ausente' });
      return;
    }
    completionEdges.push([owner, rule.sourceTaskKey]);
  };
  for (const task of definition.tasks) {
    collectRule(task.key, task.dueRule);
    collectRule(task.key, task.followUpRule);
  }
  for (const subtask of definition.subtasks) collectRule(subtask.taskKey, subtask.dueRule);
  if (graphHasCycle(taskKeys, completionEdges)) {
    context.addIssue({ code: 'custom', message: 'Regras de conclusão não podem formar ciclo' });
  }
});

export const instanceDateRuleSchema: z.ZodType<InstanceDateRule> = z.object({
  sourceTaskId: z.string().min(1),
  offsetDays: offsetSchema,
  timeZone: z.string().trim().min(1),
  state: z.enum(['pending', 'materialized', 'overridden']),
  materializedAt: z.string().nullable(),
}).strict();
