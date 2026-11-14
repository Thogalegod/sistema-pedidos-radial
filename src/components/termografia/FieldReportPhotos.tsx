'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import { createTermografiaSignedUrl } from '@/lib/termografia/storage';
import type { TermografiaArquivo, TermografiaPonto } from '@/lib/termografia/types';
import { DigitalAnnotationOverlay } from './DigitalAnnotationOverlay';

export const inspectionLabels = { pending: 'A inspecionar', inspected: 'Inspecionado', 'no-load': 'Sem carga', inaccessible: 'Não acessível' };
export function photoLabels(point: TermografiaPonto) {
  let digital = 0, thermal = 0;
  return new Map((point.arquivos ?? []).map(file => [file.id, file.tipo === 'digital' ? `D${++digital}` : `T${++thermal}`]));
}
export function useSignedPhotos(files: TermografiaArquivo[], retry = 0): { urls: Record<string, string>; loading: boolean; error?: string } {
  const key = JSON.stringify(files.map(file => [file.id, file.storagePath]));
  const [result, setResult] = useState<{ key: string; retry: number; urls: Record<string, string>; error?: string }>();
  useEffect(() => {
    let active = true;
    const entries: [string, string][] = JSON.parse(key);
    let next = 0;
    const urls: Record<string, string> = {};
    async function worker() {
      while (active && next < entries.length) {
        const [id, path] = entries[next++];
        urls[id] = await createTermografiaSignedUrl(supabase, path);
      }
    }
    Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker)).then(() => {
      if (active) setResult({ key, retry, urls });
    }).catch(() => { if (active) setResult({ key, retry, urls: {}, error: 'Não foi possível carregar todas as fotos. Confira a internet e tente novamente.' }); active = false; });
    return () => { active = false; };
  }, [key, retry]);
  return result?.key === key && result.retry === retry ? { ...result, loading: false } : { urls: {}, loading: true, error: undefined };
}

export function ReportPhoto({ file, point, label, url, showAnnotations = true, onError, onLoad }: {
  file: TermografiaArquivo; point: TermografiaPonto; label: string; url?: string; showAnnotations?: boolean; onError?: () => void; onLoad?: () => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const annotations = point.metadata?.annotations.filter(annotation => annotation.photoId === file.id) ?? [];
  return <figure className="field-report-photo min-w-0 rounded-xl border border-slate-200 bg-white p-3">
    <figcaption className="mb-2 text-sm font-semibold text-slate-700">{label} · {file.tipo === 'digital' ? 'Foto digital' : 'Foto térmica'}</figcaption>
    {url && failedUrl !== url ? <div className="field-photo-frame relative mx-auto w-full" style={file.width && file.height ? { '--field-print-width': `${125 * file.width / file.height}mm` } as CSSProperties : undefined}>
      {/* Preserve the complete image; overlay shares its intrinsic aspect ratio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} data-report-photo-id={file.id} alt={`Foto ${file.tipo === 'digital' ? 'digital' : 'térmica'} ${label} — ${point.local}`} className="block h-auto w-full" onLoad={onLoad} onError={() => { setFailedUrl(url); onError?.(); }} />
      {file.tipo === 'digital' && showAnnotations && <DigitalAnnotationOverlay annotations={annotations} hotspots={point.metadata?.hotspots} />}
    </div> : <p className="rounded-lg bg-amber-50 p-6 text-center text-sm text-amber-900">{failedUrl ? 'Esta foto não abriu. Recarregue antes de imprimir.' : 'Carregando foto…'}</p>}
  </figure>;
}

export function HotspotDescriptions({ point, photoIds }: { point: TermografiaPonto; photoIds?: string[] }) {
  const labels = photoLabels(point);
  const hotspots = point.metadata?.hotspots ?? [];
  return <div className="space-y-3">{hotspots.map((hotspot, index) => !photoIds || photoIds.includes(hotspot.photoId) ? <section key={hotspot.id} className="field-hotspot rounded-xl border border-orange-200 bg-orange-50/40 p-4">
    <h3 className="font-semibold text-slate-900">Aquecimento {index + 1} · Foto {labels.get(hotspot.photoId)}</h3>
    {hotspot.componente && <p className="mt-1 font-medium">{hotspot.componente}</p>}
    {hotspot.descricao && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{hotspot.descricao}</p>}
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {hotspot.temperatura && <div><dt className="inline text-slate-500">Temperatura: </dt><dd className="inline">{hotspot.temperatura}{/°|º|c$/i.test(hotspot.temperatura.trim()) ? '' : ' °C'}</dd></div>}
      {hotspot.classificacao && <div><dt className="inline text-slate-500">Classificação: </dt><dd className="inline">{hotspot.classificacao}</dd></div>}
      {hotspot.risco && <div><dt className="inline text-slate-500">Risco: </dt><dd className="inline">{hotspot.risco}</dd></div>}
    </dl>
    {hotspot.conclusao && <p className="mt-3 whitespace-pre-wrap break-words text-sm"><strong>Conclusão: </strong>{hotspot.conclusao}</p>}
  </section> : null)}</div>;
}
