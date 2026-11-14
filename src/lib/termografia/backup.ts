import JSZip from 'jszip';
import { emptySync, validateFieldCollection, type FieldCollection } from './field-collection';
import type { DraftStore } from './offline-store';
import { inspectBackupZip, readBoundedZipEntry, resolveBackupLimits, resourceError, type BackupImportLimits } from './backup-limits';

export { DEFAULT_BACKUP_IMPORT_LIMITS, type BackupImportLimits } from './backup-limits';

/** ZIP contains strict JSON metadata and untouched original bytes, never temporary URLs. */
export async function exportFieldCollection(store: DraftStore, id: string, options: Partial<BackupImportLimits> = {}): Promise<Blob> {
  const limits = resolveBackupLimits(options);
  const draft = await store.get(id); if (!draft) throw new Error('Coleta não encontrada.');
  const manifest = JSON.stringify({ format: 'termografia-field-backup', version: 1, collection: draft });
  const manifestBytes = new TextEncoder().encode(manifest).byteLength;
  if (manifestBytes > limits.maxManifestBytes) throw resourceError('Manifesto excede o limite de cópia.');
  let expandedBytes = manifestBytes;
  // STORE ZIP, ASCII entry names, no comments/extra fields/directories/descriptors:
  // 22-byte end record; each file has 30-byte local + 46-byte central headers and
  // its filename appears twice. Bound the final archive before reading originals.
  let archiveBytes = 22 + 76 + 2 * 'manifest.json'.length + manifestBytes;
  for (const photo of draft.photos) {
    if (photo.size > limits.maxOriginalBytes) throw resourceError('Original excede o limite de cópia.');
    expandedBytes += photo.size; archiveBytes += photo.size + 76 + 2 * `originals/${photo.id}`.length;
    if (!Number.isSafeInteger(expandedBytes) || !Number.isSafeInteger(archiveBytes)) throw resourceError('Tamanho da cópia excede o limite suportado.');
  }
  if (expandedBytes > limits.maxExpandedBytes) throw resourceError('Conteúdo expandido excede o limite de cópia.');
  if (archiveBytes > limits.maxArchiveBytes) throw resourceError('ZIP excede o limite de cópia.');
  const zip = new JSZip();
  zip.file('manifest.json', manifest, { createFolders: false });
  for (const photo of draft.photos) {
    const original = await store.getBlob(id, photo.id);
    if (!original || original.size !== photo.size) throw new Error('Original ausente ou incompleto. Cópia não foi gerada.');
    zip.file(`originals/${photo.id}`, await original.arrayBuffer(), { createFolders: false });
  }
  // Reject a concurrent edit: never produce metadata and originals from different revisions.
  if ((await store.get(id))?.revision !== draft.revision) throw new Error('Coleta mudou durante a cópia. Tente novamente.');
  const archive = await zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
  if (archive.byteLength > limits.maxArchiveBytes) throw resourceError('ZIP gerado excede o limite de cópia.');
  return new Blob([archive], { type: 'application/zip' });
}

