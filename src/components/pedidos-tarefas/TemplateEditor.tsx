'use client';

import { useState } from 'react';
import type { TemplateDefinition } from '@/lib/pedidos-tarefas/template-schema';
import { templateDefinitionSchema } from '@/lib/pedidos-tarefas/template-schema';
import type {
  SaveTemplateInput,
  TemplateRecord,
} from '@/lib/pedidos-tarefas/templates';
import type { WriteResult } from '@/lib/pedidos-tarefas/types';

type TemplateEditorProps = {
  template: TemplateRecord | null;
  templates?: TemplateRecord[];
  onSelectTemplate?: (id: string) => void;
  onNew?: () => void;
  onSave: (input: SaveTemplateInput) => Promise<WriteResult<TemplateRecord>>;
  onDuplicate: (id: string, name: string) => Promise<WriteResult<TemplateRecord>>;
  onClose: () => void;
};

const priorities = ['Baixa', 'Normal', 'Alta', 'Urgente'] as const;

function blankDefinition(): TemplateDefinition {
  return {
    schemaVersion: 1,
    fronts: [{ key: crypto.randomUUID(), name: 'Geral', position: 0 }],
    tasks: [], subtasks: [], dependencies: [],
  };
}

function cloneDefinition(definition: TemplateDefinition): TemplateDefinition {
  return structuredClone(definition);
}

function creationOffset(rule: TemplateDefinition['tasks'][number]['dueRule']) {
  return rule?.kind === 'creation' ? String(rule.offsetDays) : '';
}

