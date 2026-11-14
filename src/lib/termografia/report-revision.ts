import { createFieldCollection, validateFieldCollection, type FieldCollection, type FieldPoint, type FieldPhoto } from './field-collection';
import { DraftStore } from './offline-store';
import { loadTermografiaReport } from './report-actions';
import { sha256Blob } from './prepared-photo';
import { backendProjectId } from './local-identity';
import { TERMOGRAFIA_DOCUMENT_BUCKET } from './paths';
import type { MobileTermografiaClient } from './sync-field-collection';
import type { TermografiaArquivo, TermografiaRelatorio } from './types';

/** A revision is a new immutable submission. Never silently overwrite a completed report. */
export async function createReportRevisionDraft(store: DraftStore, report: TermografiaRelatorio,
  download: (file: TermografiaArquivo) => Promise<Blob>,
  onProgress?: (done: number, total: number) => void,
  isCurrent: () => boolean = () => true): Promise<FieldCollection> {
  if (report.organization_id !== store.scope.organizationId) throw new Error('Este relatório pertence a outra organização.');
  if (report.collectionVersion !== 1 || report.syncState !== 'complete') throw new Error('Aguarde a conclusão do envio antes de criar uma revisão.');
  const draft = createFieldCollection(store.scope, {
    cliente_nome: report.cliente_nome, data_execucao: report.data_execucao, cliente_cnpj: report.cliente_cnpj,
    cliente_endereco: report.cliente_endereco, cliente_cidade: report.cliente_cidade, cliente_uf: report.cliente_uf, cliente_cep: report.cliente_cep,
    objetivo: report.objetivo, equipamento: report.equipamento, responsavel_nome: report.responsavel_nome, responsavel_crea: report.responsavel_crea,
    revisao: report.revisao + 1, status: 'gerado',
  });
  draft.sourceReportId = report.id;
  const ids = new Map<string, string>();
  for (const point of report.pontos) {
    if (!point.metadata) throw new Error('Metadados da coleta incompletos. A revisão não foi criada.');
    for (const id of [point.id, ...point.metadata.photoIds, ...point.metadata.hotspots.map(item => item.id), ...point.metadata.annotations.map(item => item.id)]) ids.set(id, crypto.randomUUID());
  }
  const id = (old: string) => { const value = ids.get(old); if (!value) throw new Error('Associação de foto incompleta.'); return value; };
  draft.points = report.pontos.map(point => ({
    id: id(point.id), setor: point.setor, local: point.local, ...(point.equipamento ? { equipamento: point.equipamento } : {}),
    inspectionStatus: point.metadata!.inspectionStatus, inspectionReason: point.metadata!.inspectionReason,
    photoIds: point.metadata!.photoIds.map(id),
    hotspots: point.metadata!.hotspots.map(hotspot => ({ ...hotspot, id: id(hotspot.id), photoId: id(hotspot.photoId), ...(hotspot.digitalPhotoId ? { digitalPhotoId: id(hotspot.digitalPhotoId) } : {}) })),
    annotations: point.metadata!.annotations.map(annotation => ({ ...annotation, id: id(annotation.id), photoId: id(annotation.photoId), ...(annotation.hotspotId ? { hotspotId: id(annotation.hotspotId) } : {}) })),
  } satisfies FieldPoint));
  const files = report.pontos.flatMap(point => (point.arquivos ?? []).map(file => ({ pointId: point.id, file })));
  const originals = new Map<string, Blob>(); let done = 0;
  const assertCurrent = () => { if (!isCurrent()) throw new Error('A conta mudou ou a operação foi interrompida. Nenhuma revisão parcial foi criada.'); };
  for (const { pointId, file } of files) {
    assertCurrent();
    const blob = await download(file);
    if (!file.sha256 || blob.size !== file.tamanhoBytes || await sha256Blob(blob) !== file.sha256) throw new Error('A integridade de uma foto não foi confirmada. O relatório anterior foi preservado.');
    assertCurrent();
    originals.set(id(file.id), blob.slice(0, blob.size, file.contentType));
    draft.photos.push({ id: id(file.id), pointId: id(pointId), kind: file.tipo, fileName: file.fileName, contentType: file.contentType, size: blob.size } satisfies FieldPhoto);
    onProgress?.(++done, files.length);
  }
  draft.activePointId = draft.points[0]?.id;
  assertCurrent();
  return store.create(validateFieldCollection(draft), originals);
}

export async function importReportRevision(store: DraftStore, client: MobileTermografiaClient, reportId: string,
  onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<FieldCollection> {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured || backendProjectId(configured) !== store.scope.projectId || (typeof window !== 'undefined' && window.location.origin !== store.scope.origin)) throw new Error('Abra a revisão no endereço e na conta da coleta.');
  let revoked = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (session?.user.id && session.user.id !== store.scope.userId)) revoked = true;
  });
  try {
    const report = await loadTermografiaReport(client, reportId, store.scope);
    return await createReportRevisionDraft(store, report, async file => {
      if (revoked || signal?.aborted) throw new Error('A importação da revisão foi interrompida.');
      const result = await client.storage.from(TERMOGRAFIA_DOCUMENT_BUCKET).download(file.storagePath);
      if (result.error || !result.data) throw new Error('Não foi possível baixar todas as fotos. Tente novamente com internet.');
      return result.data;
    }, onProgress, () => !revoked && !signal?.aborted);
  } finally { subscription.unsubscribe(); }
}
