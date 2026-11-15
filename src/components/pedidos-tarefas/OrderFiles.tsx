'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { Anexo } from '@/types';
import type { AttachmentContext, StagedAttachment } from '@/lib/pedidos-tarefas/attachments';

type Props = { attachments: Anexo[]; context: AttachmentContext; showAllContexts?: boolean;
  onOpen?: (attachment: Anexo) => Promise<string | null>;
  onDelete?: (attachment: Anexo) => Promise<boolean>;
  onUpload?: (context: AttachmentContext, files: StagedAttachment[]) => Promise<boolean>;
  onChanged?: () => void };

function inContext(file: Anexo, context: AttachmentContext, showAll: boolean) {
  if (showAll) return true;
  if (context.updateId) return file.atividade_id === context.updateId;
  if (context.taskId) return file.tarefa_id === context.taskId;
  if (context.frontId) return file.frente_id === context.frontId && !file.tarefa_id;
  return !file.frente_id && !file.tarefa_id && !file.atividade_id;
}

function PhotoPreview({ file, onOpen }: { file: Anexo;
  onOpen: (attachment: Anexo) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void onOpen(file).then(signed => { if (active) setUrl(signed); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [file, onOpen]);
  return url ? <Image src={url} alt={file.nome_arquivo} width={400} height={240}
    unoptimized onError={() => setUrl(null)}
    className="mt-2 h-32 w-full rounded-md object-cover" />
    : <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-500">Prévia indisponível</p>;
}

export function OrderFiles({ attachments, context, showAllContexts = false, onOpen, onDelete,
  onUpload, onChanged }: Props) {
  const [files, setFiles] = useState<StagedAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = attachments.filter(file => inContext(file, context, showAllContexts));

  async function open(file: Anexo) {
    if (!onOpen) return;
    setError(null);
    try {
      const url = await onOpen(file);
      if (!url) { setError('Não foi possível abrir o arquivo.'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setError('Não foi possível abrir o arquivo.'); }
  }

  async function remove(file: Anexo) {
    if (!onDelete || !window.confirm(`Excluir o arquivo "${file.nome_arquivo}"?`)) return;
    setBusy(true); setError(null);
    try {
      if (!await onDelete(file)) { setError('Não foi possível excluir o arquivo.'); return; }
      onChanged?.();
    } catch { setError('Não foi possível excluir o arquivo.'); }
    finally { setBusy(false); }
  }

  async function upload() {
    if (!onUpload || files.length === 0) return;
    setBusy(true); setError(null);
    try {
      if (!await onUpload(context, files)) { setError('Não foi possível enviar os arquivos.'); return; }
      setFiles([]); onChanged?.();
    } catch { setError('Não foi possível enviar os arquivos.'); }
    finally { setBusy(false); }
  }

  return <section aria-label="Arquivos" className="space-y-3">
    {onUpload && <div className="rounded-lg border border-dashed border-slate-300 p-3">
      <label className="block text-sm font-medium">Adicionar imagens ou PDF (até 10 MB)
        <input type="file" multiple accept="image/*,application/pdf" disabled={busy}
          aria-label="Adicionar arquivos" className="mt-1 block w-full text-sm" onChange={event => {
            const chosen = Array.from(event.target.files ?? []);
            const valid = chosen.filter(file => file.size <= 10 * 1024 * 1024 &&
              (file.type === 'application/pdf' || file.type.startsWith('image/')));
            setFiles(valid.map(file => ({ file, caption: '' })));
            setError(valid.length === chosen.length ? null : 'Use imagens ou PDF de até 10 MB.');
            event.target.value = '';
          }} />
      </label>
      {files.length > 0 && <button type="button" disabled={busy} onClick={() => void upload()}
        className="mt-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Enviar {files.length} arquivo(s)
      </button>}
    </div>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    {visible.length === 0 ? <p className="text-sm italic text-slate-500">Nenhum arquivo neste contexto.</p>
      : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{visible.map(file => <article key={file.id}
        className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="truncate text-sm font-medium text-slate-900">{file.nome_arquivo}</p>
        {file.tipo.startsWith('image/') && onOpen && <PhotoPreview file={file} onOpen={onOpen} />}
        {file.legenda && <p className="mt-1 text-xs text-slate-600">{file.legenda}</p>}
        <div className="mt-3 flex gap-2">
          {onOpen && <button type="button" disabled={busy} onClick={() => void open(file)}
            aria-label={`Abrir arquivo ${file.nome_arquivo}`}
            className="rounded-md border px-2 py-1 text-xs text-blue-700">Abrir</button>}
          {onDelete && <button type="button" disabled={busy} onClick={() => void remove(file)}
            aria-label={`Excluir arquivo ${file.nome_arquivo}`}
            className="rounded-md border px-2 py-1 text-xs text-red-700">Excluir</button>}
        </div>
      </article>)}</div>}
  </section>;
}
