'use client';

import { useRef, useState } from 'react';
import type { TermografiaRelatorio } from '@/lib/termografia/types';
import { HotspotDescriptions, inspectionLabels, photoLabels, ReportPhoto, useSignedPhotos } from './FieldReportPhotos';

export function FieldPrintReport({ report }: { report: TermografiaRelatorio }) {
  const [retry, setRetry] = useState(0);
  const [decodeError, setDecodeError] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const failure = useRef(false);
  const attempt = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const files = report.pontos.flatMap(point => point.arquivos ?? []);
  const photos = useSignedPhotos(files, retry);
  const error = photos.error || (decodeError ? 'Uma foto não abriu corretamente. Recarregue as fotos antes de imprimir.' : undefined);
  async function print() {
    const generation = ++attempt.current;
    const root = container.current;
    const expected = new Set(files.map(file => file.id));
    const assertCurrent = () => {
      if (!root?.isConnected || container.current !== root || generation !== attempt.current || failure.current) throw new Error('A impressão foi interrompida.');
      const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-report-photo-id]'));
      if (images.length !== expected.size || images.some(image => !expected.has(image.dataset.reportPhotoId ?? ''))) throw new Error('Conjunto de fotos incompleto.');
      return images;
    };
    setPrinting(true);
    try {
      assertCurrent();
      await document.fonts?.ready;
      const images = assertCurrent();
      for (const image of images) {
        if (typeof image.decode === 'function') await image.decode();
        else if (!image.complete || !image.naturalWidth) throw new Error('Imagem incompleta');
      }
      assertCurrent();
      setLoaded(new Set(expected));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const current = assertCurrent();
      if (images.some(image => !current.includes(image))) throw new Error('As fotos mudaram durante a preparação.');
      window.print();
    } catch { if (generation === attempt.current && container.current === root && root?.isConnected) { failure.current = true; setDecodeError(true); } }
    finally { if (generation === attempt.current && container.current === root && root?.isConnected) setPrinting(false); }
  }
  const hotspots = report.pontos.reduce((sum, point) => sum + (point.metadata?.hotspots.length ?? 0), 0);
  return <main className="field-report-print min-h-screen bg-slate-100 text-slate-900">
    <div className="sticky top-0 z-30 mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 print:hidden">
      <a href={`/termografia/${report.id}`} className="flex min-h-11 items-center text-blue-700">← Voltar</a>
      <button type="button" onClick={print} disabled={photos.loading || !!error || printing} className="min-h-11 rounded-xl bg-blue-700 px-4 font-medium text-white disabled:opacity-50">{printing ? 'Conferindo imagens…' : 'Imprimir / salvar PDF'}</button>
      {photos.loading && <p className="w-full text-sm text-slate-600">Preparando todas as fotos para o relatório…</p>}
      {error && <div role="alert" className="w-full rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" onClick={() => { attempt.current++; failure.current = false; setPrinting(false); setDecodeError(false); setLoaded(new Set()); setRetry(retry + 1); }} className="ml-2 min-h-11 underline">Recarregar fotos</button></div>}
    </div>
    <div ref={container} className="mx-auto max-w-4xl space-y-6 p-4 print:space-y-0 print:p-0">
      {(photos.loading || error || files.some(file => !loaded.has(file.id))) && <p className="hidden border-2 border-red-600 p-4 font-bold text-red-800 print:block">RELATÓRIO INCOMPLETO: confira o carregamento de todas as fotos e use o botão Imprimir / salvar PDF.</p>}
      <section className="field-report-sheet rounded-xl bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-800">Radial Energia</p>
        <h1 className="mt-3 text-3xl font-bold">Relatório de termografia</h1>
        <p className="mt-2 text-slate-500">{report.numero_relatorio} · Revisão {report.revisao}</p>
        <h2 className="mt-8 text-2xl font-semibold">{report.cliente_nome}</h2>
        <dl className="my-6 grid gap-3 border-y border-slate-200 py-5 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Data da inspeção</dt><dd>{report.data_execucao.split('-').reverse().join('/')}</dd></div>
          <div><dt className="text-slate-500">Câmera</dt><dd>{report.equipamento}</dd></div>
          <div><dt className="text-slate-500">Responsável</dt><dd>{report.responsavel_nome}{report.responsavel_crea ? ` · CREA ${report.responsavel_crea}` : ''}</dd></div>
          <div><dt className="text-slate-500">Local</dt><dd>{[report.cliente_endereco, report.cliente_cidade, report.cliente_uf].filter(Boolean).join(' · ')}</dd></div>
        </dl>
        {report.objetivo && <p className="mb-6 whitespace-pre-wrap text-sm">{report.objetivo}</p>}
        <h2 className="mb-3 text-lg font-semibold">Roteiro · {report.pontos.length} quadros · {hotspots} aquecimentos</h2>
        <table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b-2 border-slate-300"><th className="py-3 pr-2">Setor / quadro</th><th className="py-3 pr-2">Inspeção</th><th className="py-3">Aquecimentos</th></tr></thead><tbody>{report.pontos.map(point => <tr key={point.id} className="border-b border-slate-200"><td className="py-3 pr-2">{point.setor} · {point.local}</td><td className="py-3 pr-2">{point.metadata ? inspectionLabels[point.metadata.inspectionStatus] : ''}</td><td className="py-3">{point.metadata?.hotspots.length ?? 0}</td></tr>)}</tbody></table>
      </section>
      {report.pontos.flatMap((point, pointIndex) => {
        const labels = photoLabels(point);
        const files = point.arquivos ?? [];
        const groups = Array.from({ length: Math.max(1, Math.ceil(files.length / 2)) }, (_, index) => files.slice(index * 2, index * 2 + 2));
        return groups.map((group, index) => <section key={`${point.id}-${index}`} className="field-report-sheet rounded-xl bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">{report.numero_relatorio} · {report.cliente_nome}</p>
          <h2 className="mt-2 text-xl font-bold">{pointIndex + 1}. {point.setor} · {point.local}{groups.length > 1 ? ` (${index + 1}/${groups.length})` : ''}</h2>
          <p className="mt-1 text-sm text-slate-600">{point.metadata ? inspectionLabels[point.metadata.inspectionStatus] : ''}</p>
          {point.metadata?.inspectionReason && index === 0 && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm">{point.metadata.inspectionReason}</p>}
          <div className="my-5 grid items-start gap-4 sm:grid-cols-2 print:grid-cols-2">{group.map(file => <ReportPhoto key={`${file.id}-${retry}`} file={file} point={point} label={labels.get(file.id)!} url={photos.urls[file.id]} onLoad={() => setLoaded(previous => new Set([...previous, file.id]))} onError={() => { failure.current = true; setDecodeError(true); }} />)}</div>
          <HotspotDescriptions point={point} photoIds={group.map(file => file.id)} />
          {!point.metadata?.hotspots.length && index === 0 && <p className="text-sm text-slate-500">Sem aquecimentos registrados neste quadro.</p>}
        </section>);
      })}
    </div>
    <style>{`@media print { @page { size: A4; margin: 12mm; } .field-report-print { background: white; font-size: 10pt; } .field-report-sheet { width: auto; height: auto; min-height: 0; overflow: visible; margin: 0; border: 0; border-radius: 0; padding: 0; box-shadow: none; break-after: page; } .field-report-sheet:last-child { break-after: auto; } .field-report-photo { break-inside: avoid; } .field-report-photo .field-photo-frame { max-width: min(100%, var(--field-print-width, 100%)); } .field-report-photo img { height: auto; width: 100%; } .field-hotspot { break-inside: auto; margin-bottom: 4mm; } .field-report-print tr { break-inside: avoid; } .field-report-print thead { display: table-header-group; } .field-report-print h2,.field-report-print h3 { break-after: avoid; } }`}</style>
  </main>;
}
