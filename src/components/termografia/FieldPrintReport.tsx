'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { TermografiaRelatorio } from '@/lib/termografia/types';
import { buildPrintReport } from '@/lib/termografia/print-report';
import { useSignedPhotos } from './FieldReportPhotos';
import { PrintReportDocument } from './PrintReportDocument';

function subscribeResize(callback: () => void) { window.addEventListener('resize', callback); return () => window.removeEventListener('resize', callback); }
export function FieldPrintReport({ report }: { report: TermografiaRelatorio }) {
  const [retry, setRetry] = useState(0);
  const [decodeError, setDecodeError] = useState(false);
  const [layoutError, setLayoutError] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const failure = useRef(false), attempt = useRef(0), container = useRef<HTMLDivElement>(null);
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 900);
  const model = useMemo(() => buildPrintReport(report), [report]);
  const files = model.files;
  const photos = useSignedPhotos(files, retry);
  const error = photos.error || (decodeError ? 'Uma foto não abriu corretamente. Recarregue as fotos antes de imprimir.' : undefined)
    || (layoutError ? 'Uma página excedeu o espaço disponível. Revise os textos muito longos antes de imprimir para evitar cortes.' : undefined);
  async function print() {
    const generation = ++attempt.current, root = container.current;
    const expected = new Set(files.map(file => file.id));
    const assertCurrent = () => {
      if (!root?.isConnected || container.current !== root || generation !== attempt.current || failure.current) throw new Error('A impressão foi interrompida.');
      const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-report-photo-id]'));
      const present = new Set(images.map(image => image.dataset.reportPhotoId));
      // A digital photo can intentionally accompany several thermograms. Every original is required.
      if ([...expected].some(id => !present.has(id)) || images.some(image => !expected.has(image.dataset.reportPhotoId ?? ''))) throw new Error('Conjunto de fotos incompleto.');
      return images;
    };
    setPrinting(true); setLayoutError(false);
    try {
      assertCurrent();
      await document.fonts?.ready;
      const images = assertCurrent();
      for (const image of Array.from(root!.querySelectorAll<HTMLImageElement>('img'))) {
        if (typeof image.decode === 'function') await image.decode();
        else if (!image.complete || !image.naturalWidth) throw new Error('Imagem incompleta');
      }
      assertCurrent();
      setLoaded(new Set(expected));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const current = assertCurrent();
      if (images.some(image => !current.includes(image))) throw new Error('As fotos mudaram durante a preparação.');
      const overflowing = Array.from(root!.querySelectorAll('.tr-sheet')).some(sheet => { const rect = sheet.getBoundingClientRect(); return rect.width > 0 && rect.height > rect.width * 297 / 210 + 2; });
      if (overflowing) { setLayoutError(true); return; }
      window.print();
    } catch { if (generation === attempt.current && container.current === root && root?.isConnected) { failure.current = true; setDecodeError(true); } }
    finally { if (generation === attempt.current && container.current === root && root?.isConnected) setPrinting(false); }
  }
  return <main className="field-report-print min-h-screen bg-slate-100 text-slate-900">
    <div className="sticky top-0 z-30 mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 print:hidden">
      <a href={`/termografia/${report.id}`} className="flex min-h-11 items-center text-blue-700">← Voltar</a>
      <button type="button" onClick={print} disabled={photos.loading || !!error || printing} className="min-h-11 rounded-xl bg-blue-700 px-4 font-medium text-white disabled:opacity-50">{printing ? 'Conferindo imagens…' : 'Imprimir / salvar PDF'}</button>
      {photos.loading && <p className="w-full text-sm text-slate-600">Preparando todas as fotos para o relatório…</p>}
      {!photos.loading && !error && <p className="w-full text-xs text-slate-500">{model.totalPages} páginas · Na impressão, use papel A4 e desative os cabeçalhos e rodapés do navegador.</p>}
      {error && <div role="alert" className="w-full rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" onClick={() => { attempt.current++; failure.current = false; setPrinting(false); setDecodeError(false); setLayoutError(false); setLoaded(new Set()); setRetry(retry + 1); }} className="ml-2 min-h-11 underline">Recarregar fotos</button></div>}
    </div>
    <div ref={container} className="tr-preview mx-auto w-fit max-w-full p-4">
      {(photos.loading || error || files.some(file => !loaded.has(file.id))) && <p className="hidden border-2 border-red-600 p-4 font-bold text-red-800 print:block">RELATÓRIO INCOMPLETO: confira o carregamento de todas as fotos e use o botão Imprimir / salvar PDF.</p>}
      <PrintReportDocument key={retry} report={report} model={model} urls={photos.urls} scale={Math.min(1, (width - 32) / (210 * 96 / 25.4))} onLoad={id => setLoaded(previous => new Set([...previous, id]))} onError={() => { failure.current = true; setDecodeError(true); }} />
    </div>
  </main>;
}
