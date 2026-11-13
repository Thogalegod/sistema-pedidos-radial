'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { canonicalCrop, FULL_PHOTO, moveCrop, type CropHandle, type PhotoCrop } from '@/lib/termografia/photo-crop';
import { buttonClass, primaryClass } from './collectorStyles';

export function DigitalPhotoCropper({ src, crop, hasDrawings, onSave, onCancel }: {
  src: string; crop?: PhotoCrop; hasDrawings: boolean;
  onSave: (crop?: PhotoCrop) => Promise<boolean>; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState(crop ?? FULL_PHOTO);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ pointerId: number; handle: CropHandle; x: number; y: number; bounds: DOMRect; start: PhotoCrop } | null>(null);
  const changed = JSON.stringify(canonicalCrop(selection)) !== JSON.stringify(canonicalCrop(crop));
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-crop-handle]')?.dataset.cropHandle as CropHandle | undefined;
    if (!handle || !loaded || saving || drag.current) return;
    event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, handle, x: event.clientX, y: event.clientY, bounds: event.currentTarget.getBoundingClientRect(), start: selection };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current; if (!active || active.pointerId !== event.pointerId) return;
    setSelection(moveCrop(active.start, active.handle, (event.clientX - active.x) / active.bounds.width, (event.clientY - active.y) / active.bounds.height));
  };
  const apply = async () => {
    if (!loaded || saving || !changed) return;
    setSaving(true); setError('');
    try {
      if (await onSave(canonicalCrop(selection))) onCancel();
      else setError('Não foi possível salvar o recorte. A foto original está preservada. Tente novamente.');
    } catch { setError('Não foi possível salvar o recorte. A foto original está preservada. Tente novamente.'); }
    finally { setSaving(false); }
  };
  const keyboard = (event: KeyboardEvent, handle: CropHandle) => {
    if (!loaded || saving || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    setSelection(current => moveCrop(current, handle, event.key === 'ArrowLeft' ? -.02 : event.key === 'ArrowRight' ? .02 : 0, event.key === 'ArrowUp' ? -.02 : event.key === 'ArrowDown' ? .02 : 0));
  };
  return <dialog ref={dialog} aria-label="Recortar foto digital" onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}
    className="fixed inset-0 m-auto max-h-[95dvh] w-[calc(100%_-_1rem)] max-w-2xl overflow-auto rounded-2xl bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/70">
    <h2 className="text-xl font-semibold">Recortar foto digital</h2>
    <p className="mt-2 text-sm text-slate-600">Arraste os cantos para enquadrar. Arraste o centro para mover a área. A parte escura fica fora do relatório.</p>
    <div className="my-3 flex justify-center rounded-xl bg-slate-900 p-6">
      <div className="relative inline-block max-w-full select-none" style={{ touchAction: 'none' }}
        onPointerDown={start} onPointerMove={move} onPointerUp={event => { move(event); drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto inteira para recortar" draggable={false} style={{ display: 'block', maxWidth: '100%', maxHeight: '50dvh', width: 'auto', height: 'auto' }}
          onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setError('Esta foto não abriu. Cancele e escolha uma imagem compatível.'); }} />
        {loaded && <>
          <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%`, boxShadow: '0 0 0 9999px rgb(0 0 0 / 65%)' }} /></div>
          <div className="absolute border-2 border-white" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }}>
            <button type="button" aria-label="Mover área do recorte" data-crop-handle="move" disabled={saving} onKeyDown={event => keyboard(event, 'move')} className="absolute inset-0 cursor-move bg-transparent focus-visible:outline-4 focus-visible:outline-blue-400" />
            {([['nw', 'superior esquerdo', '0%', '0%'], ['ne', 'superior direito', '100%', '0%'], ['sw', 'inferior esquerdo', '0%', '100%'], ['se', 'inferior direito', '100%', '100%']] as const).map(([handle, name, left, top]) =>
              <button key={handle} type="button" aria-label={`Canto ${name}`} data-crop-handle={handle} disabled={saving} onKeyDown={event => keyboard(event, handle)}
                className="absolute flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-4 focus-visible:outline-blue-400" style={{ left, top, transform: 'translate(-50%, -50%)', cursor: `${handle}-resize` }}>
                <span className="h-4 w-4 rounded-sm border-2 border-white bg-blue-600 shadow" />
              </button>)}
          </div>
        </>}
      </div>
    </div>
    <p className="text-xs text-slate-600">O original fica guardado nesta coleta. Use Foto inteira para desfazer o recorte.</p>
    {changed && hasDrawings && <p role="note" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ao aplicar, os desenhos desta foto serão limpos para você refazê-los no novo enquadramento. As descrições das ocorrências serão mantidas.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={saving} onClick={() => setSelection(FULL_PHOTO)}>Foto inteira</button>
      <button type="button" className={buttonClass} disabled={saving} onClick={onCancel}>Cancelar</button>
      <button type="button" className={`${primaryClass} flex-1`} disabled={!loaded || saving || !changed} onClick={() => void apply()}>{saving ? 'Salvando…' : changed && hasDrawings ? 'Aplicar e limpar desenhos' : 'Aplicar recorte'}</button>
    </div>
  </dialog>;
}
