'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dependency, Front, Member, Subtask, TaskV1, WaitingType } from '@/lib/pedidos-tarefas/types';
import type { TaskPatch, SubtaskInput } from '@/lib/pedidos-tarefas/commands';
import type { ComentarioTarefa } from '@/types';
import { blockedCount, subtaskProgress } from '@/lib/pedidos-tarefas/indicators';
import { pendingRuleLabel } from '@/lib/pedidos-tarefas/template-dates';
import { TaskSignals } from './TaskSignals';

type Props = { taskId: string; orderId: string | null; task: TaskV1;
  fronts: Front[]; members: Member[]; subtasks: Subtask[]; comments: ComentarioTarefa[];
  dependencies: Dependency[]; orderTasks: TaskV1[]; today: string;
  onClose: () => void; onChanged: () => void;
  onSaveTask: (taskId: string, patch: TaskPatch) => Promise<boolean>;
  onSaveSubtask: (input: SubtaskInput) => Promise<boolean>;
  onDeleteSubtask: (id: string) => Promise<boolean>;
  onAddNote: (text: string) => Promise<boolean>;
  onDeleteNote: (id: string) => Promise<boolean>;
  onToggleTask: (taskId: string) => Promise<boolean>;
  onAddDependency: (predecessorId: string) => Promise<boolean>;
  onRemoveDependency: (predecessorId: string) => Promise<boolean>;
  onDeleteTask?: (taskId: string) => Promise<boolean> };

const priorities = ['Urgente', 'Alta', 'Normal', 'Baixa'] as const;
const waitingOptions: Array<{ value: WaitingType; label: string }> = [
  { value: 'customer', label: 'Cliente' }, { value: 'utility', label: 'Concessionária' },
  { value: 'supplier', label: 'Fornecedor' }, { value: 'internal_user', label: 'Pessoa interna' },
  { value: 'other', label: 'Outro' },
];
const field = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

