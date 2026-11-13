// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftStore } from './offline-store';
import { createFieldPoint, pointMetadata } from './field-collection';
import { mapTermografiaReport } from './report-actions';
import { sha256Blob } from './prepared-photo';
import { createReportRevisionDraft } from './report-revision';

const scope = { projectId: 'qa', origin: 'https://qa.test', userId: crypto.randomUUID(), organizationId: crypto.randomUUID() };
const stores: DraftStore[] = [];
afterEach(async () => { for (const store of stores.splice(0)) await store.db.delete(); });
async function fixture() {
  const point = createFieldPoint({ setor: 'Cabine', local: 'Q1' });
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]; point.photoIds = ids;
  point.hotspots = ids.slice(1).map((photoId, index) => ({ id: crypto.randomUUID(), photoId, componente: `Fase ${index}`, temperatura: '70', conclusao: '', descricao: 'Verificar conexão' }));
  point.annotations = [{ id: crypto.randomUUID(), photoId: ids[0], hotspotId: point.hotspots[1].id, tool: 'point', color: '#ff0000', strokeWidth: .01, points: [{ x: .2, y: .4 }] }];
  const photo = new Blob(['exact-photo'], { type: 'image/jpeg' });
  const report = mapTermografiaReport({
    report: { id: crypto.randomUUID(), organization_id: scope.organizationId, mobile_sync_state: 'complete', cliente_nome: 'Cliente', data_execucao: '2026-11-12', revisao: 2 },
    points: [{ id: point.id, setor: point.setor, local: point.local, metadados_coleta: pointMetadata(point) }],
    files: await Promise.all(ids.map(async (id, index) => ({ id, point_id: point.id, tipo: index ? 'termica' as const : 'digital' as const, storage_path: `path/${id}`, file_name: `${id}.jpg`, content_type: photo.type, tamanho_bytes: photo.size, content_sha256: await sha256Blob(photo) }))),
  });
  const store = new DraftStore(scope, { name: crypto.randomUUID() }); stores.push(store);
  return { report, store, photo };
}
describe('editable report revision', () => {
  it('preserves all photos and associations with new IDs while retaining the previous report', async () => {
    const { report, store, photo } = await fixture();
    const draft = await createReportRevisionDraft(store, report, async () => photo);
    expect(draft.id).not.toBe(report.id); expect(draft.sourceReportId).toBe(report.id); expect(draft.report.revisao).toBe(3);
    expect(draft.photos).toHaveLength(3); expect(draft.points[0].hotspots).toHaveLength(2);
    expect(draft.points[0].annotations[0].hotspotId).toBe(draft.points[0].hotspots[1].id);
    expect(draft.points[0].hotspots[1].photoId).toBe(draft.photos[2].id);
    expect(await (await store.getBlob(draft.id, draft.photos[2].id))!.text()).toBe('exact-photo');
    expect(draft.sync.status).toBe('draft');
  });
  it('rejects another organization or corrupted bytes without creating a partial revision', async () => {
    const { report, store, photo } = await fixture(); const download = vi.fn(async () => photo);
    await expect(createReportRevisionDraft(store, { ...report, organization_id: 'other' }, download)).rejects.toThrow(/organização/i);
    expect(download).not.toHaveBeenCalled();
    await expect(createReportRevisionDraft(store, report, async () => new Blob(['bad']))).rejects.toThrow(/foto|bytes|integridade/i);
    expect(await store.list()).toEqual([]);
  });
  it('leaves no partial revision when local access is revoked during download', async () => {
    const { report, store, photo } = await fixture(); let current = true;
    await expect(createReportRevisionDraft(store, report, async () => { current = false; return photo; }, undefined, () => current)).rejects.toThrow(/conta|interrompida/i);
    expect(await store.list()).toEqual([]);
  });
});
