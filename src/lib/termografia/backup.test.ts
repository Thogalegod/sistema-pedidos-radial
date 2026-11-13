// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import Dexie from 'dexie';
import { createFieldCollection, createFieldPoint } from './field-collection';
import { DraftStore } from './offline-store';
import { exportFieldCollection, importFieldCollection } from './backup';

const scope = { projectId: 'p', origin: 'https://example.test', userId: 'u', organizationId: 'o' };
const stores: DraftStore[] = [];
function store(s = scope) { const result = new DraftStore(s, { name: crypto.randomUUID() }); stores.push(result); return result; }
afterEach(async () => { vi.restoreAllMocks(); for (const s of stores.splice(0)) { s.close(); await Dexie.delete(s.db.name); } });

it('round trips all original bytes and remaps every local reference to the current account', async () => {
  const source = store(); const target = store({ ...scope, userId: 'new-user', organizationId: 'new-org' });
  let draft = createFieldCollection(scope, { cliente_nome: 'Cliente' }); draft.points.push(createFieldPoint({ setor: 'A', local: 'Q1' })); draft.activePointId = draft.points[0].id;
  draft = await source.create(draft);
  for (const kind of ['digital', 'termica', 'termica'] as const) draft = await source.attachPhoto(draft.id, draft.revision, draft.points[0].id, new Blob([`original-${kind}`], { type: 'image/jpeg' }), { kind, fileName: 'img.jpg' });
  draft.points[0].hotspots.push({ id: crypto.randomUUID(), photoId: draft.photos[1].id, componente: 'Cabo', temperatura: '72', conclusao: 'Reparar' });
  draft.points[0].annotations.push({ id: crypto.randomUUID(), photoId: draft.photos[0].id, hotspotId: draft.points[0].hotspots[0].id, tool: 'point', color: '#ff0000', strokeWidth: .01, points: [{ x: .5, y: .5 }] });
  draft = await source.save(draft); draft = await source.queue(draft.id, draft.revision);
  const restored = await importFieldCollection(target, await exportFieldCollection(source, draft.id));
  expect(restored.id).not.toBe(draft.id); expect(restored.scope).toEqual(target.scope);
  expect(restored.sync.status).toBe('draft'); expect(restored.sync.snapshot).toBeUndefined();
  expect(restored.points[0].id).not.toBe(draft.points[0].id);
  expect(restored.activePointId).toBe(restored.points[0].id);
  expect(restored.points[0].hotspots[0].photoId).toBe(restored.photos[1].id);
  expect(restored.points[0].annotations[0].photoId).toBe(restored.photos[0].id);
  expect(restored.points[0].annotations[0].hotspotId).toBe(restored.points[0].hotspots[0].id);
  expect(await (await target.getBlob(restored.id, restored.photos[2].id))!.text()).toBe('original-termica');
});

it('applies the same export byte policy before reading originals or generating an archive', async () => {
  const source = store(); const { draft, id } = await fixture('valid');
  const saved = await source.create(draft, new Map([[id, new Blob(['valid'])]]));
  const baseline = await exportFieldCollection(source, saved.id);
  const read = vi.spyOn(source, 'getBlob'); const generate = vi.spyOn(JSZip.prototype, 'generateAsync');
  await expect(exportFieldCollection(source, saved.id, { maxArchiveBytes: baseline.size - 1 })).rejects.toThrow(/limite/i);
  await expect(exportFieldCollection(source, saved.id, { maxOriginalBytes: 4 })).rejects.toThrow(/limite/i);
  await expect(exportFieldCollection(source, saved.id, { maxManifestBytes: 10 })).rejects.toThrow(/manifesto.*limite|limite.*manifesto/i);
  await expect(exportFieldCollection(source, saved.id, { maxExpandedBytes: 10 })).rejects.toThrow(/limite/i);
  expect(read).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  expect(await source.get(saved.id)).toEqual(saved);
});

