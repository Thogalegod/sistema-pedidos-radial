'use client';

import { useState } from 'react';
import type { AttachmentContext, StagedAttachment } from '@/lib/pedidos-tarefas/attachments';
import type { UpdateInput } from '@/lib/pedidos-tarefas/timeline';
import type { WriteResult } from '@/lib/pedidos-tarefas/types';

type UpdateContext = Pick<UpdateInput, 'orderId' | 'frontId' | 'taskId'>;
type Props = { context: UpdateContext; onSave: (input: UpdateInput) => Promise<WriteResult<string>>;
  onUpload?: (context: AttachmentContext, files: StagedAttachment[]) => Promise<boolean>;
  onSaved: () => void };

const MAX_FILE_SIZE = 10 * 1024 * 1024;
function accepted(file: File) { return file.size <= MAX_FILE_SIZE &&
  (file.type === 'application/pdf' || file.type.startsWith('image/')); }

export function UpdateComposer({ context, onSave, onUpload, onSaved }: Props) {
  const [text, setText] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [files, setFiles] = useState<StagedAttachment[]>([]);
  const [savedUpdateId, setSavedUpdateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpload = context.orderId !== null && Boolean(onUpload);

  function finish() {
    setText(''); setFollowUpDate(''); setFiles([]); setSavedUpdateId(null); setError(null); onSaved();
  }

  async function upload(updateId: string) {
    if (!onUpload || context.orderId === null || files.length === 0) return true;
    return onUpload({ ...context, orderId: context.orderId, updateId }, files);
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy || (!savedUpdateId && !text.trim())) return;
    setBusy(true); setError(null);
    let updatePersisted = Boolean(savedUpdateId);
    try {
      let updateId = savedUpdateId;
      if (!updateId) {
        const result = await onSave({ ...context, text: text.trim(),
          ...(context.taskId ? { followUpDate: followUpDate || null } : {}) });
        if (!result.ok) { setError(result.message); return; }
        updateId = result.value;
        updatePersisted = true;
        setSavedUpdateId(updateId);
      }
      if (!await upload(updateId)) {
        setError('A atualização foi salva, mas os arquivos não foram enviados. Reenvie sem duplicar o texto.');
        return;
      }
      finish();
    } catch {
      setError(updatePersisted
        ? 'A atualização foi salva, mas os arquivos não foram enviados. Reenvie sem duplicar o texto.'
        : 'Não foi possível salvar a atualização.');
    } finally { setBusy(false); }
  }

  return <form onSubmit={event => void submit(event)} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
    <label className="block text-sm font-medium text-slate-800">Nova atualização
      <textarea aria-label="Texto da atualização" rows={3} value={text} disabled={Boolean(savedUpdateId)}
        onChange={event => setText(event.target.value)} placeholder="Registre a informação importante…"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
    </label>
    {context.taskId && <label className="block text-sm font-medium text-slate-800">Follow-up (opcional)
      <input aria-label="Follow-up da atualização" type="date" value={followUpDate} disabled={Boolean(savedUpdateId)}
        onChange={event => setFollowUpDate(event.target.value)}
        className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm" />
    </label>}
    {canUpload && <label className="block text-sm font-medium text-slate-800">Arquivos (opcional)
      <input aria-label="Arquivos da atualização" type="file" multiple accept="image/*,application/pdf"
        disabled={Boolean(savedUpdateId)} onChange={event => {
          const chosen = Array.from(event.target.files ?? []);
          const valid = chosen.filter(accepted);
          setFiles(valid.map(file => ({ file, caption: '' })));
          setError(valid.length === chosen.length ? null : 'Use imagens ou PDF de até 10 MB.');
          event.target.value = '';
        }} className="mt-1 block w-full text-sm" />
    </label>}
    {files.length > 0 && <ul className="space-y-1 text-xs text-slate-600">
      {files.map(item => <li key={`${item.file.name}:${item.file.size}`}>{item.file.name}</li>)}
    </ul>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={busy || (!savedUpdateId && !text.trim())}
      className="rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? 'Salvando…' : savedUpdateId ? 'Reenviar arquivos' : 'Salvar atualização'}
    </button>
  </form>;
}
