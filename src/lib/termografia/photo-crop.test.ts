// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { createFieldCollection, createFieldPoint } from './field-collection';
import { DraftStore, RevisionConflictError } from './offline-store';
import { exportFieldCollection, importFieldCollection } from './backup';
import { prepareFieldCollection } from './sync-field-collection';
import { FULL_PHOTO, moveCrop, photoCropSchema } from './photo-crop';

const scope = { projectId: 'p', origin: 'https://example.test', userId: crypto.randomUUID(), organizationId: crypto.randomUUID() };
const stores: DraftStore[] = [];
const crop = { x: .2, y: .1, width: .6, height: .7 };
function open(name = crypto.randomUUID()) { const store = new DraftStore(scope, { name }); stores.push(store); return store; }
afterEach(async () => { const names = stores.map(s => s.db.name); stores.forEach(s => s.close()); stores.length = 0; for (const name of new Set(names)) await Dexie.delete(name); });
async function fixture() {
  const store = open(); let draft = createFieldCollection(scope, { cliente_nome: 'Teste' });
  draft.points.push(createFieldPoint({ setor: 'A', local: 'Q1' })); draft = await store.create(draft);
  for (const kind of ['digital', 'termica'] as const) draft = await store.attachPhoto(draft.id, draft.revision, draft.points[0].id, new Blob([kind], { type: 'image/jpeg' }), { kind });
  return { store, draft, photoId: draft.photos[0].id };
}
describe('digital crop offline persistence', () => {
  it('keeps touch movement and corner resizing inside the photo with a usable selection', () => {
    const moved = moveCrop(crop, 'move', -10, 10);
    expect(moved).toMatchObject({ x: 0, width: crop.width, height: crop.height });
    expect(moved.y).toBeCloseTo(.3);
    for (const handle of ['nw', 'ne', 'sw', 'se'] as const) {
      for (const delta of [-10, 10]) {
        const adjusted = moveCrop(FULL_PHOTO, handle, delta, delta);
        expect(photoCropSchema.safeParse(adjusted).success).toBe(true);
        expect(adjusted.width).toBeGreaterThanOrEqual(.079);
        expect(adjusted.height).toBeGreaterThanOrEqual(.079);
      }
      expect(photoCropSchema.safeParse(moveCrop({ x: 0, y: 0, width: .02, height: .02 }, handle, 10, 10)).success).toBe(true);
    }
  });
  it('reopens and backs up the crop with untouched originals; restoring removes only the crop', async () => {
    const { store, draft, photoId } = await fixture();
    const saved = await store.setPhotoCrop(draft.id, draft.revision, photoId, crop);
    const reopened = open(store.db.name);
    expect((await reopened.get(draft.id))!.photos[0].crop).toEqual(crop);
    expect(await (await reopened.getBlob(draft.id, photoId))!.text()).toBe('digital');
    const copy = await importFieldCollection(store, await exportFieldCollection(store, draft.id));
    expect(copy.photos[0].crop).toEqual(crop);
    expect(await (await store.getBlob(copy.id, copy.photos[0].id))!.text()).toBe('digital');
    const restored = await store.setPhotoCrop(saved.id, saved.revision, photoId, undefined);
    expect(restored.photos[0].crop).toBeUndefined();
    expect(await (await store.getBlob(draft.id, photoId))!.text()).toBe('digital');
  });
  it('invalidates old prepared bytes and clears drawings only on this photo, retaining descriptions', async () => {
    const { store, draft: original, photoId } = await fixture();
    let draft = await store.attachPhoto(original.id, original.revision, original.points[0].id, new Blob(['second-digital'], { type: 'image/jpeg' }), { kind: 'digital' });
    draft.points[0].annotations.push({ id: crypto.randomUUID(), photoId, tool: 'freehand', color: '#ff0000', strokeWidth: .01, points: [{ x: .5, y: .5 }] });
    const otherDrawing = { id: crypto.randomUUID(), photoId: draft.photos[2].id, tool: 'freehand' as const, color: '#ff0000', strokeWidth: .01, points: [{ x: .5, y: .5 }] };
    draft.points[0].annotations.push(otherDrawing);
    draft.points[0].hotspots.push({ id: crypto.randomUUID(), photoId: draft.photos[1].id, digitalPhotoId: photoId, componente: 'Disjuntor', temperatura: '40', conclusao: 'Verificar' });
    draft = await store.save(draft);
    draft = await prepareFieldCollection(store, draft.id, { backendProjectId: scope.projectId, origin: scope.origin, preparePhoto: async blob => ({ blob, width: 100, height: 100 }) });
    expect(await store.getPreparedPhoto(draft.id, photoId)).toBeDefined();
    const saved = await store.setPhotoCrop(draft.id, draft.revision, photoId, crop);
    expect(saved.points[0].annotations).toEqual([otherDrawing]);
    expect(saved.points[0].hotspots).toEqual(draft.points[0].hotspots);
    expect(await store.getPreparedPhoto(draft.id, photoId)).toBeUndefined();
    expect(await store.getPreparedPhoto(draft.id, draft.photos[1].id)).toBeDefined();
  });
  it('rejects invalid, thermal, stale and frozen changes without touching the image', async () => {
    const { store, draft, photoId } = await fixture();
    await expect(store.setPhotoCrop(draft.id, draft.revision, photoId, { ...crop, width: 1 })).rejects.toThrow();
    await expect(store.setPhotoCrop(draft.id, draft.revision, draft.photos[1].id, crop)).rejects.toThrow(/digital/i);
    expect(await store.get(draft.id)).toEqual(draft);
    const saved = await store.setPhotoCrop(draft.id, draft.revision, photoId, crop);
    await expect(store.setPhotoCrop(draft.id, draft.revision, photoId, undefined)).rejects.toBeInstanceOf(RevisionConflictError);
    const frozen = await store.queue(saved.id, saved.revision);
    await expect(store.setPhotoCrop(frozen.id, frozen.revision, photoId, undefined)).rejects.toThrow(/envio/i);
    expect(await (await store.getBlob(draft.id, photoId))!.text()).toBe('digital');
  });
  it('rolls back a failed crop save without losing original, drawings or the previous crop', async () => {
    const { store, draft, photoId } = await fixture();
    store.db.drafts.hook('updating', () => { throw new DOMException('Storage full', 'QuotaExceededError'); });
    await expect(store.setPhotoCrop(draft.id, draft.revision, photoId, crop)).rejects.toThrow(/local|espaço/i);
    expect(await store.get(draft.id)).toEqual(draft);
    expect(await (await store.getBlob(draft.id, photoId))!.text()).toBe('digital');
  });
});