it('exports an archive that round trips using exactly the same resource options', async () => {
  const source = store(); const target = store(); const { draft, id } = await fixture('valid');
  const saved = await source.create(draft, new Map([[id, new Blob(['valid'])]]));
  const options = { maxArchiveBytes: 4096, maxManifestBytes: 2048, maxOriginalBytes: 5, maxExpandedBytes: 2048 };
  const archive = await exportFieldCollection(source, saved.id, options);
  const imported = await importFieldCollection(target, archive, options);
  expect(await (await target.getBlob(imported.id, imported.photos[0].id))!.text()).toBe('valid');
});

async function fixture(payload = 'valid') {
  const draft = createFieldCollection(scope);
  draft.points.push(createFieldPoint({ setor: 'S', local: 'Q' }));
  const id = crypto.randomUUID();
  draft.photos.push({ id, pointId: draft.points[0].id, kind: 'termica', fileName: 'x.jpg', contentType: 'image/jpeg', size: payload.length });
  draft.points[0].photoIds.push(id);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: draft }));
  zip.file(`originals/${id}`, payload);
  return { zip, draft, id };
}

it('rejects an archive byte budget before reading its buffer', async () => {
  const target = store(); const input = new Blob(['oversize']);
  const read = vi.spyOn(input, 'arrayBuffer');
  await expect(importFieldCollection(target, input, { maxArchiveBytes: 4 })).rejects.toThrow(/limite|grande/i);
  expect(read).not.toHaveBeenCalled(); expect(await target.list()).toEqual([]);
});

it('bounds compressed manifest expansion before loading or inflating archive members', async () => {
  const target = store(); const { zip } = await fixture();
  zip.file('manifest.json', ' '.repeat(128 * 1024));
  const input = new Blob([await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })]);
  const load = vi.spyOn(JSZip, 'loadAsync');
  await expect(importFieldCollection(target, input, { maxManifestBytes: 1024 })).rejects.toThrow(/manifesto.*limite|limite.*manifesto/i);
  expect(load).not.toHaveBeenCalled(); expect(await target.db.blobs.count()).toBe(0);
});

it('rejects unexpected compressed entries and directory content before decompression', async () => {
  const target = store(); const { zip } = await fixture();
  zip.file('unexpected.bin', 'x'.repeat(256 * 1024));
  const load = vi.spyOn(JSZip, 'loadAsync');
  await expect(importFieldCollection(target, new Blob([await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })]))).rejects.toThrow(/inesperado/i);
  expect(load).not.toHaveBeenCalled();
  zip.remove('unexpected.bin');
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer' }));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50 && view.getUint16(i + 28, true) === 10) view.setUint32(i + 24, 500, true); // originals/ directory claims content
  await expect(importFieldCollection(target, new Blob([bytes]))).rejects.toThrow(/diretório/i);
  expect(await target.list()).toEqual([]); expect(await target.db.blobs.count()).toBe(0);
});

it('stops streamed expansion at declared bytes even when central size is forged, without a partial import', async () => {
  const target = store(); const { zip, draft, id } = await fixture('x'.repeat(256 * 1024));
  draft.photos[0].size = 1;
  zip.file('manifest.json', JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: draft }));
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }));
  const view = new DataView(bytes.buffer); const entryName = `originals/${id}`;
  for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50 && view.getUint16(i + 28, true) === entryName.length) view.setUint32(i + 24, 1, true);
  const load = vi.spyOn(JSZip, 'loadAsync');
  await expect(importFieldCollection(target, new Blob([bytes]), { maxOriginalBytes: 1024, maxExpandedBytes: 8192 })).rejects.toThrow(/tamanho|limite/i);
  expect(load.mock.calls.every(call => !call[1]?.checkCRC32)).toBe(true);
  expect(await target.list()).toEqual([]); expect(await target.db.blobs.count()).toBe(0);
});

