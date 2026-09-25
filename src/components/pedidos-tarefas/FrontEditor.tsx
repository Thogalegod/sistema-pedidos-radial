'use client';

import { useState } from 'react';
import type { Front, TaskV1 } from '@/lib/pedidos-tarefas/types';

export function FrontEditor({ orderId, fronts, tasks, onSave, onRemove, onReorder }: { orderId: string; fronts: Front[]; tasks: TaskV1[];
  onSave: (front: Front) => Promise<boolean>;
  onRemove: (frontId: string, destinationId: string | null) => Promise<boolean>;
  onReorder: (frontId: string, direction: 'up' | 'down') => Promise<boolean> }) {
  const [newName, setNewName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ordered = [...fronts].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  async function run(action: () => Promise<boolean>) {
    if (busy) return false;
    setBusy(true); setError(null);
    try {
      const ok = await action();
      if (!ok) setError('Não foi possível salvar a Frente. Recarregue e tente novamente.');
      return ok;
    } catch {
      setError('Não foi possível salvar a Frente. Recarregue e tente novamente.');
      return false;
    } finally { setBusy(false); }
  }

  return <section aria-label="Editar Frentes" className="space-y-3 rounded-lg border border-slate-200 p-3">
    <h4 className="font-semibold text-slate-800">Frentes do Pedido</h4>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {ordered.map((front, index) => {
      const taskCount = tasks.filter(task => task.frontId === front.id).length;
      const destination = destinations[front.id] || '';
      return <div key={front.id} className="space-y-2 rounded-md border p-2">
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Nome da Frente ${front.name}`} value={names[front.id] ?? front.name}
            onChange={event => setNames(previous => ({ ...previous, [front.id]: event.target.value }))}
            className="min-w-36 flex-1 rounded-md border px-2 py-1.5 text-sm" />
          <button type="button" disabled={busy || !(names[front.id] ?? front.name).trim()}
            onClick={() => void run(() => onSave({ ...front, name: (names[front.id] ?? front.name).trim() }))}
            className="text-sm text-blue-700">Salvar nome</button>
          <button type="button" disabled={busy || index === 0} aria-label={`Subir Frente ${front.name}`}
            onClick={() => void run(() => onReorder(front.id, 'up'))} className="text-sm">↑</button>
          <button type="button" disabled={busy || index === ordered.length - 1} aria-label={`Descer Frente ${front.name}`}
            onClick={() => void run(() => onReorder(front.id, 'down'))} className="text-sm">↓</button>
        </div>
        {taskCount > 0 && <label className="block text-xs text-slate-600">Mover tarefas de {front.name} para
          <select value={destination} onChange={event => setDestinations(previous => ({ ...previous,
            [front.id]: event.target.value }))} className="ml-2 rounded-md border p-1 text-sm">
            <option value="">Escolha a Frente de destino</option>
            {ordered.filter(other => other.id !== front.id).map(other =>
              <option key={other.id} value={other.id}>{other.name}</option>)}
          </select></label>}
        <button type="button" disabled={busy} aria-label={`Remover Frente ${front.name}`}
          onClick={() => {
            if (taskCount > 0 && !destination) {
              setError('Escolha uma Frente de destino para preservar as tarefas.'); return;
            }
            const message = taskCount > 0
              ? `Remover Frente "${front.name}"? ${taskCount} tarefa(s) serão movidas para a Frente escolhida; notas e subtarefas serão preservadas.`
              : `Remover Frente "${front.name}"?`;
            if (window.confirm(message)) void run(() => onRemove(front.id, destination || null));
          }} className="text-sm text-red-700">Remover Frente</button>
      </div>;
    })}
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); if (!newName.trim()) return;
      const position = ordered.length ? ordered[ordered.length - 1].position + 1 : 0;
      void run(() => onSave({ id: '', orderId, name: newName.trim(), position }))
        .then(ok => { if (ok) setNewName(''); }); }}>
      <input aria-label="Nome da nova Frente" value={newName} onChange={event => setNewName(event.target.value)}
        className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-sm" />
      <button type="submit" disabled={busy || !newName.trim()} className="rounded-md border px-3 text-sm">Criar Frente</button>
    </form>
  </section>;
}
