import type { FieldCollection } from '@/lib/termografia/field-collection';

export type CollectorView = 'client' | 'hub' | 'point' | 'finish' | 'more';

export function initialCollectorView(draft: FieldCollection, search: string): CollectorView {
  const params = new URLSearchParams(search);
  const view = params.get('tela');
  if (params.get('rascunho') === draft.id) {
    if (view === 'point' && draft.points.some(point => point.id === draft.activePointId)) return 'point';
    if (view === 'client' || view === 'hub' || view === 'more' || view === 'finish') return view;
  }
  return draft.report.cliente_nome.trim() ? 'hub' : 'client';
}

export function collectorUrl(id: string, view?: CollectorView): string {
  const params = new URLSearchParams({ rascunho: id });
  if (view) params.set('tela', view);
  return `/termografia/nova?${params}`;
}

export function knownSectors(draft: FieldCollection, excludePointId?: string): string[] {
  const sectors = new Map<string, string>();
  for (const point of draft.points) {
    if (point.id === excludePointId) continue;
    const name = point.setor.trim().replace(/\s+/g, ' ');
    if (name) sectors.set(name.toLocaleLowerCase('pt-BR'), name);
  }
  return [...sectors.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
