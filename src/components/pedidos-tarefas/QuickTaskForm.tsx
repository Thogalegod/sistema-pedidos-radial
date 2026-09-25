'use client';

import { useState } from 'react';
import { formatMemberLabel } from '@/lib/pedidos-tarefas/members';
import type { Id, Member } from '@/lib/pedidos-tarefas/types';

export type QuickTaskDraft = { title: string; assigneeId: Id };

export function QuickTaskForm({ members, onCreate }: {
  members: Member[];
  onCreate: (input: QuickTaskDraft) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !assigneeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await onCreate({ title: title.trim(), assigneeId });
      if (created) setTitle('');
      else setError('Não foi possível criar a tarefa. Os dados continuam no formulário.');
    } catch {
      setError('Não foi possível criar a tarefa. Os dados continuam no formulário.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={event => void submit(event)}
    className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)_auto] sm:items-end">
    <label className="text-sm font-medium text-slate-800">Título da tarefa rápida
      <input value={title} onChange={event => setTitle(event.target.value)} required
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        placeholder="Ex.: Confirmar entrega" />
    </label>
    <label className="text-sm font-medium text-slate-800">Responsável da tarefa rápida
      <select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} required
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        <option value="">Escolha um membro</option>
        {members.map(member => <option key={member.userId} value={member.userId}>
          {formatMemberLabel(member)}
        </option>)}
      </select>
    </label>
    <button type="submit" disabled={busy || !title.trim() || !assigneeId}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? 'Criando…' : 'Criar tarefa rápida'}
    </button>
    {error && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{error}</p>}
    {members.length === 0 && <p role="status" className="text-sm text-amber-800 sm:col-span-3">
      Cadastre ao menos um membro antes de criar uma tarefa rápida.
    </p>}
  </form>;
}
