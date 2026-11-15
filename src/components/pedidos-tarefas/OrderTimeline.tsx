'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';
import type { TimelineEntry } from '@/lib/pedidos-tarefas/timeline';
import type { Anexo } from '@/types';
import type { Front, TaskV1 } from '@/lib/pedidos-tarefas/types';
import { OrderFiles } from './OrderFiles';

type Props = { entries: TimelineEntry[]; fronts?: Front[]; tasks?: TaskV1[];
  attachments?: Anexo[];
  onOpenAttachment?: (attachment: Anexo) => Promise<string | null>;
  onDeleteAttachment?: (attachment: Anexo) => Promise<boolean>;
  onChanged?: () => void;
  onDelete?: (id: string) => Promise<boolean> };

export function OrderTimeline({ entries, fronts = [], tasks = [], attachments = [],
  onOpenAttachment, onDeleteAttachment, onChanged, onDelete }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frontNames = new Map(fronts.map(front => [front.id, front.name]));
  const taskNames = new Map(tasks.map(task => [task.id, task.title]));

  async function remove(entry: TimelineEntry) {
    if (!onDelete || !window.confirm(`Excluir a atualização "${entry.text}"?`)) return;
    setDeletingId(entry.id); setError(null);
    try {
      if (!await onDelete(entry.id)) setError('Não foi possível excluir a atualização.');
    } catch {
      setError('Não foi possível excluir a atualização.');
    } finally { setDeletingId(null); }
  }

  if (entries.length === 0) return <p className="text-sm italic text-slate-500">Nenhuma atualização registrada.</p>;

  return <div className="space-y-3">
    {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    {entries.map(entry => {
      const linkedFiles = attachments.filter(file => file.atividade_id === entry.id);
      const context = [entry.frontId ? frontNames.get(entry.frontId) : null,
        entry.taskId ? taskNames.get(entry.taskId) : null].filter(Boolean).join(' · ');
      return <article key={entry.id} className={`rounded-lg border p-3 ${entry.kind === 'system'
        ? 'border-slate-200 bg-slate-50' : 'border-violet-200 bg-violet-50/60'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800">{entry.authorName}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-slate-600">
                {entry.kind === 'system' ? 'Sistema' : 'Atualização manual'}
              </span>
              <time className="text-slate-500">{format(parseISO(entry.at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</time>
            </div>
            {context && <p className="mt-1 text-xs font-medium text-violet-700">{context}</p>}
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{entry.text}</p>
            {entry.followUpDate && <p className="mt-2 text-xs text-blue-700">Follow-up · {formatDateLabel(entry.followUpDate)}</p>}
          </div>
          {entry.kind === 'manual' && onDelete && <button type="button" disabled={deletingId !== null}
            title="Deletar registro" aria-label={`Excluir atualização ${entry.text}`} onClick={() => void remove(entry)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
            {deletingId === entry.id ? 'Excluindo…' : 'Excluir'}
          </button>}
        </div>
        {entry.orderId && linkedFiles.length > 0 && <div className="mt-3 border-t border-slate-200 pt-3">
          <OrderFiles attachments={linkedFiles}
            context={{ orderId: entry.orderId, frontId: entry.frontId,
              taskId: entry.taskId, updateId: entry.id }}
            onOpen={onOpenAttachment} onDelete={onDeleteAttachment} onChanged={onChanged} />
        </div>}
      </article>;
    })}
  </div>;
}
