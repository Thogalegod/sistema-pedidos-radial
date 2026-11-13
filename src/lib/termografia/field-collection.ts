import { z } from 'zod';
import type { TermografiaReportInput } from './report-actions';

export interface OfflineScope { projectId: string; origin: string; userId: string; organizationId: string }
export type InspectionStatus = 'pending' | 'inspected' | 'no-load' | 'inaccessible';
export interface FieldHotspot {
  id: string; photoId: string; digitalPhotoId?: string; componente: string; temperatura: string; conclusao: string;
  descricao?: string; classificacao?: 'Normal' | 'Observação' | 'Intervenção Programada' | 'Intervenção Imediata' | 'Crítico'; risco?: 'Baixo' | 'Médio' | 'Alto';
}
export interface DigitalAnnotation {
  id: string; photoId: string; hotspotId?: string; tool: 'point' | 'circle' | 'arrow' | 'freehand';
  color: string; strokeWidth: number; points: { x: number; y: number }[];
}
export interface FieldPoint {
  id: string; setor: string; local: string; equipamento?: string;
  inspectionStatus: InspectionStatus; inspectionReason: string; occurrenceSelected?: boolean;
  photoIds: string[]; hotspots: FieldHotspot[]; annotations: DigitalAnnotation[];
}
export interface FieldPhoto {
  id: string; pointId: string; kind: 'digital' | 'termica'; fileName: string; contentType: string; size: number; lastModified?: number;
}
export interface FieldSnapshot {
  schemaVersion: 1; id: string; scope: OfflineScope; sourceReportId?: string; report: TermografiaReportInput; points: FieldPoint[]; photos: FieldPhoto[];
}
export type SyncStatus = 'draft' | 'queued' | 'syncing' | 'failed' | 'synced';
export interface SyncCheckpoints { report: boolean; pointIds: string[]; photoIds: string[] }
export interface FieldSync { status: SyncStatus; snapshot?: FieldSnapshot; checkpoints: SyncCheckpoints; error?: string }
export interface FieldCollection extends FieldSnapshot {
  revision: number; createdAt: string; updatedAt: string; activePointId?: string; sync: FieldSync;
}

const uuid = z.string().uuid();
const scopeSchema = z.object({ projectId: z.string().min(1), origin: z.string().min(1), userId: z.string().min(1), organizationId: z.string().min(1) }).strict();
const classification = z.enum(['Normal', 'Observação', 'Intervenção Programada', 'Intervenção Imediata', 'Crítico']);
const reportSchema = z.object({
  cliente_nome: z.string(), data_execucao: z.string(), cliente_cnpj: z.string().nullable().optional(), cliente_endereco: z.string().nullable().optional(),
  cliente_cidade: z.string().nullable().optional(), cliente_uf: z.string().nullable().optional(), cliente_cep: z.string().nullable().optional(),
  objetivo: z.string().nullable().optional(), equipamento: z.string().nullable().optional(), responsavel_nome: z.string().nullable().optional(),
  responsavel_crea: z.string().nullable().optional(), revisao: z.number().int().nonnegative().optional(), status: z.enum(['gerado', 'revisado', 'emitido', 'cancelado']).optional(),
}).strict();
const hotspotSchema = z.object({ id: uuid, photoId: uuid, digitalPhotoId: uuid.optional(), componente: z.string(), temperatura: z.string(), conclusao: z.string(), descricao: z.string().optional(), classificacao: classification.optional(), risco: z.enum(['Baixo', 'Médio', 'Alto']).optional() }).strict();
const annotationSchema = z.object({
  id: uuid, photoId: uuid, hotspotId: uuid.optional(), tool: z.enum(['point', 'circle', 'arrow', 'freehand']), color: z.string().regex(/^#[\da-f]{6}$/i),
  strokeWidth: z.number().positive().max(1), points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict()).min(1),
}).strict();
const pointSchema = z.object({ id: uuid, setor: z.string(), local: z.string(), equipamento: z.string().optional(), inspectionStatus: z.enum(['pending', 'inspected', 'no-load', 'inaccessible']), inspectionReason: z.string(), occurrenceSelected: z.boolean().optional(), photoIds: z.array(uuid), hotspots: z.array(hotspotSchema), annotations: z.array(annotationSchema) }).strict();
const photoSchema = z.object({ id: uuid, pointId: uuid, kind: z.enum(['digital', 'termica']), fileName: z.string(), contentType: z.string(), size: z.number().int().nonnegative(), lastModified: z.number().int().nonnegative().optional() }).strict();
const snapshotSchema = z.object({ schemaVersion: z.literal(1), id: uuid, scope: scopeSchema, sourceReportId: uuid.optional(), report: reportSchema, points: z.array(pointSchema), photos: z.array(photoSchema) }).strict();
const collectionSchema = snapshotSchema.extend({
  revision: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), activePointId: uuid.optional(),
  sync: z.object({ status: z.enum(['draft', 'queued', 'syncing', 'failed', 'synced']), snapshot: snapshotSchema.optional(), error: z.string().optional(), checkpoints: z.object({ report: z.boolean(), pointIds: z.array(uuid), photoIds: z.array(uuid) }).strict() }).strict(),
}).strict();

