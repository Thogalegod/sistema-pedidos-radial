'use client';

import { useRef, useState, type PointerEvent } from 'react';
import type { DigitalAnnotation, FieldHotspot } from '@/lib/termografia/field-collection';
import { DigitalAnnotationOverlay } from './DigitalAnnotationOverlay';
import { buttonClass, fieldClass } from './collectorStyles';

export function DigitalAnnotationEditor({ src, photoId, annotations, hotspots, onChange, disabled = false, onImageError }: {
  src: string; photoId: string; annotations: DigitalAnnotation[]; hotspots: FieldHotspot[];
  onChange: (annotations: DigitalAnnotation[]) => void; disabled?: boolean; onImageError?: () => void;
}) {
  const [tool, setTool] = useState<DigitalAnnotation['tool'] | null>(null);
  const [original, setOriginal] = useState(false);
  const [hotspotId, setHotspotId] = useState('');
  const linkedHotspotId = hotspots.some(hotspot => hotspot.id === hotspotId) ? hotspotId : '';
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<DigitalAnnotation | null>(null);
  const drawing = useRef<DigitalAnnotation | null>(null);
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (!tool || disabled || original) return;
    event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = position(event);
    drawing.current = { id: crypto.randomUUID(), photoId, tool, color: '#ff3b30', strokeWidth: .006,
      ...(linkedHotspotId ? { hotspotId: linkedHotspotId } : {}), points: tool === 'circle' || tool === 'arrow' ? [point, point] : [point] };
    setPreview(drawing.current);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const mark = drawing.current; if (!mark) return;
    const point = position(event);
    const next = { ...mark, points: mark.tool === 'freehand' ? [...mark.points, point] : mark.tool === 'point' ? [point] : [mark.points[0], point] };
    drawing.current = next; setPreview(next);
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    move(event); const mark = drawing.current!;
    drawing.current = null; setPreview(null); setSelected(mark.id); onChange([...annotations, mark]);
  };
  return <div className="space-y-3">
    <div className="relative w-full overflow-hidden rounded-lg bg-slate-100">
      {/* Native dimensions establish the exact drawing bounds; no letterboxing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Foto digital original" className="block h-auto w-full" onError={onImageError} draggable={false} />
      {!original && <DigitalAnnotationOverlay annotations={preview ? [...annotations, preview] : annotations} hotspots={hotspots} />}
      {!disabled && !original && <svg role="img" aria-label="Desenhar na foto digital" viewBox="0 0 1 1" preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full" style={{ touchAction: tool ? 'none' : 'auto', pointerEvents: tool ? 'auto' : 'none' }}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { drawing.current = null; setPreview(null); }} />}
    </div>
    {!disabled && <>
      <div className="flex flex-wrap gap-2" aria-label="Ferramentas para a foto digital">
        {([['freehand', 'Desenho']] as const).map(([value, label]) =>
          <button key={value} type="button" className={`${buttonClass} ${tool === value ? 'border-blue-700 bg-blue-50 text-blue-800' : ''}`} aria-pressed={tool === value} onClick={() => { setTool(tool === value ? null : value); setOriginal(false); }}>{label}</button>)}
      </div>
      <p className="text-xs text-slate-600">Toque em Desenho e arraste sobre a digital. Toque novamente em Desenho para rolar a imagem. A térmica e o original ficam preservados.</p>
      {hotspots.length > 0 && <label className="block text-sm">Relacionar marcação com uma descrição (opcional)
        <select className={fieldClass} value={linkedHotspotId} onChange={event => setHotspotId(event.target.value)}>
          <option value="">Sem vínculo</option>{hotspots.map((hotspot, index) => <option value={hotspot.id} key={hotspot.id}>{index + 1}. {hotspot.componente || 'Descrição'}</option>)}
        </select>
      </label>}
    </>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} aria-pressed={original} onClick={() => setOriginal(!original)}>{original ? 'Ver marcações' : 'Ver original'}</button>
      {!disabled && <button type="button" className={buttonClass} disabled={!annotations.length} onClick={() => onChange(annotations.slice(0, -1))}>Desfazer</button>}
    </div>
    {!disabled && annotations.length > 0 && <div className="flex flex-wrap gap-2">
      <label className="min-w-0 flex-1 text-sm">Marcação a apagar<select className={fieldClass} value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Escolha uma marcação</option>{annotations.map((annotation, index) => <option key={annotation.id} value={annotation.id}>Marcação {index + 1}</option>)}
      </select></label>
      <button type="button" className={`${buttonClass} self-end`} disabled={!annotations.some(a => a.id === selected)} onClick={() => { onChange(annotations.filter(a => a.id !== selected)); setSelected(''); }}>Apagar marcação</button>
    </div>}
  </div>;
}
