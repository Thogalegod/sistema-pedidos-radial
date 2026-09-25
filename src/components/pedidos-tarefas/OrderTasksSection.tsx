'use client';

import { useState } from 'react';
import type { TaskInput, TaskPatch, SubtaskInput } from '@/lib/pedidos-tarefas/commands';
import type { ComentarioTarefa } from '@/types';
import type { Anexo } from '@/types';
import type { Dependency, Front, Member, Subtask, TaskV1, WriteResult } from '@/lib/pedidos-tarefas/types';
import type { AttachmentContext, StagedAttachment } from '@/lib/pedidos-tarefas/attachments';
import type { TimelineEntry, UpdateInput } from '@/lib/pedidos-tarefas/timeline';
import { chooseInitialFront } from '@/lib/pedidos-tarefas/fronts';
import { blockedCount } from '@/lib/pedidos-tarefas/indicators';
import { OrderTaskList } from './OrderTaskList';
import { FrontEditor } from './FrontEditor';
import { TaskDetailDrawer } from './TaskDetailDrawer';

export type OrderTasksSectionProps = { orderId: string; tasks: TaskV1[]; subtasks: Subtask[];
  commentsByTask: Record<string, ComentarioTarefa[]>; dependencies: Dependency[]; fronts: Front[];
  members: Member[]; today: string; focusedTaskId: string | null; canManageOrder: boolean;
  defaultAssigneeId: string | null; onFocusTask: (id: string) => void; onCloseTask: () => void;
  onCreateTask: (input: TaskInput) => Promise<boolean>;
  onSaveTask: (id: string, patch: TaskPatch) => Promise<boolean>;
  onToggleTask: (id: string) => Promise<boolean>;
  onDeleteTask: (id: string) => Promise<boolean>;
  onSaveSubtask: (input: SubtaskInput) => Promise<boolean>;
  onDeleteSubtask: (taskId: string, id: string) => Promise<boolean>;
  onAddNote: (taskId: string, text: string) => Promise<boolean>;
  onDeleteNote: (taskId: string, id: string) => Promise<boolean>;
  timelineEntries?: TimelineEntry[];
  onSaveUpdate?: (input: UpdateInput) => Promise<WriteResult<string>>;
  attachments?: Anexo[];
  onUploadFiles?: (context: AttachmentContext, files: StagedAttachment[]) => Promise<boolean>;
  onOpenAttachment?: (attachment: Anexo) => Promise<string | null>;
  onDeleteAttachment?: (attachment: Anexo) => Promise<boolean>;
  onDetailChanged?: () => void;
  onAddDependency: (taskId: string, predecessorId: string) => Promise<boolean>;
  onRemoveDependency: (taskId: string, predecessorId: string) => Promise<boolean>;
  onSaveFront: (front: Front) => Promise<boolean>;
  onRemoveFront: (id: string, destinationId: string | null) => Promise<boolean>;
  onReorderFront: (id: string, direction: 'up' | 'down') => Promise<boolean> };