export function TaskDetailDrawer({ taskId, orderId, task, fronts, members, subtasks, comments,
  dependencies, orderTasks, today, onClose, onChanged, onSaveTask, onSaveSubtask,
  onDeleteSubtask, onAddNote, onDeleteNote, onToggleTask, onAddDependency,
  onRemoveDependency, onDeleteTask }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [frontId, setFrontId] = useState(task.frontId ?? '');
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [followUpDate, setFollowUpDate] = useState(task.followUpDate ?? '');
  const [waitingType, setWaitingType] = useState<WaitingType | ''>(task.waiting?.type ?? '');
  const [waitingUserId, setWaitingUserId] = useState(task.waiting?.userId ?? '');
  const [waitingNote, setWaitingNote] = useState(task.waiting?.note ?? '');
  const [newSubtask, setNewSubtask] = useState('');
  const [newNote, setNewNote] = useState('');
  const [predecessorId, setPredecessorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  const blocked = blockedCount(taskId, orderTasks, dependencies);
  const progress = subtaskProgress(subtasks);
  const predecessorIds = new Set(dependencies.filter(edge => edge.taskId === taskId)
    .map(edge => edge.predecessorId));
  const candidates = orderTasks.filter(item => item.id !== taskId && !predecessorIds.has(item.id));
  const relativeLabel = (rule: TaskV1['dueRule']) => {
    if (rule?.state !== 'pending') return null;
    const source = orderTasks.find(item => item.id === rule.sourceTaskId);
    return pendingRuleLabel(rule, source?.title ?? 'tarefa de origem');
  };
  const lastNote = comments.filter(note => !note.event_type)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];

  async function run(action: () => Promise<boolean>, message: string) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const ok = await action();
      if (!ok) { setError(message); return false; }
      onChanged();
      return true;
    } catch {
      setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || (orderId && !frontId) || (status === 'Aguardando' &&
      (!waitingType || (waitingType === 'internal_user' && !waitingUserId)))) {
      setError('Preencha título, Frente e os dados obrigatórios de espera.');
      return;
    }
    const patch: TaskPatch = { title: title.trim(), description: description.trim() || null,
      frontId: orderId ? frontId : null, status, priority, assigneeId: assigneeId || null,
      dueDate: dueDate || null, followUpDate: followUpDate || null,
      waiting: status === 'Aguardando' && waitingType
        ? { type: waitingType, userId: waitingType === 'internal_user' ? waitingUserId : null,
          note: waitingNote.trim() || null } : null };
    await run(() => onSaveTask(taskId, patch), 'Não foi possível salvar a tarefa. Seus dados continuam no formulário.');
  }

  async function toggleCompletion() {
    if (task.status !== 'Concluída' && (blocked > 0 || progress.completed < progress.total) &&
      !window.confirm('Há subtarefas ou predecessoras abertas. Concluir esta tarefa mesmo assim?')) return;
    await run(() => onToggleTask(taskId), 'Não foi possível alterar a conclusão da tarefa.');
  }

  return <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Detalhe da tarefa"
      className="h-full w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-2xl space-y-5"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="flex items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-wide text-slate-500">
          {orderId ? 'Pedido · Tarefa' : 'Tarefa avulsa'}</p>
          <h3 className="text-xl font-semibold text-slate-900">{task.title}</h3></div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Fechar detalhe da tarefa"
          className="rounded-md border px-3 py-1.5 text-sm">Fechar</button>
      </header>
      <TaskSignals task={task} members={members} today={today}
        lastUpdate={lastNote ? { text: lastNote.texto, at: lastNote.criado_em } : null}
        nextAction={null} />
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void toggleCompletion()}
          className="rounded-md border border-blue-300 px-3 py-2 text-sm text-blue-800 disabled:opacity-50">
          {task.status === 'Concluída' ? 'Reabrir tarefa' : 'Concluir tarefa'}
        </button>
        {onDeleteTask && <button type="button" disabled={busy} onClick={() => {
          if (window.confirm('Excluir esta tarefa? Subtarefas e notas vinculadas serão removidas.'))
            void run(() => onDeleteTask(taskId), 'Não foi possível excluir a tarefa.');
        }} className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700">Excluir tarefa</button>}
      </div>
      {(blocked > 0 || progress.ready) && <p className="text-sm text-amber-800">
        {blocked > 0 ? `Bloqueada por ${blocked} tarefa(s) não concluída(s). ` : ''}
        {progress.ready ? 'Subtarefas concluídas — pronta para concluir.' : ''}
      </p>}
      <form onSubmit={event => void saveTask(event)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-medium">Título da tarefa
          <input className={field} value={title} onChange={event => setTitle(event.target.value)} required /></label>
        {orderId ? <label className="text-sm font-medium">Frente da tarefa
          <select className={field} value={frontId} onChange={event => setFrontId(event.target.value)} required>
            <option value="">Escolha uma Frente</option>
            {fronts.map(front => <option key={front.id} value={front.id}>{front.name}</option>)}
          </select></label> : <p className="text-sm text-slate-600">Sem vínculo com Pedido ou Frente.</p>}
        <label className="text-sm font-medium">Status da tarefa
          <select className={field} value={status} disabled={task.status === 'Concluída'}
            onChange={event => setStatus(event.target.value as TaskV1['status'])}>
            <option value="Aberta">Aberta</option><option value="Em andamento">Em andamento</option>
            <option value="Aguardando">Aguardando</option>
            {task.status === 'Concluída' && <option value="Concluída">Concluída</option>}
          </select></label>
        <label className="text-sm font-medium">Prioridade da tarefa
          <select className={field} value={priority}
            onChange={event => setPriority(event.target.value as TaskV1['priority'])}>
            {priorities.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        <label className="text-sm font-medium">Responsável
          <select className={field} value={assigneeId} onChange={event => setAssigneeId(event.target.value)}>
            <option value="">Não definido</option>
            {members.map(member => <option key={member.userId} value={member.userId}>
              {member.displayName || `Membro sem nome · ${member.userId.slice(0, 8)}`}</option>)}
          </select></label>
        <label className="text-sm font-medium">Prazo
          <input type="date" className={field} value={dueDate}
            onChange={event => setDueDate(event.target.value)} />
          {relativeLabel(task.dueRule) && <span className="block text-xs font-normal text-blue-700">{relativeLabel(task.dueRule)}</span>}
        </label>
        <label className="text-sm font-medium">Follow-up
          <input type="date" className={field} value={followUpDate}
            onChange={event => setFollowUpDate(event.target.value)} />
          {relativeLabel(task.followUpRule) && <span className="block text-xs font-normal text-blue-700">{relativeLabel(task.followUpRule)}</span>}
        </label>
        {status === 'Aguardando' && <>
          <label className="text-sm font-medium">Aguardando de
            <select className={field} value={waitingType} required
              onChange={event => { setWaitingType(event.target.value as WaitingType | ''); setWaitingUserId(''); }}>
              <option value="">Escolha</option>
              {waitingOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select></label>
          {waitingType === 'internal_user' && <label className="text-sm font-medium">Pessoa interna aguardada
            <select className={field} value={waitingUserId} required
              onChange={event => setWaitingUserId(event.target.value)}>
              <option value="">Escolha um membro</option>
              {members.map(member => <option key={member.userId} value={member.userId}>
                {member.displayName || `Membro sem nome · ${member.userId.slice(0, 8)}`}</option>)}
            </select></label>}
          <label className="sm:col-span-2 text-sm font-medium">Complemento da espera
            <input className={field} value={waitingNote}
              onChange={event => setWaitingNote(event.target.value)} /></label>
        </>}
        <label className="sm:col-span-2 text-sm font-medium">Descrição
          <textarea className={field} rows={3} value={description}
            onChange={event => setDescription(event.target.value)} /></label>
        <button type="submit" disabled={busy || !title.trim() || Boolean(orderId && !frontId)}
          className="sm:col-span-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Salvando...' : 'Salvar tarefa'}</button>
      </form>
      <section aria-label="Subtarefas" className="space-y-2 border-t pt-4">
        <h4 className="font-semibold">Subtarefas</h4>
        {subtasks.map(subtask => <div key={subtask.id} className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-md border p-2 sm:grid-cols-[auto_1fr_auto_auto_auto]">
          <input type="checkbox" checked={subtask.completed} disabled={busy}
            aria-label={`Concluir subtarefa ${subtask.title}`}
            onChange={() => void run(() => onSaveSubtask({ id: subtask.id, taskId,
              patch: { completed: !subtask.completed } }), 'Não foi possível atualizar a subtarefa.')} />
          <span className={subtask.completed ? 'line-through text-slate-500' : ''}>{subtask.title}</span>
          <input type="date" value={subtask.dueDate ?? ''} disabled={busy}
            aria-label={`Prazo da subtarefa ${subtask.title}`}
            onChange={event => void run(() => onSaveSubtask({ id: subtask.id, taskId,
              patch: { dueDate: event.target.value || null } }), 'Não foi possível atualizar a subtarefa.')} />
          {relativeLabel(subtask.dueRule) && <span className="text-xs text-blue-700">{relativeLabel(subtask.dueRule)}</span>}
          <select value={subtask.priority ?? ''} disabled={busy}
            aria-label={`Prioridade da subtarefa ${subtask.title}`}
            onChange={event => void run(() => onSaveSubtask({ id: subtask.id, taskId,
              patch: { priority: event.target.value ? event.target.value as TaskV1['priority'] : null } }),
            'Não foi possível atualizar a subtarefa.')}>
            <option value="">Sem prioridade</option>
            {priorities.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <button type="button" disabled={busy} aria-label={`Excluir subtarefa ${subtask.title}`}
            onClick={() => { if (window.confirm(`Excluir subtarefa "${subtask.title}"?`))
              void run(() => onDeleteSubtask(subtask.id), 'Não foi possível excluir a subtarefa.'); }}
            className="text-sm text-red-700">Excluir</button>
        </div>)}
        <form className="flex gap-2" onSubmit={event => { event.preventDefault();
          if (newSubtask.trim()) void run(() => onSaveSubtask({ id: null, taskId,
            patch: { title: newSubtask.trim(), completed: false } }),
          'Não foi possível criar a subtarefa.').then(ok => { if (ok) setNewSubtask(''); }); }}>
          <input className={field} aria-label="Nova subtarefa" value={newSubtask}
            onChange={event => setNewSubtask(event.target.value)} />
          <button type="submit" disabled={busy || !newSubtask.trim()} className="rounded-md border px-3 text-sm">Adicionar</button>
        </form>
      </section>
      {orderId && <section aria-label="Predecessoras" className="space-y-2 border-t pt-4">
        <h4 className="font-semibold">Depende de</h4>
        {dependencies.filter(edge => edge.taskId === taskId).map(edge => {
          const predecessor = orderTasks.find(item => item.id === edge.predecessorId);
          return <div key={edge.predecessorId} className="flex items-center justify-between gap-2 text-sm">
            <span>{predecessor?.title ?? 'Tarefa indisponível'}</span>
            <button type="button" disabled={busy} onClick={() => void run(
              () => onRemoveDependency(edge.predecessorId), 'Não foi possível remover a dependência.')}
              className="text-red-700">Remover</button></div>;
        })}
        {candidates.length > 0 && <div className="flex gap-2">
          <select className={field} aria-label="Adicionar predecessora" value={predecessorId}
            onChange={event => setPredecessorId(event.target.value)}>
            <option value="">Escolha uma tarefa do Pedido</option>
            {candidates.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button type="button" disabled={busy || !predecessorId} onClick={() => void run(
            () => onAddDependency(predecessorId), 'Não foi possível adicionar a dependência.')
            .then(ok => { if (ok) setPredecessorId(''); })}
            className="rounded-md border px-3 text-sm">Vincular</button>
        </div>}
      </section>}
      <section aria-label="Notas de campo" className="space-y-2 border-t pt-4">
        <h4 className="font-semibold">Notas de campo</h4>
        {comments.map(note => <div key={note.id} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
          <div className="flex justify-between gap-2"><span>{note.usuario} · {note.criado_em}</span>
            {note.event_type ? <span className="text-xs font-medium uppercase text-amber-800">Sistema</span> :
            <button type="button" disabled={busy} aria-label={`Excluir nota de campo ${note.texto}`}
              onClick={() => { if (window.confirm(`Excluir nota de campo "${note.texto}"?`))
                void run(() => onDeleteNote(note.id), 'Não foi possível excluir a nota.'); }}
              className="text-red-700">Excluir</button>}</div>
          <p>{note.texto}</p></div>)}
        <form onSubmit={event => { event.preventDefault(); if (newNote.trim())
          void run(() => onAddNote(newNote.trim()), 'Não foi possível salvar a nota.')
            .then(ok => { if (ok) setNewNote(''); }); }} className="space-y-2">
          <textarea className={field} aria-label="Nova nota de campo" value={newNote}
            onChange={event => setNewNote(event.target.value)} rows={2} />
          <button type="submit" disabled={busy || !newNote.trim()} className="rounded-md border px-3 py-1.5 text-sm">Salvar nota</button>
        </form>
      </section>
      {orderId && <p className="sr-only">Pedido {orderId}</p>}
    </section>
  </div>;
}