export function TemplateEditor({
  template,
  templates = [],
  onSelectTemplate,
  onNew,
  onSave,
  onDuplicate,
  onClose,
}: TemplateEditorProps) {
  const [name, setName] = useState(template?.name ?? '');
  const [definition, setDefinition] = useState<TemplateDefinition>(() =>
    template ? cloneDefinition(template.definition) : blankDefinition());
  const [duplicateName, setDuplicateName] = useState(`${template?.name ?? 'Template'} - cópia`);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const updateFront = (index: number, value: string) => {
    setDefinition(current => ({
      ...current,
      fronts: current.fronts.map((front, itemIndex) => itemIndex === index
        ? { ...front, name: value } : front),
    }));
  };

  const updateTask = (index: number, patch: Partial<TemplateDefinition['tasks'][number]>) => {
    setDefinition(current => ({
      ...current,
      tasks: current.tasks.map((task, itemIndex) => itemIndex === index ? { ...task, ...patch } : task),
    }));
  };

  const updateSubtask = (index: number, patch: Partial<TemplateDefinition['subtasks'][number]>) => {
    setDefinition(current => ({
      ...current,
      subtasks: current.subtasks.map((subtask, itemIndex) => itemIndex === index
        ? { ...subtask, ...patch } : subtask),
    }));
  };

  const addFront = () => setDefinition(current => ({
    ...current,
    fronts: [...current.fronts, {
      key: crypto.randomUUID(), name: `Frente ${current.fronts.length + 1}`, position: current.fronts.length,
    }],
  }));

  const addTask = () => setDefinition(current => ({
    ...current,
    tasks: [...current.tasks, {
      key: crypto.randomUUID(), frontKey: current.fronts[0]?.key ?? '', title: '', description: null,
      priority: 'Normal', dueRule: null, followUpRule: null,
    }],
  }));

  const addSubtask = () => setDefinition(current => ({
    ...current,
    subtasks: [...current.subtasks, {
      key: crypto.randomUUID(), taskKey: current.tasks[0]?.key ?? '', title: '', priority: null, dueRule: null,
    }],
  }));

  const addDependency = () => setDefinition(current => {
    if (current.tasks.length < 2) return current;
    return {
      ...current,
      dependencies: [...current.dependencies, {
        taskKey: current.tasks[1].key,
        predecessorKey: current.tasks[0].key,
      }],
    };
  });

  const handleSave = async () => {
    setError('');
    const parsed = templateDefinitionSchema.safeParse(definition);
    if (!name.trim() || !parsed.success) {
      setError('Revise o nome, as referências e os campos obrigatórios do template.');
      return;
    }
    setSaving(true);
    try {
      const result = await onSave({
        id: template?.id ?? null,
        name: name.trim(),
        expectedVersion: template?.version ?? null,
        definition: parsed.data,
      });
      if (!result.ok) {
        setError(result.code === 'reload'
          ? 'O template mudou enquanto você editava. Recarregue a lista; seu rascunho foi preservado.'
          : result.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!template) return;
    setError('');
    setSaving(true);
    try {
      const result = await onDuplicate(template.id, duplicateName);
      if (!result.ok) setError(result.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Editor de templates">
      <div className="mx-auto max-w-4xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{template ? 'Editar template' : 'Novo template'}</h2>
            <p className="text-sm text-slate-600">Defina Frentes, tarefas e prazos em dias corridos a partir da criação.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-600">Fechar</button>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {(onSelectTemplate || onNew) && (
          <label className="block text-sm font-medium text-slate-700">
            Template em edição
            <select value={template?.id ?? ''} onChange={event => {
              if (event.target.value) onSelectTemplate?.(event.target.value);
              else onNew?.();
            }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Novo template</option>
              {templates.map(item => <option key={item.id} value={item.id}>{item.name} (v{item.version})</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium text-slate-700">
          Nome do template
          <input aria-label="Nome do template" value={name} onChange={event => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>

        <section className="space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Frentes</h3>
            <button type="button" onClick={addFront} className="text-sm text-blue-700">Adicionar Frente</button></div>
          {definition.fronts.map((front, index) => (
            <div key={front.key} className="flex gap-2">
              <input aria-label={`Nome da Frente ${index + 1}`} value={front.name}
                onChange={event => updateFront(index, event.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
              {definition.fronts.length > 1 && <button type="button"
                disabled={definition.tasks.some(task => task.frontKey === front.key)}
                title={definition.tasks.some(task => task.frontKey === front.key) ? 'Remova ou mova as tarefas desta Frente primeiro' : undefined}
                onClick={() => setDefinition(current => ({
                ...current, fronts: current.fronts.filter(item => item.key !== front.key),
              }))} className="text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-40">Remover</button>}
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Tarefas</h3>
            <button type="button" onClick={addTask} disabled={definition.fronts.length === 0} className="text-sm text-blue-700 disabled:opacity-50">Adicionar tarefa</button></div>
          {definition.tasks.map((task, index) => (
            <div key={task.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
              <input aria-label={`Título da tarefa ${index + 1}`} value={task.title}
                onChange={event => updateTask(index, { title: event.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" />
              <select aria-label={`Frente da tarefa ${index + 1}`} value={task.frontKey}
                onChange={event => updateTask(index, { frontKey: event.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2">
                {definition.fronts.map(front => <option key={front.key} value={front.key}>{front.name}</option>)}
              </select>
              <select aria-label={`Prioridade da tarefa ${index + 1}`} value={task.priority}
                onChange={event => updateTask(index, { priority: event.target.value as typeof task.priority })}
                className="rounded-lg border border-slate-300 px-3 py-2">
                {priorities.map(priority => <option key={priority}>{priority}</option>)}
              </select>
              <input aria-label={`Descrição da tarefa ${index + 1}`} value={task.description ?? ''}
                placeholder="Descrição opcional"
                onChange={event => updateTask(index, { description: event.target.value || null })}
                className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" />
              <label className="text-xs text-slate-600">Tipo de prazo
                <select aria-label={`Tipo de prazo da tarefa ${index + 1}`} value={task.dueRule?.kind ?? 'none'}
                  onChange={event => {
                    const kind = event.target.value;
                    const source = definition.tasks.find(item => item.key !== task.key);
                    updateTask(index, { dueRule: kind === 'creation' ? { kind, offsetDays: 0 }
                      : kind === 'completion' && source ? { kind, sourceTaskKey: source.key, offsetDays: 0 } : null });
                  }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="none">Sem prazo</option><option value="creation">Após criar Pedido</option>
                  <option value="completion" disabled={definition.tasks.length < 2}>Após concluir tarefa</option>
                </select>
              </label>
              {task.dueRule?.kind === 'creation' && <label className="text-xs text-slate-600">Prazo D+
                <input type="number" min="0" aria-label={`Prazo D+ da tarefa ${index + 1}`}
                  value={creationOffset(task.dueRule)} onChange={event => updateTask(index, {
                    dueRule: { kind: 'creation', offsetDays: Number(event.target.value || 0) },
                  })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>}
              {task.dueRule?.kind === 'completion' && <>
                <label className="text-xs text-slate-600">Tarefa de origem
                  <select aria-label={`Tarefa de origem do prazo ${index + 1}`} value={task.dueRule.sourceTaskKey}
                    onChange={event => updateTask(index, { dueRule: {
                      kind: 'completion', sourceTaskKey: event.target.value, offsetDays: task.dueRule?.offsetDays ?? 0,
                    } })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                    {definition.tasks.filter(item => item.key !== task.key).map(item =>
                      <option key={item.key} value={item.key}>{item.title || 'Tarefa sem título'}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-600">Dias após conclusão
                  <input type="number" min="0" aria-label={`Dias após conclusão do prazo ${index + 1}`}
                    value={task.dueRule.offsetDays} onChange={event => updateTask(index, {
                      dueRule: { ...task.dueRule!, offsetDays: Number(event.target.value || 0) },
                    })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              </>}
              <label className="text-xs text-slate-600">Tipo de follow-up
                <select aria-label={`Tipo de follow-up da tarefa ${index + 1}`} value={task.followUpRule?.kind ?? 'none'}
                  onChange={event => {
                    const kind = event.target.value; const source = definition.tasks.find(item => item.key !== task.key);
                    updateTask(index, { followUpRule: kind === 'creation' ? { kind, offsetDays: 0 }
                      : kind === 'completion' && source ? { kind, sourceTaskKey: source.key, offsetDays: 0 } : null });
                  }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="none">Sem follow-up</option><option value="creation">Após criar Pedido</option>
                  <option value="completion" disabled={definition.tasks.length < 2}>Após concluir tarefa</option>
                </select>
              </label>
              {task.followUpRule?.kind === 'creation' && <label className="text-xs text-slate-600">Follow-up D+
                <input type="number" min="0" aria-label={`Follow-up D+ da tarefa ${index + 1}`}
                  value={creationOffset(task.followUpRule)} onChange={event => updateTask(index, {
                    followUpRule: { kind: 'creation', offsetDays: Number(event.target.value || 0) },
                  })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>}
              {task.followUpRule?.kind === 'completion' && <>
                <select aria-label={`Tarefa de origem do follow-up ${index + 1}`} value={task.followUpRule.sourceTaskKey}
                  onChange={event => updateTask(index, { followUpRule: {
                    kind: 'completion', sourceTaskKey: event.target.value, offsetDays: task.followUpRule?.offsetDays ?? 0,
                  } })}
                  className="rounded-lg border border-slate-300 px-3 py-2">
                  {definition.tasks.filter(item => item.key !== task.key).map(item =>
                    <option key={item.key} value={item.key}>{item.title || 'Tarefa sem título'}</option>)}
                </select>
                <input type="number" min="0" aria-label={`Dias após conclusão do follow-up ${index + 1}`}
                  value={task.followUpRule.offsetDays} onChange={event => updateTask(index, {
                    followUpRule: { ...task.followUpRule!, offsetDays: Number(event.target.value || 0) },
                  })} className="rounded-lg border border-slate-300 px-3 py-2" />
              </>}
              <button type="button" onClick={() => setDefinition(current => ({
                ...current,
                tasks: current.tasks.filter(item => item.key !== task.key),
                subtasks: current.subtasks.filter(item => item.taskKey !== task.key),
                dependencies: current.dependencies.filter(item => item.taskKey !== task.key && item.predecessorKey !== task.key),
              }))} className="self-end py-2 text-sm text-red-700">Remover tarefa</button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Subtarefas</h3>
            <button type="button" onClick={addSubtask} disabled={definition.tasks.length === 0} className="text-sm text-blue-700 disabled:opacity-50">Adicionar subtarefa</button></div>
          {definition.subtasks.map((subtask, index) => (
            <div key={subtask.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
              <input aria-label={`Título da subtarefa ${index + 1}`} value={subtask.title}
                onChange={event => updateSubtask(index, { title: event.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 md:col-span-2" />
              <select aria-label={`Tarefa da subtarefa ${index + 1}`} value={subtask.taskKey}
                onChange={event => updateSubtask(index, { taskKey: event.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2">
                {definition.tasks.map(task => <option key={task.key} value={task.key}>{task.title || 'Tarefa sem título'}</option>)}
              </select>
              <select aria-label={`Prioridade da subtarefa ${index + 1}`} value={subtask.priority ?? ''}
                onChange={event => updateSubtask(index, {
                  priority: event.target.value ? event.target.value as NonNullable<typeof subtask.priority> : null,
                })} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="">Sem prioridade sugerida</option>
                {priorities.map(priority => <option key={priority}>{priority}</option>)}
              </select>
              <select aria-label={`Tipo de prazo da subtarefa ${index + 1}`} value={subtask.dueRule?.kind ?? 'none'}
                onChange={event => {
                  const kind = event.target.value; const source = definition.tasks[0];
                  updateSubtask(index, { dueRule: kind === 'creation' ? { kind, offsetDays: 0 }
                    : kind === 'completion' && source ? { kind, sourceTaskKey: source.key, offsetDays: 0 } : null });
                }} className="rounded-lg border border-slate-300 px-3 py-2">
                <option value="none">Sem prazo</option><option value="creation">Após criar Pedido</option>
                <option value="completion">Após concluir tarefa</option>
              </select>
              {subtask.dueRule?.kind === 'creation' && <input type="number" min="0" aria-label={`Prazo D+ da subtarefa ${index + 1}`}
                value={creationOffset(subtask.dueRule)} onChange={event => updateSubtask(index, {
                  dueRule: { kind: 'creation', offsetDays: Number(event.target.value || 0) },
                })} className="rounded-lg border border-slate-300 px-3 py-2" />}
              {subtask.dueRule?.kind === 'completion' && <>
                <select aria-label={`Tarefa de origem do prazo da subtarefa ${index + 1}`} value={subtask.dueRule.sourceTaskKey}
                  onChange={event => updateSubtask(index, { dueRule: {
                    kind: 'completion', sourceTaskKey: event.target.value, offsetDays: subtask.dueRule?.offsetDays ?? 0,
                  } })}
                  className="rounded-lg border border-slate-300 px-3 py-2">
                  {definition.tasks.map(item => <option key={item.key} value={item.key}>{item.title || 'Tarefa sem título'}</option>)}
                </select>
                <input type="number" min="0" aria-label={`Dias após conclusão do prazo da subtarefa ${index + 1}`}
                  value={subtask.dueRule.offsetDays} onChange={event => updateSubtask(index, {
                    dueRule: { ...subtask.dueRule!, offsetDays: Number(event.target.value || 0) },
                  })} className="rounded-lg border border-slate-300 px-3 py-2" />
              </>}
              <button type="button" onClick={() => setDefinition(current => ({
                ...current, subtasks: current.subtasks.filter(item => item.key !== subtask.key),
              }))} className="text-sm text-red-700">Remover subtarefa</button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex justify-between"><h3 className="font-semibold">Dependências</h3>
            <button type="button" onClick={addDependency} disabled={definition.tasks.length < 2} className="text-sm text-blue-700 disabled:opacity-50">Adicionar dependência</button></div>
          {definition.dependencies.map((dependency, index) => (
            <div key={`${dependency.taskKey}-${dependency.predecessorKey}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <select aria-label={`Tarefa dependente ${index + 1}`} value={dependency.taskKey}
                onChange={event => setDefinition(current => ({ ...current, dependencies: current.dependencies.map((item, itemIndex) => itemIndex === index ? { ...item, taskKey: event.target.value } : item) }))}
                className="rounded-lg border border-slate-300 px-3 py-2">
                {definition.tasks.map(task => <option key={task.key} value={task.key}>{task.title || 'Tarefa sem título'}</option>)}
              </select>
              <select aria-label={`Predecessora ${index + 1}`} value={dependency.predecessorKey}
                onChange={event => setDefinition(current => ({ ...current, dependencies: current.dependencies.map((item, itemIndex) => itemIndex === index ? { ...item, predecessorKey: event.target.value } : item) }))}
                className="rounded-lg border border-slate-300 px-3 py-2">
                {definition.tasks.map(task => <option key={task.key} value={task.key}>{task.title || 'Tarefa sem título'}</option>)}
              </select>
              <button type="button" onClick={() => setDefinition(current => ({
                ...current, dependencies: current.dependencies.filter((_, itemIndex) => itemIndex !== index),
              }))} className="text-sm text-red-700">Remover dependência</button>
            </div>
          ))}
        </section>

        {template && (
          <div className="flex gap-2 rounded-xl bg-slate-50 p-3">
            <input aria-label="Nome da cópia" value={duplicateName} onChange={event => setDuplicateName(event.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
            <button type="button" disabled={saving} onClick={handleDuplicate}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Duplicar template</button>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">Cancelar</button>
          <button type="button" disabled={saving} onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar template'}
          </button>
        </div>
      </div>
    </div>
  );
}