export async function importFieldCollection(store: DraftStore, input: Blob, options: Partial<BackupImportLimits> = {}): Promise<FieldCollection> {
  const limits = resolveBackupLimits(options);
  if (input.size > limits.maxArchiveBytes) throw resourceError('ZIP grande demais: excede o limite de leitura.');
  let archive: ArrayBuffer;
  let zip: JSZip;
  let members: ReturnType<typeof inspectBackupZip>;
  try {
    archive = await input.arrayBuffer(); members = inspectBackupZip(archive, limits);
    zip = await JSZip.loadAsync(archive, { checkCRC32: false });
    if (Object.keys(zip.files).length !== members.size || Object.values(zip.files).some(file => !members.has(file.name) || file.dir !== members.get(file.name)!.directory || (file.unsafeOriginalName !== undefined && file.unsafeOriginalName !== file.name))) throw resourceError('Nomes de arquivos incompatíveis na cópia.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Mantenha o ZIP original')) throw error;
    throw resourceError('ZIP inválido ou corrompido.');
  }
  const manifest = zip.file('manifest.json'); if (!manifest) throw new Error('Manifesto da cópia ausente.');
  const manifestData = await readBoundedZipEntry(manifest, Math.min(limits.maxManifestBytes, members.get('manifest.json')!.size));
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(await manifestData.blob.text()) as Record<string, unknown>; }
  catch { throw resourceError('Manifesto da cópia inválido ou corrompido.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw resourceError('Manifesto da cópia inválido.');
  if (Object.keys(raw).sort().join(',') !== 'collection,format,version' || raw.format !== 'termografia-field-backup' || raw.version !== 1) throw new Error('Formato de cópia incompatível.');
  let old: FieldCollection;
  try { old = validateFieldCollection(raw.collection); }
  catch { throw resourceError('Manifesto inválido: estrutura ou referências incompatíveis.'); }
  const expected = new Set(['manifest.json', ...old.photos.map(p => `originals/${p.id}`)]);
  if ([...members].some(([name, member]) => !member.directory && !expected.has(name))) throw resourceError('Arquivo inesperado na cópia.');
  let expandedBytes = manifestData.size;
  for (const photo of old.photos) {
    const member = members.get(`originals/${photo.id}`);
    if (!member || member.directory || member.size !== photo.size) throw resourceError('Original ausente ou tamanho declarado incompatível.');
    expandedBytes += photo.size;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxExpandedBytes) throw resourceError('Conteúdo expandido excede o limite de leitura.');
  }
  const ids = new Map<string, string>();
  for (const id of [old.id, ...old.points.flatMap(p => [p.id, ...p.hotspots.map(h => h.id), ...p.annotations.map(a => a.id)]), ...old.photos.map(p => p.id)]) ids.set(id, crypto.randomUUID());
  const mapped = (id: string) => { const value = ids.get(id); if (!value) throw new Error('Referência inválida na cópia.'); return value; };
  const originals = new Map<string, Blob>();
  for (const photo of old.photos) {
    const entry = zip.file(`originals/${photo.id}`); if (!entry) throw new Error('Original ausente na cópia.');
    const bytes = await readBoundedZipEntry(entry, Math.min(photo.size, limits.maxOriginalBytes));
    if (bytes.size !== photo.size) throw resourceError('Tamanho do original inválido.');
    originals.set(mapped(photo.id), bytes.blob.slice(0, bytes.size, photo.contentType));
  }
  // CRC is deferred until every accepted member proved its declared and actual byte
  // bounds. Unexpected members and expansion overruns never reach this second pass.
  try { await JSZip.loadAsync(archive, { checkCRC32: true }); }
  catch { throw resourceError('ZIP corrompido: verificação de integridade falhou.'); }
  const now = new Date().toISOString();
  const draft = validateFieldCollection({ ...old, sourceReportId: undefined, id: mapped(old.id), scope: store.scope, revision: 0, createdAt: now, updatedAt: now,
    ...(old.activePointId ? { activePointId: mapped(old.activePointId) } : {}), sync: emptySync(),
    points: old.points.map(p => ({ ...p, id: mapped(p.id), photoIds: p.photoIds.map(mapped),
      hotspots: p.hotspots.map(h => ({ ...h, id: mapped(h.id), photoId: mapped(h.photoId), ...(h.digitalPhotoId ? { digitalPhotoId: mapped(h.digitalPhotoId) } : {}) })),
      annotations: p.annotations.map(a => ({ ...a, id: mapped(a.id), photoId: mapped(a.photoId), ...(a.hotspotId ? { hotspotId: mapped(a.hotspotId) } : {}) })) })),
    photos: old.photos.map(p => ({ ...p, id: mapped(p.id), pointId: mapped(p.pointId) })),
  });
  return store.create(draft, originals);
}
