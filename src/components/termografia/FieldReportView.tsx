'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TermografiaRelatorio } from '@/lib/termografia/types';
import { HotspotDescriptions, inspectionLabels, photoLabels, ReportPhoto, useSignedPhotos } from './FieldReportPhotos';

export function FieldReportView({ report }: { report: TermografiaRelatorio }) {
  const [selected, setSelected] = useState(report.pontos[0]?.id);
  const [search, setSearch] = useState('');
  const [original, setOriginal] = useState(false);
  const [retry, setRetry] = useState(0);
  const point = report.pontos.find(item => item.id === selected) ?? report.pontos[0];
  const photos = useSignedPhotos(point?.arquivos ?? [], retry);
  const labels = point ? photoLabels(point) : new Map<string, string>();
  const count = report.pontos.reduce((sum, item) => sum + (item.metadata?.hotspots.length ?? 0), 0);
  return <main className="mx-auto min-h-screen max-w-5xl bg-slate-50 px-4 py-6 text-slate-900">
    <Link href="/termografia" className="inline-flex min-h-11 items-center text-blue-700">← Relatórios</Link>
    <header className="mb-5 rounded-2xl bg-slate-900 p-5 text-white">
      <p className="text-sm text-slate-300">{report.numero_relatorio} · Revisão {report.revisao}</p>
      <h1 className="mt-1 text-2xl font-semibold">{report.cliente_nome}</h1>
      <p className="mt-2 text-sm text-slate-300">{report.pontos.length} quadros · {count} aquecimentos · {report.data_execucao.split('-').reverse().join('/')}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={`/termografia/${report.id}/imprimir`} className="flex min-h-11 items-center rounded-xl bg-white px-4 font-medium text-slate-900">Ver relatório / PDF</a>
        <a href={`/termografia/nova?revisar=${report.id}`} className="flex min-h-11 items-center rounded-xl border border-slate-500 px-4">Criar revisão</a>
      </div>
      {report.sourceReportId && <a href={`/termografia/${report.sourceReportId}`} className="mt-3 inline-block text-sm text-blue-200 underline">Ver versão anterior</a>}
    </header>
    <p className="mb-4 text-sm text-slate-600">Uma revisão mantém o relatório enviado e abre uma nova cópia para editar.</p>
    <label className="block text-sm font-medium">Localizar quadro<input value={search} onChange={event => setSearch(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" placeholder="Setor ou nome do quadro" /></label>
    <div className="my-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">{report.pontos.filter(item => `${item.setor} ${item.local}`.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${selected === item.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white'}`}>{item.setor} · {item.local}</button>)}</div>
    {point && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{point.setor} · {point.local}</h2><p className="text-sm text-slate-600">{point.metadata ? inspectionLabels[point.metadata.inspectionStatus] : ''}</p></div><button type="button" onClick={() => setOriginal(!original)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm">{original ? 'Mostrar marcações' : 'Ver fotos sem marcações'}</button></div>
      {point.metadata?.inspectionReason && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{point.metadata.inspectionReason}</p>}
      {photos.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{photos.error}<button type="button" onClick={() => setRetry(retry + 1)} className="ml-3 min-h-11 underline">Tentar novamente</button></div>}
      <button type="button" onClick={() => setRetry(retry + 1)} className="min-h-11 text-sm text-blue-700 underline">Recarregar fotos</button>
      <div className="grid items-start gap-4 sm:grid-cols-2">{point.arquivos?.map(file => <ReportPhoto key={`${file.id}-${retry}`} file={file} point={point} label={labels.get(file.id)!} url={photos.urls[file.id]} showAnnotations={!original} />)}</div>
      <HotspotDescriptions point={point} />
      {!point.metadata?.hotspots.length && <p className="text-sm text-slate-600">Sem aquecimentos registrados neste quadro.</p>}
    </section>}
  </main>;
}