export function OrderTasksSection({ orderId, tasks, subtasks, commentsByTask, dependencies,
  fronts, members, today, focusedTaskId, canManageOrder, defaultAssigneeId,
  onFocusTask, onCloseTask, onCreateTask, onSaveTask, onToggleTask, onDeleteTask,
  onSaveSubtask, onDeleteSubtask, onAddNote, onDeleteNote, onAddDependency,
  onRemoveDependency, onSaveFront, onRemoveFront, onReorderFront, timelineEntries,
  onSaveUpdate, attachments = [], onUploadFiles, onOpenAttachment,
  onDeleteAttachment, onDetailChanged }: OrderTasksSectionProps) {
  const [groupBy, setGroupBy] = useState<'stage' | 'due'>('stage');
  const [showFrontEditor, setShowFrontEditor] = useState(false);
  const [title, setTitle] = useState('');
  const [frontId, setFrontId] = useState(() => chooseInitialFront(fronts, null) ?? '');
  const effectiveFrontId = frontId && fronts.some(front => front.id === frontId)
    ? frontId : chooseInitialFront(fronts, null) ?? '';
  const [assigneeId, setAssigneeId] = useState(() => members.some(member => member.userId === defaultAssigneeId)
    ? defaultAssigneeId ?? '' : '');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedTask = tasks.find(task => task.id === focusedTaskId) ?? null;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || (fronts.length > 0 && !effectiveFrontId) || !assigneeId || busy) return;
    setBusy(true); setError(null);
    try {
      const ok = await onCreateTask({ title: title.trim(), orderId,
        frontId: fronts.length === 0 ? null : effectiveFrontId,
        assigneeId: assigneeId || null, dueDate: dueDate || null,
        description: description.trim() || null });
      if (!ok) { setError('Não foi possível criar a tarefa. Confira os dados e tente novamente.'); return; }
      setTitle(''); setDueDate(''); setDescription('');
    } catch { setError('Não foi possível criar a tarefa. Confira os dados e tente novamente.'); }
    finally { setBusy(false); }
  }

  async function toggle(taskId: string) {
    const task = tasks.find(item => item.id === taskId);
    if (!task || busyTaskId) return false;
    const openSubtasks = subtasks.filter(item => item.taskId === taskId && !item.completed).length;
    const blocked = blockedCount(taskId, tasks, dependencies);
    if (task.status !== 'Concluída' && (openSubtasks > 0 || blocked > 0) &&
      !window.confirm('Há subtarefas ou predecessoras abertas. Concluir esta tarefa mesmo assim?')) return false;
    setBusyTaskId(taskId); setError(null);
    try {
      const ok = await onToggleTask(taskId);
      if (!ok) setError('Não foi possível alterar a tarefa. Tente novamente.');
      return ok;
    } catch {
      setError('Não foi possível alterar a tarefa. Tente novamente.');
      return false;
    } finally { setBusyTaskId(null); }
  }

  return <section aria-label="Área de tarefas" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-slate-900">Checklist de Tarefas</h3>
      <div className="flex gap-2">
        <label className="text-sm">Agrupar por <select aria-label="Agrupar tarefas por"
          value={groupBy} onChange={event => setGroupBy(event.target.value as 'stage' | 'due')}
          className="rounded-md border px-2 py-1"><option value="stage">Etapa</option>
          <option value="due">Prazo</option></select></label>
        <button type="button" onClick={() => setShowFrontEditor(value => !value)}
          className="rounded-md border px-2 py-1 text-sm">{showFrontEditor ? 'Fechar Frentes' : 'Editar Frentes'}</button>
      </div>
    </div>
    {showFrontEditor && <FrontEditor orderId={orderId} fronts={fronts} tasks={tasks}
      onSave={onSaveFront} onRemove={onRemoveFront} onReorder={onReorderFront} />}
    <OrderTaskList tasks={tasks} fronts={fronts} groupBy={groupBy} today={today} members={members}
      commentsByTask={commentsByTask}
      onOpenTask={onFocusTask} onToggleTask={id => void toggle(id)} busyTaskId={busyTaskId}
      onAddTaskInFront={id => { setFrontId(id); document.getElementById('new-order-task')?.focus(); }} />
    {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    <form onSubmit={event => void create(event)} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <h4 className="font-semibold">Nova tarefa</h4>
      <input id="new-order-task" aria-label="Título da nova tarefa" value={title}
        onChange={event => setTitle(event.target.value)} placeholder="Título" required
        className="w-full rounded-md border px-3 py-2 text-sm" />
      {fronts.length > 0 ? <label className="block text-sm">Frente da nova tarefa
        <select value={effectiveFrontId} onChange={event => setFrontId(event.target.value)} required
          className="ml-2 rounded-md border px-2 py-1.5 text-sm">
          <option value="">Escolha uma Frente</option>
          {fronts.map(front => <option key={front.id} value={front.id}>{front.name}</option>)}
        </select></label> : <p className="text-xs text-slate-600">A Frente Geral será criada automaticamente com a primeira tarefa.</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-sm">Responsável <select value={assigneeId} required
          onChange={event => setAssigneeId(event.target.value)} className="w-full rounded-md border px-2 py-1.5">
          <option value="">Escolha um membro</option>
          {members.map(member => <option key={member.userId} value={member.userId}>
            {member.displayName || `Membro sem nome · ${member.userId.slice(0, 8)}`}</option>)}
        </select></label>
        <label className="text-sm">Prazo <input type="date" value={dueDate}
          onChange={event => setDueDate(event.target.value)} className="w-full rounded-md border px-2 py-1.5" /></label>
      </div>
      <label className="block text-sm">Descrição (opcional)
        <textarea value={description} onChange={event => setDescription(event.target.value)} rows={2}
          className="w-full rounded-md border px-2 py-1.5" /></label>
      <button type="submit" disabled={busy || !title.trim() || !assigneeId || (fronts.length > 0 && !effectiveFrontId)}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Adicionando...' : 'Adicionar tarefa'}</button>
    </form>
    {selectedTask && <TaskDetailDrawer key={`${selectedTask.id}:${selectedTask.updatedAt ?? ''}`}
      taskId={selectedTask.id} orderId={orderId} task={selectedTask} fronts={fronts}
      members={members} subtasks={subtasks.filter(item => item.taskId === selectedTask.id)}
      comments={commentsByTask[selectedTask.id] ?? []} dependencies={dependencies} orderTasks={tasks}
      today={today} onClose={onCloseTask} onChanged={onDetailChanged ?? (() => {})}
      onSaveTask={onSaveTask} onToggleTask={onToggleTask}
      onSaveSubtask={onSaveSubtask} onDeleteSubtask={id => onDeleteSubtask(selectedTask.id, id)}
      onAddNote={text => onAddNote(selectedTask.id, text)}
      onDeleteNote={id => onDeleteNote(selectedTask.id, id)}
      timelineEntries={timelineEntries?.length
        ? timelineEntries.filter(entry => entry.taskId === selectedTask.id) : undefined}
      onSaveUpdate={onSaveUpdate}
      attachments={attachments.filter(file => file.tarefa_id === selectedTask.id)}
      onUploadFiles={onUploadFiles} onOpenAttachment={onOpenAttachment}
      onDeleteAttachment={onDeleteAttachment}
      onAddDependency={id => onAddDependency(selectedTask.id, id)}
      onRemoveDependency={id => onRemoveDependency(selectedTask.id, id)}
      onDeleteTask={canManageOrder ? async id => { const ok = await onDeleteTask(id);
        if (ok) onCloseTask(); return ok; } : undefined} />}
  </section>;
}
