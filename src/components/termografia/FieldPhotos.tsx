'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DigitalAnnotation, FieldCollection, FieldHotspot, FieldPhoto, FieldPoint } from '@/lib/termografia/field-collection';
import type { DraftStore } from '@/lib/termografia/offline-store';
import { DigitalAnnotationEditor } from './DigitalAnnotationEditor';
import { buttonClass, cardClass, fieldClass } from './collectorStyles';

const noSubscription = () => () => {};
const isAndroid = () => /Android/i.test(navigator.userAgent);

function LocalPhoto({ store, draft, photo, point, disabled, onAnnotations, onRemove }: {
  store: DraftStore | null; draft: FieldCollection; photo: FieldPhoto; point: FieldPoint; disabled: boolean;
  onAnnotations: (photoId: string, annotations: DigitalAnnotation[]) => void; onRemove: (id: string) => void;
}) {
  const [source, setSource] = useState<{ url?: string; error?: string }>({});
  const enlarged = useRef<HTMLDialogElement>(null);
  const loadedUrl = useRef<string | undefined>(undefined);
  useEffect(() => () => { if (loadedUrl.current) URL.revokeObjectURL(loadedUrl.current); }, []);
  useEffect(() => {
    let alive = true;
    if (!store || loadedUrl.current) return;
    void store.getBlob(draft.id, photo.id).then(blob => {
      if (!alive) return;
      if (!blob) { setSource({ error: 'Original ainda não está disponível. Aguarde a gravação; se houver falha, mantenha esta aba aberta e tente salvar novamente.' }); return; }
      loadedUrl.current = URL.createObjectURL(blob); setSource({ url: loadedUrl.current });
    }).catch(() => { if (alive) setSource({ error: 'Não foi possível ler o original salvo no celular. Tente reabrir o rascunho.' }); });
    return () => { alive = false; };
  }, [store, draft.id, draft.revision, photo.id]);
  const fail = () => setSource(previous => ({ ...previous, error: 'Não foi possível abrir esta imagem. O original foi preservado. Use outro formato compatível antes de enviar.' }));
  return <article className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-3">
    <p className="break-words text-sm font-medium">{photo.fileName}</p>
    {source.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{source.error}</p>}
    {!source.url && !source.error && <p className="text-sm text-slate-500">Lendo foto do celular…</p>}
    {source.url && photo.kind === 'digital' && <DigitalAnnotationEditor src={source.url} photoId={photo.id} annotations={point.annotations.filter(a => a.photoId === photo.id)} hotspots={point.hotspots.filter(h => !h.digitalPhotoId || h.digitalPhotoId === photo.id)}
      onChange={annotations => onAnnotations(photo.id, annotations)} disabled={disabled || !!source.error} onImageError={fail} />}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {source.url && photo.kind === 'termica' && <img src={source.url} alt={`Térmica original ${photo.fileName}`} className="block h-auto w-full rounded-lg" onError={fail} />}
    <div className="flex flex-wrap gap-2">
      {source.url && <button type="button" className={buttonClass} onClick={() => enlarged.current?.showModal()}>Ampliar foto</button>}
      {!disabled && <button type="button" className={buttonClass} onClick={() => { if (window.confirm('Remover esta foto e suas descrições/marcações associadas?')) onRemove(photo.id); }}>Remover foto</button>}
    </div>
    <dialog ref={enlarged} aria-label="Foto original ampliada" className="fixed inset-0 m-auto max-h-[95dvh] w-[95vw] max-w-5xl overflow-auto rounded-xl bg-white p-3 backdrop:bg-black/70">
      <button type="button" className={`${buttonClass} mb-3`} onClick={() => enlarged.current?.close()}>Fechar foto ampliada</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {source.url && <img src={source.url} alt={`Original ampliado ${photo.fileName}`} className="h-auto w-full" />}
    </dialog>
  </article>;
}

