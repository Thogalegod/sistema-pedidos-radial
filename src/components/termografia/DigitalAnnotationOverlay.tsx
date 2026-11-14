'use client';

import { useId } from 'react';
import type { DigitalAnnotation, FieldHotspot } from '@/lib/termografia/field-collection';

/** Parent must have the same bounds as the rendered image, without object-contain letterboxing. */
export function DigitalAnnotationOverlay({ annotations, hotspots = [], className = '' }: {
  annotations: DigitalAnnotation[]; hotspots?: FieldHotspot[]; className?: string;
}) {
  const prefix = useId().replace(/:/g, '');
  if (!annotations.length) return null;
  return <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Identificação dos componentes" role="img"
    className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
    {annotations.map(annotation => {
      const first = annotation.points[0];
      if (!first) return null;
      const second = annotation.points[1] ?? first;
      const number = annotation.hotspotId ? hotspots.findIndex(item => item.id === annotation.hotspotId) + 1 : 0;
      const style = { stroke: annotation.color, strokeWidth: annotation.strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
      const marker = `${prefix}-${annotation.id}`;
      return <g key={annotation.id}>
        {annotation.tool === 'point' && <><circle cx={first.x} cy={first.y} r=".018" fill={annotation.color} stroke="white" strokeWidth=".003" /><circle cx={first.x} cy={first.y} r=".005" fill="white" /></>}
        {annotation.tool === 'circle' && <ellipse cx={(first.x + second.x) / 2} cy={(first.y + second.y) / 2} rx={Math.abs(second.x - first.x) / 2} ry={Math.abs(second.y - first.y) / 2} {...style} />}
        {annotation.tool === 'arrow' && <><defs><marker id={marker} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill={annotation.color} /></marker></defs><line x1={first.x} y1={first.y} x2={second.x} y2={second.y} markerEnd={`url(#${marker})`} {...style} /></>}
        {annotation.tool === 'freehand' && <polyline points={annotation.points.map(point => `${point.x},${point.y}`).join(' ')} {...style} />}
        {number > 0 && <text x={Math.min(.94, first.x + .025)} y={Math.max(.045, first.y - .015)} fontSize=".04" fontWeight="bold" fill={annotation.color} stroke="white" strokeWidth=".002" paintOrder="stroke">{number}</text>}
      </g>;
    })}
  </svg>;
}