export function scopeKey(scope: OfflineScope): string { return JSON.stringify([scope.projectId, scope.origin, scope.userId, scope.organizationId]); }
export function emptySync(): FieldSync { return { status: 'draft', checkpoints: { report: false, pointIds: [], photoIds: [] } }; }
export function createFieldCollection(scope: OfflineScope, report: Partial<TermografiaReportInput> = {}): FieldCollection {
  const clock = new Date();
  const now = clock.toISOString();
  const localDate = `${clock.getFullYear()}-${String(clock.getMonth() + 1).padStart(2, '0')}-${String(clock.getDate()).padStart(2, '0')}`;
  return validateFieldCollection({ schemaVersion: 1, id: crypto.randomUUID(), scope, revision: 0, createdAt: now, updatedAt: now,
    report: { cliente_nome: '', data_execucao: localDate, equipamento: 'InfiRay T2S Plus', ...report }, points: [], photos: [], sync: emptySync() });
}
export function createFieldPoint(input: Partial<Pick<FieldPoint, 'setor' | 'local' | 'equipamento'>> = {}): FieldPoint {
  return { id: crypto.randomUUID(), setor: '', local: '', ...input, inspectionStatus: 'pending', inspectionReason: '', photoIds: [], hotspots: [], annotations: [] };
}
function assertReferences(snapshot: FieldSnapshot) {
  const allIds = [snapshot.id, ...snapshot.points.flatMap(p => [p.id, ...p.hotspots.map(h => h.id), ...p.annotations.map(a => a.id)]), ...snapshot.photos.map(p => p.id)];
  if (new Set(allIds).size !== allIds.length) throw new Error('IDs locais duplicados.');
  for (const point of snapshot.points) {
    const photos = snapshot.photos.filter(p => p.pointId === point.id);
    if (new Set(point.photoIds).size !== point.photoIds.length || photos.length !== point.photoIds.length || photos.some(p => !point.photoIds.includes(p.id))) throw new Error('Referência de foto inválida.');
    for (const hotspot of point.hotspots) if (!photos.some(p => p.id === hotspot.photoId && p.kind === 'termica')) throw new Error('Referência térmica do aquecimento inválida.');
    for (const hotspot of point.hotspots) if (hotspot.digitalPhotoId && !photos.some(p => p.id === hotspot.digitalPhotoId && p.kind === 'digital')) throw new Error('Referência digital da ocorrência inválida.');
    for (const a of point.annotations) {
      if (!photos.some(p => p.id === a.photoId && p.kind === 'digital') || (a.hotspotId && !point.hotspots.some(h => h.id === a.hotspotId))) throw new Error('Referência da marcação inválida.');
      if ((a.tool === 'arrow' || a.tool === 'circle') && a.points.length !== 2) throw new Error('Marcação exige dois pontos.');
    }
  }
  if (snapshot.photos.some(photo => !snapshot.points.some(p => p.id === photo.pointId))) throw new Error('Referência de quadro inválida.');
}
export function validateFieldCollection(value: unknown): FieldCollection {
  const draft = collectionSchema.parse(value) as FieldCollection;
  assertReferences(draft);
  if (draft.activePointId && !draft.points.some(p => p.id === draft.activePointId)) throw new Error('Referência do quadro ativo inválida.');
  if (draft.sync.status !== 'draft' && !draft.sync.snapshot) throw new Error('Snapshot de envio ausente.');
  if (draft.sync.snapshot) {
    assertReferences(draft.sync.snapshot);
    if (scopeKey(draft.scope) !== scopeKey(draft.sync.snapshot.scope) || draft.id !== draft.sync.snapshot.id) throw new Error('Snapshot de outra conta/coleta.');
    if (JSON.stringify(collectionSnapshot(draft)) !== JSON.stringify(draft.sync.snapshot)) throw new Error('Snapshot de envio difere da coleta congelada.');
  }
  const checkpoints = draft.sync.checkpoints;
  if (checkpoints.pointIds.some(id => !draft.points.some(p => p.id === id)) || checkpoints.photoIds.some(id => !draft.photos.some(p => p.id === id))) throw new Error('Referência de checkpoint inválida.');
  return draft;
}
export function collectionSnapshot(draft: FieldCollection): FieldSnapshot {
  return structuredClone({ schemaVersion: draft.schemaVersion, id: draft.id, scope: draft.scope, ...(draft.sourceReportId ? { sourceReportId: draft.sourceReportId } : {}), report: draft.report, points: draft.points, photos: draft.photos });
}
export function validateReadyToQueue(draft: FieldCollection) {
  if (draft.points.some(p => p.occurrenceSelected && !p.hotspots.length)) throw new Error('Adicione a foto térmica e uma descrição para o quadro com ocorrência antes do envio.');
  const date = draft.report.data_execucao;
  const parsedDate = new Date(`${date}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
  if (!draft.report.cliente_nome.trim() || !validDate || !draft.points.length) throw new Error('Preencha cliente, data válida e pelo menos um quadro antes do envio.');
  if (draft.points.some(p => !p.setor.trim() || !p.local.trim() || ((p.inspectionStatus === 'no-load' || p.inspectionStatus === 'inaccessible') && !p.inspectionReason.trim()))) throw new Error('Preencha setor/local e justifique quadros sem carga ou não acessíveis.');
}
export function pointMetadata(point: FieldPoint) {
  return structuredClone({ version: 1 as const, inspectionStatus: point.inspectionStatus, inspectionReason: point.inspectionReason, photoIds: point.photoIds, hotspots: point.hotspots, annotations: point.annotations });
}
export type PointMetadata = ReturnType<typeof pointMetadata>;
export function parsePointMetadata(value: unknown): PointMetadata {
  try {
    const schema = pointSchema.omit({ id: true, setor: true, local: true, equipamento: true, occurrenceSelected: true }).extend({ version: z.literal(1) }).strict();
    const metadata = schema.parse(value);
    const ids = [...metadata.photoIds, ...metadata.hotspots.map(h => h.id), ...metadata.annotations.map(a => a.id)];
    if (new Set(ids).size !== ids.length || metadata.annotations.some(a => (a.tool === 'circle' || a.tool === 'arrow') && a.points.length !== 2)) throw new Error('IDs/marcações inválidos');
    return metadata;
  } catch (cause) { throw new Error('Metadados da coleta incompatíveis ou versão desconhecida. Atualize o aplicativo antes de editar este relatório.', { cause }); }
}