it('pauses a compact expansion bomb before decoding its entire payload', async () => {
  const target = store(); const payloadBytes = 32 * 1024 * 1024;
  const { zip, draft, id } = await fixture('x'.repeat(payloadBytes));
  draft.photos[0].size = 1;
  zip.file('manifest.json', JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: draft }));
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }));
  expect(bytes.length).toBeLessThan(40 * 1024);
  const view = new DataView(bytes.buffer); const name = `originals/${id}`;
  for (let i = 0; i < bytes.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50 && view.getUint16(i + 28, true) === name.length) view.setUint32(i + 24, 1, true);
  let decodedBytes = 0;
  const load = JSZip.loadAsync;
  vi.spyOn(JSZip, 'loadAsync').mockImplementation(async (data, options) => {
    const loaded = await load(data, options);
    const entry = loaded.file(name)! as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> };
    const stream = entry.internalStream.bind(entry);
    vi.spyOn(entry, 'internalStream').mockImplementation(type => stream(type).on('data', chunk => { decodedBytes += chunk.byteLength; }));
    return loaded;
  });
  await expect(importFieldCollection(target, new Blob([bytes]))).rejects.toThrow(/tamanho|limite/i);
  // JSZip can finish its current 16 KiB compressed input block after pause, but
  // never schedules the next block. No whole expanded original is accumulated.
  expect(decodedBytes).toBeGreaterThan(0); expect(decodedBytes).toBeLessThan(payloadBytes);
  expect(await target.list()).toEqual([]); expect(await target.db.blobs.count()).toBe(0);
});

it('enforces per-original and total byte budgets before extraction', async () => {
  const target = store(); const { zip } = await fixture('x'.repeat(2048));
  const input = new Blob([await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })]);
  await expect(importFieldCollection(target, input, { maxOriginalBytes: 1024 })).rejects.toThrow(/limite/i);
  await expect(importFieldCollection(target, input, { maxExpandedBytes: 2100 })).rejects.toThrow(/limite/i);
  expect(await target.list()).toEqual([]); expect(await target.db.blobs.count()).toBe(0);
});

it('still verifies CRC for bounded accepted members before any writes', async () => {
  const target = store(); const { zip } = await fixture('original-byte-sequence');
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' }));
  const start = Buffer.from(bytes).indexOf(Buffer.from('original-byte-sequence'));
  expect(start).toBeGreaterThan(0); bytes[start] ^= 1;
  await expect(importFieldCollection(target, new Blob([bytes]))).rejects.toThrow(/corrompid|integridade/i);
  expect(await target.list()).toEqual([]); expect(await target.db.blobs.count()).toBe(0);
});

it('rejects malformed metadata, dangling references and missing/incorrect bytes before writing anything', async () => {
  const target = store();
  await expect(importFieldCollection(target, new Blob(['garbage']))).rejects.toThrow();
  const zip = new JSZip(); const draft = createFieldCollection(scope);
  zip.file('manifest.json', JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: { ...draft, privateUrl: 'blob:secret' } }));
  await expect(importFieldCollection(target, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow();
  draft.points.push(createFieldPoint({ setor: '', local: '' }));
  const id = crypto.randomUUID(); draft.photos.push({ id, pointId: draft.points[0].id, kind: 'termica', fileName: 'photo.jpg', contentType: 'image/jpeg', size: 123 }); draft.points[0].photoIds.push(id);
  draft.points[0].hotspots.push({ id: crypto.randomUUID(), photoId: crypto.randomUUID(), componente: '', temperatura: '', conclusao: '' });
  zip.file('manifest.json', JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: draft }));
  await expect(importFieldCollection(target, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow(/refer/i);
  draft.points[0].hotspots = [];
  zip.file('manifest.json', JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: draft }));
  await expect(importFieldCollection(target, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow();
  zip.file(`originals/${id}`, 'short');
  await expect(importFieldCollection(target, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow();
  expect(await target.list()).toEqual([]); expect(await target.db.blobs.count()).toBe(0);
});
