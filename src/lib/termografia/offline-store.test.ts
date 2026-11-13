// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { createFieldCollection, createFieldPoint } from './field-collection';
import { DraftStore, RevisionConflictError } from './offline-store';

const scope = { projectId: 'project-a', origin: 'https://example.test', userId: 'user-a', organizationId: 'org-a' };
const names: string[] = [];
const stores: DraftStore[] = [];
function open(name = crypto.randomUUID(), s = scope) {
  names.push(name);
  const store = new DraftStore(s, { name });
  stores.push(store);
  return store;
}
afterEach(async () => { stores.forEach(s => s.close()); for (const name of new Set(names.splice(0))) await Dexie.delete(name); stores.length = 0; });
async function initial(store: DraftStore) {
  const draft = createFieldCollection(scope);
  draft.report.cliente_nome = 'Cliente á';
  draft.points.push(createFieldPoint({ setor: 'A', local: 'Quadro' }));
  draft.activePointId = draft.points[0].id;
  return store.create(draft);
}

describe('IndexedDB draft persistence', () => {
  it('reopens committed texts, active point and original Blob bytes', async () => {
    const name = crypto.randomUUID();
    const store = open(name);
    let draft = await initial(store);
    draft = await store.attachPhoto(draft.id, draft.revision, draft.points[0].id, new Blob(['original'], { type: 'image/jpeg' }), { kind: 'termica', fileName: 'original.jpg' });
    store.close();
    const reopened = open(name);
    const restored = (await reopened.get(draft.id))!;
    expect(restored).toEqual(draft);
    expect(await (await reopened.getBlob(draft.id, draft.photos[0].id))!.text()).toBe('original');
  });
  it('isolates project, origin, user and organization without deleting other sessions', async () => {
    const name = crypto.randomUUID();
    const store = open(name);
    const draft = await initial(store);
    for (const key of ['projectId', 'origin', 'userId', 'organizationId'] as const) {
      const other = open(name, { ...scope, [key]: 'other' });
      expect(await other.list()).toEqual([]);
      expect(await other.get(draft.id)).toBeUndefined();
      await expect(other.save(draft)).rejects.toThrow();
    }
    expect(await store.get(draft.id)).toEqual(draft);
  });
  it('rejects stale concurrent edits through real transactions', async () => {
    const name = crypto.randomUUID(); const a = open(name); const b = open(name);
    const draft = await initial(a);
    const results = await Promise.allSettled([a.save({ ...draft, report: { ...draft.report, cliente_nome: 'One' } }), b.save({ ...draft, report: { ...draft.report, cliente_nome: 'Two' } })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(RevisionConflictError);
    await expect(a.delete(draft.id, draft.revision)).rejects.toBeInstanceOf(RevisionConflictError);
  });
  it('rolls back both Blob and metadata when quota aborts the IndexedDB transaction', async () => {
    const store = open(); const draft = await initial(store);
    // Inject a browser-like write failure after the Blob write, inside the same transaction.
    store.db.drafts.hook('updating', function () { throw new DOMException('Storage full', 'QuotaExceededError'); });
    await expect(store.attachPhoto(draft.id, draft.revision, draft.points[0].id, new Blob(['kept']), { kind: 'digital', fileName: 'x.jpg' })).rejects.toThrow(/local|espaço/i);
    expect(await store.get(draft.id)).toEqual(draft);
    expect(await store.db.blobs.count()).toBe(0);
  });
  it('handles 60 points and 240 original images without fixed capacity caps, then deletes atomically', async () => {
    const store = open(); let draft = createFieldCollection(scope);
    draft.points = Array.from({ length: 60 }, (_, i) => createFieldPoint({ setor: 'A', local: `Q${i}` }));
    draft = await store.create(draft);
    for (let i = 0; i < 240; i++) draft = await store.attachPhoto(draft.id, draft.revision, draft.points[Math.floor(i / 4)].id, new Blob([`image-${i}`]), { kind: 'termica', fileName: `${i}.jpg` });
    expect((await store.get(draft.id))!.photos).toHaveLength(240);
    await store.delete(draft.id, draft.revision);
    expect(await store.db.blobs.count()).toBe(0);
  });
  it('persists frozen sync snapshot and checkpoints across reopening and blocks edits', async () => {
    const name = crypto.randomUUID(); const store = open(name); let draft = await initial(store);
    draft = await store.queue(draft.id, draft.revision);
    await expect(store.save(draft)).rejects.toThrow(/envio/i);
    draft = await store.setSyncState(draft.id, draft.revision, 'syncing');
    draft = await store.checkpoint(draft.id, draft.revision, { report: true, pointIds: [draft.points[0].id] });
    draft = await store.setSyncState(draft.id, draft.revision, 'failed', 'Network lost');
    store.close();
    expect(await open(name).get(draft.id)).toEqual(draft);
    expect(draft.sync.snapshot?.id).toBe(draft.id);
    expect(draft.sync.checkpoints.report).toBe(true);
  });
  it('removes photo references, hotspots, annotations and original together', async () => {
    const store = open(); let draft = await initial(store);
    draft = await store.attachPhoto(draft.id, draft.revision, draft.points[0].id, new Blob(['img']), { kind: 'digital', fileName: 'x.jpg' });
    const photoId = draft.photos[0].id;
    draft.points[0].annotations.push({ id: crypto.randomUUID(), photoId, tool: 'point', color: '#ff0000', strokeWidth: .01, points: [{ x: .5, y: .5 }] });
    draft = await store.save(draft);
    draft = await store.removePhoto(draft.id, draft.revision, photoId);
    expect(draft.photos).toEqual([]); expect(draft.points[0].annotations).toEqual([]);
    expect(await store.getBlob(draft.id, photoId)).toBeUndefined();
  });
  it('keeps failed queue validation editable, and rejects invalid calendar dates', async () => {
    const store = open(); let draft = await initial(store);
    draft.report.data_execucao = '2026-02-30'; draft = await store.save(draft);
    await expect(store.queue(draft.id, draft.revision)).rejects.toThrow(/data/i);
    expect((await store.get(draft.id))!.sync.status).toBe('draft');
    draft.report.data_execucao = '2026-11-12'; draft = await store.save(draft);
    expect((await store.queue(draft.id, draft.revision)).sync.status).toBe('queued');
  });
  it('preserves File metadata and denies Blob access to another scope', async () => {
    const name = crypto.randomUUID(); const store = open(name); let draft = await initial(store);
    draft = await store.attachPhoto(draft.id, draft.revision, draft.points[0].id, new File(['bytes'], 'nome-á.jpg', { type: 'image/jpeg', lastModified: 12345 }), { kind: 'termica' });
    expect(draft.photos[0]).toMatchObject({ fileName: 'nome-á.jpg', contentType: 'image/jpeg', size: 5, lastModified: 12345 });
    expect(await open(name, { ...scope, userId: 'other' }).getBlob(draft.id, draft.photos[0].id)).toBeUndefined();
  });
  it('cannot announce full success before every remote confirmation and retries frozen failed sends', async () => {
    const store = open(); let draft = await initial(store);
    draft = await store.queue(draft.id, draft.revision);
    draft = await store.setSyncState(draft.id, draft.revision, 'syncing');
    await expect(store.setSyncState(draft.id, draft.revision, 'synced')).rejects.toThrow(/confirmado/i);
    draft = await store.setSyncState(draft.id, draft.revision, 'failed', 'lost response');
    const snapshot = draft.sync.snapshot;
    draft = await store.setSyncState(draft.id, draft.revision, 'syncing');
    expect(draft.sync.snapshot).toEqual(snapshot);
    draft = await store.checkpoint(draft.id, draft.revision, { report: true, pointIds: draft.points.map(p => p.id) });
    draft = await store.setSyncState(draft.id, draft.revision, 'synced');
    await expect(store.save(draft)).rejects.toThrow(/envio/i);
  });
});