export function FieldPhotos({ store, draft, point, disabled, localSaved, attach, removePhoto, updatePoint, flush }: {
  store: DraftStore | null; draft: FieldCollection; point: FieldPoint; disabled: boolean; localSaved: boolean;
  attach: (pointId: string, files: File[], kind: 'digital' | 'termica') => void; removePhoto: (id: string) => void;
  updatePoint: (update: (point: FieldPoint) => void) => void; flush: () => Promise<void>;
}) {
  const [launch, setLaunch] = useState<{ ready?: boolean; error?: string; saving?: boolean }>({});
  const android = useSyncExternalStore(noSubscription, isAndroid, () => false);
  const files = draft.photos.filter(photo => photo.pointId === point.id);
  const thermal = files.filter(photo => photo.kind === 'termica');
  const digital = files.filter(photo => photo.kind === 'digital');
  const select = (input: HTMLInputElement, kind: FieldPhoto['kind']) => { const picked = Array.from(input.files ?? []); attach(point.id, picked, kind); setLaunch({}); input.value = ''; };
  const annotate = (photoId: string, annotations: DigitalAnnotation[]) => updatePoint(p => { p.annotations = [...p.annotations.filter(a => a.photoId !== photoId), ...annotations]; });
  const patchHotspot = (id: string, patch: Partial<FieldHotspot>) => updatePoint(p => { const hotspot = p.hotspots.find(h => h.id === id); if (hotspot) Object.assign(hotspot, patch); });
  return <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <section className={`${cardClass} space-y-3`} aria-label="Fotos digitais">
      <h3 className="text-lg font-semibold">Foto digital · {digital.length}</h3>
      <p className="text-sm text-slate-600">Fotografe o quadro e marque os componentes sobre a digital.</p>
      <div className="flex flex-wrap gap-2">
        <label className={`${buttonClass} relative cursor-pointer`}>Fotografar digital<input aria-label="Fotografar digital" className="absolute inset-0 w-full cursor-pointer opacity-0" type="file" accept="image/*" capture="environment" disabled={disabled} onChange={event => select(event.currentTarget, 'digital')} /></label>
        <label className={`${buttonClass} relative cursor-pointer`}>Álbum digital<input aria-label="Adicionar digitais do álbum" className="absolute inset-0 w-full cursor-pointer opacity-0" type="file" accept="image/*" multiple disabled={disabled} onChange={event => select(event.currentTarget, 'digital')} /></label>
      </div>
      {digital.map((photo, digitalIndex) => <section key={photo.id} aria-label={`Foto digital ${digitalIndex + 1}`} className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h4 className="font-medium">Digital {digitalIndex + 1}</h4>
      <LocalPhoto {...{ store, draft, photo, point, disabled }} onAnnotations={annotate} onRemove={removePhoto} />
      {(point.occurrenceSelected || point.hotspots.length > 0) && <details open className="rounded-lg border border-orange-200 p-3">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">Descrição da ocorrência</summary>
        <div className="space-y-3">
        {!thermal.length && <p className="text-sm text-slate-600">Adicione uma foto térmica para registrar a descrição do componente e sua avaliação.</p>}
        {point.hotspots.filter(h => h.digitalPhotoId === photo.id || (!h.digitalPhotoId && digitalIndex === 0)).map(hotspot => <fieldset key={hotspot.id} disabled={disabled} className="min-w-0 space-y-3 rounded-lg border border-orange-200 bg-orange-50/30 p-3">
          <legend className="text-sm font-semibold">Ocorrência {point.hotspots.findIndex(h => h.id === hotspot.id) + 1}</legend>
          {thermal.length > 1 && <label className="block text-sm">Foto térmica relacionada<select className={fieldClass} value={hotspot.photoId} onChange={e => patchHotspot(hotspot.id, { photoId: e.target.value })}>{thermal.map((photo, index) => <option key={photo.id} value={photo.id}>Térmica {index + 1} · {photo.fileName}</option>)}</select></label>}
          {digital.length > 1 && <label className="block text-sm">Foto digital relacionada<select className={fieldClass} value={hotspot.digitalPhotoId ?? digital[0].id} onChange={e => patchHotspot(hotspot.id, { digitalPhotoId: e.target.value })}>{digital.map((item, index) => <option key={item.id} value={item.id}>Digital {index + 1} · {item.fileName}</option>)}</select></label>}
          <label className="block text-sm">Componente<input className={fieldClass} value={hotspot.componente} onChange={e => patchHotspot(hotspot.id, { componente: e.target.value })} /></label>
          <label className="block text-sm">Descrição / conclusão<textarea className={fieldClass} value={hotspot.conclusao} onChange={e => patchHotspot(hotspot.id, { conclusao: e.target.value })} /></label>
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm">Temperatura e avaliação informadas (opcional)</summary><div className="space-y-3">
            <label className="block text-sm">Temperatura informada<input className={fieldClass} inputMode="decimal" value={hotspot.temperatura} placeholder="Conforme medição" onChange={e => patchHotspot(hotspot.id, { temperatura: e.target.value })} /></label>
            <label className="block text-sm">Classificação<select className={fieldClass} value={hotspot.classificacao ?? ''} onChange={e => patchHotspot(hotspot.id, { classificacao: (e.target.value || undefined) as FieldHotspot['classificacao'] })}>
              <option value="">Não informada</option>{['Normal', 'Observação', 'Intervenção Programada', 'Intervenção Imediata', 'Crítico'].map(value => <option key={value}>{value}</option>)}
            </select></label>
            <label className="block text-sm">Risco<select className={fieldClass} value={hotspot.risco ?? ''} onChange={e => patchHotspot(hotspot.id, { risco: (e.target.value || undefined) as FieldHotspot['risco'] })}>
              <option value="">Não informado</option>{['Baixo', 'Médio', 'Alto'].map(value => <option key={value}>{value}</option>)}
            </select></label>
          </div></details>
          {!disabled && <button type="button" className={buttonClass} onClick={() => updatePoint(p => { p.hotspots = p.hotspots.filter(h => h.id !== hotspot.id); p.annotations = p.annotations.map(a => a.hotspotId === hotspot.id ? { ...a, hotspotId: undefined } : a); })}>Remover descrição</button>}
        </fieldset>)}
        {!disabled && thermal.length > 0 && <button type="button" className={buttonClass} onClick={() => { const hotspot: FieldHotspot = { id: crypto.randomUUID(), photoId: thermal[0].id, digitalPhotoId: photo.id, componente: '', temperatura: '', conclusao: '' }; updatePoint(p => { p.hotspots.push(hotspot); }); }}>Adicionar descrição</button>}
        </div>
      </details>}
      </section>)}
      {!digital.length && (point.occurrenceSelected || point.hotspots.length > 0) && <p className="text-sm text-slate-600">Adicione uma foto digital para descrever as ocorrências.</p>}
    </section>
    <section className={`${cardClass} space-y-3`} aria-label="Fotos termográficas">
      <h3 className="text-lg font-semibold">Térmicas · {thermal.length}</h3>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">No Xtherm, confira se o HD está ativado. Quando houver pouca variação de temperatura ou a imagem estiver pouco definida, ajuste brilho e contraste no Xtherm antes de fotografar.</p>
      <label className={`${buttonClass} relative w-full cursor-pointer border-blue-700 text-blue-800`}>Adicionar térmicas do álbum<input aria-label="Adicionar térmicas do álbum" className="absolute inset-0 w-full cursor-pointer opacity-0" type="file" accept="image/*" multiple disabled={disabled} onChange={event => select(event.currentTarget, 'termica')} /></label>
      <p className="text-xs text-slate-600">Faça as fotos no app da câmera térmica, volte manualmente e escolha uma ou várias imagens do álbum. Nenhuma temperatura é extraída automaticamente.</p>
      {android && !disabled && <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <button className={buttonClass} type="button" disabled={launch.saving} onClick={async () => {
          setLaunch({ saving: true }); try { await flush(); setLaunch({ ready: true }); } catch (error) { setLaunch({ error: error instanceof Error ? error.message : 'Não foi possível confirmar a gravação. Mantenha esta aba aberta.' }); }
        }}>{launch.saving ? 'Confirmando gravação…' : 'Salvar antes de abrir Xtherm'}</button>
        {launch.ready && localSaved && <a className={buttonClass} href="intent://xtherm/#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;component=com.infiRay.Xtherm/com.infiRay.Xtherm.MainActivity;end">Tentar abrir Xtherm (experimental)</a>}
        {launch.error && <p role="alert" className="text-sm text-red-800">{launch.error}</p>}
        <p className="text-xs text-slate-600">A abertura depende do aparelho e não foi validada em hardware. Se não abrir, use o ícone do Xtherm. O retorno e a escolha das fotos são manuais.</p>
      </div>}
      {thermal.map((photo, photoIndex) => <div key={photo.id} className="space-y-3">
        <h4 className="font-medium">Térmica {photoIndex + 1}</h4>
        <LocalPhoto {...{ store, draft, photo, point, disabled }} onAnnotations={annotate} onRemove={removePhoto} />

      </div>)}
    </section>
  </div>;
}
