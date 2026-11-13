import Dexie, { type Table } from 'dexie';
import { MOBILE_MAX_FILE_BYTES, preparedPhotoPath, sha256Blob, type PreparedPhoto } from './prepared-photo';
import {
  collectionSnapshot, scopeKey, validateFieldCollection, validateReadyToQueue,
  type FieldCollection, type FieldPhoto, type OfflineScope, type SyncCheckpoints, type SyncStatus,
} from './field-collection';

interface DraftRecord { key: string; scopeKey: string; collection: FieldCollection }
interface BlobRecord { key: string; draftKey: string; original: Blob }
interface PreparedRecord { key: string; draftKey: string; photo: PreparedPhoto }
export class DraftDatabase extends Dexie {
  drafts!: Table<DraftRecord, string>;
  blobs!: Table<BlobRecord, string>;
  prepared!: Table<PreparedRecord, string>;
  constructor(name: string) { super(name); this.version(1).stores({ drafts: '&key,scopeKey', blobs: '&key,draftKey' }); this.version(2).stores({ drafts: '&key,scopeKey', blobs: '&key,draftKey', prepared: '&key,draftKey' }); }
}
export class RevisionConflictError extends Error {
  constructor() { super('Esta coleta mudou em outra aba. Reabra a versão salva antes de editar.'); this.name = 'RevisionConflictError'; }
}
export class LocalPersistenceError extends Error {
  constructor(cause: unknown) { super('Falha ao salvar localmente. Verifique o espaço disponível e tente novamente; mantenha esta aba aberta.', { cause }); this.name = 'LocalPersistenceError'; }
}
export interface DraftStoreOptions { name?: string }
export interface PhotoInput { kind: FieldPhoto['kind']; fileName?: string; id?: string; lastModified?: number }

/** One instance per authenticated scope; changing account must create a different instance. */
export class DraftStore {
  readonly db: DraftDatabase;
  readonly scope: OfflineScope;
  private readonly partition: string;
  constructor(scope: OfflineScope, options: DraftStoreOptions = {}) {
    this.scope = Object.freeze({ ...scope }); this.partition = scopeKey(this.scope);
    this.db = new DraftDatabase(options.name ?? 'radial-termografia-field-v1');
  }
  close() { this.db.close(); }
  private key(id: string) { return JSON.stringify([this.partition, id]); }
  private blobKey(id: string, photoId: string) { return JSON.stringify([this.partition, id, photoId]); }
  private assertScope(draft: FieldCollection) { if (scopeKey(draft.scope) !== this.partition) throw new Error('Coleta de outra conta, organização ou projeto.'); }
  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await this.db.transaction('rw', this.db.drafts, this.db.blobs, this.db.prepared, operation); }
    catch (error) {
      if (error instanceof RevisionConflictError || (error instanceof Error && !(error instanceof Dexie.DexieError) && error.name !== 'QuotaExceededError' && error.name !== 'UnknownError')) throw error;
      throw new LocalPersistenceError(error);
    }
  }
  private async current(id: string, expectedRevision: number) {
    const row = await this.db.drafts.get(this.key(id));
    if (!row) throw new Error('Coleta local não encontrada nesta conta.');
    if (row.collection.revision !== expectedRevision) throw new RevisionConflictError();
    return validateFieldCollection(row.collection);
  }
  private editable(draft: FieldCollection) { if (draft.sync.status !== 'draft') throw new Error('Coleta congelada para envio. Exporte/importe uma cópia para editar com novos IDs.'); }
  private async persist(draft: FieldCollection) {
    const next = validateFieldCollection({ ...draft, revision: draft.revision + 1, updatedAt: new Date().toISOString() });
    await this.db.drafts.put({ key: this.key(next.id), scopeKey: this.partition, collection: next });
    return next;
  }
  async get(id: string): Promise<FieldCollection | undefined> {
    const row = await this.db.drafts.get(this.key(id));
    return row ? validateFieldCollection(row.collection) : undefined;
  }
  async list(): Promise<FieldCollection[]> {
    const rows = await this.db.drafts.where('scopeKey').equals(this.partition).toArray();
    return rows.map(r => validateFieldCollection(r.collection)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  /** Import uses this same atomic path: all photo metadata must have matching originals. */
  async create(input: FieldCollection, originals: ReadonlyMap<string, Blob> = new Map()): Promise<FieldCollection> {
    const draft = validateFieldCollection(input); this.assertScope(draft);
    if (draft.sync.status !== 'draft' || draft.sync.snapshot || draft.sync.checkpoints.report || draft.sync.checkpoints.pointIds.length || draft.sync.checkpoints.photoIds.length) throw new Error('Nova coleta deve iniciar sem envio ou checkpoints.');
    if (draft.photos.length !== originals.size || draft.photos.some(p => !originals.has(p.id) || originals.get(p.id)!.size !== p.size)) throw new Error('Original ausente ou tamanho incompatível.');
    return this.write(async () => {
      if (await this.db.drafts.get(this.key(draft.id))) throw new RevisionConflictError();
      for (const photo of draft.photos) await this.db.blobs.add({ key: this.blobKey(draft.id, photo.id), draftKey: this.key(draft.id), original: originals.get(photo.id)! });
      return this.persist({ ...draft, revision: 0 });
    });
  }
  async save(input: FieldCollection): Promise<FieldCollection> {
    const draft = validateFieldCollection(input); this.assertScope(draft);
    return this.write(async () => {
      const current = await this.current(draft.id, draft.revision); this.editable(current);
      if (JSON.stringify(current.sync) !== JSON.stringify(draft.sync)) throw new Error('Use as operações de fila para alterar o envio.');
      if (JSON.stringify(current.photos) !== JSON.stringify(draft.photos)) throw new Error('Use anexar/remover foto para preservar os originais.');
      return this.persist({ ...draft, createdAt: current.createdAt });
    });
  }
  async delete(id: string, expectedRevision: number): Promise<void> {
    await this.write(async () => { await this.current(id, expectedRevision); await this.db.blobs.where('draftKey').equals(this.key(id)).delete(); await this.db.prepared.where('draftKey').equals(this.key(id)).delete(); await this.db.drafts.delete(this.key(id)); });
  }
  async getBlob(id: string, photoId: string): Promise<Blob | undefined> {
    return this.db.transaction('r', this.db.drafts, this.db.blobs, async () => {
      const row = await this.db.drafts.get(this.key(id));
      if (!row?.collection.photos.some(p => p.id === photoId)) return undefined;
      return (await this.db.blobs.get(this.blobKey(id, photoId)))?.original;
    });
  }
  async attachPhoto(id: string, expectedRevision: number, pointId: string, original: Blob, input: PhotoInput): Promise<FieldCollection> {
    const photo: FieldPhoto = { id: input.id ?? crypto.randomUUID(), pointId, kind: input.kind,
      fileName: input.fileName ?? ('name' in original && typeof original.name === 'string' ? original.name : 'foto'), contentType: original.type, size: original.size,
      ...(('lastModified' in original || input.lastModified !== undefined) ? { lastModified: input.lastModified ?? (original as File).lastModified } : {}) };
    return this.write(async () => {
      const draft = await this.current(id, expectedRevision); this.editable(draft);
      const point = draft.points.find(p => p.id === pointId); if (!point) throw new Error('Quadro não encontrado.');
      if (draft.photos.some(p => p.id === photo.id)) throw new Error('Foto já anexada.');
      draft.photos.push(photo); point.photoIds.push(photo.id);
      // All operations share the transaction. Validation/write failure rolls the original back.
      await this.db.blobs.add({ key: this.blobKey(id, photo.id), draftKey: this.key(id), original });
      return this.persist(draft);
    });
  }
  async removePhoto(id: string, expectedRevision: number, photoId: string): Promise<FieldCollection> {
    return this.write(async () => {
      const draft = await this.current(id, expectedRevision); this.editable(draft);
      draft.photos = draft.photos.filter(p => p.id !== photoId);
      for (const point of draft.points) {
        const removedHotspots = point.hotspots.filter(h => (h.photoId === photoId || h.digitalPhotoId === photoId)).map(h => h.id);
        point.photoIds = point.photoIds.filter(p => p !== photoId);
        point.hotspots = point.hotspots.filter(h => h.photoId !== photoId && h.digitalPhotoId !== photoId);
        point.annotations = point.annotations.filter(a => a.photoId !== photoId && (!a.hotspotId || !removedHotspots.includes(a.hotspotId)));
      }
      await this.db.blobs.delete(this.blobKey(id, photoId)); await this.db.prepared.delete(this.blobKey(id, photoId)); return this.persist(draft);
    });
  }
  async getPreparedPhoto(id: string, photoId: string): Promise<PreparedPhoto | undefined> {
    const draft = await this.get(id); const original = draft?.photos.find(p => p.id === photoId);
    if (!original) return undefined;
    const row = await this.db.prepared.get(this.blobKey(id, photoId));
    if (row && JSON.stringify(row.photo.original) !== JSON.stringify(original)) throw new Error('Preparação incompatível com o original.');
    if (row) {
      const canonical = preparedPhotoPath(this.scope, id, original, row.photo.contentType);
      if (row.photo.photoId !== photoId || row.photo.storagePath !== canonical.storagePath || row.photo.fileName !== canonical.fileName || row.photo.size !== row.photo.blob.size || row.photo.contentType !== row.photo.blob.type) throw new Error('Metadados da preparação local não conferem. Originais preservados.');
    }
    return row?.photo;
  }
  /** Hashing happens before the short IndexedDB transaction; bytes and canonical descriptor commit together. */
  async putPreparedPhoto(id: string, expectedRevision: number, photo: PreparedPhoto): Promise<FieldCollection> {
    if (!(photo.blob instanceof Blob) || photo.size !== photo.blob.size || photo.contentType !== photo.blob.type || photo.size <= 0 || photo.size > MOBILE_MAX_FILE_BYTES || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width <= 0 || photo.height <= 0 || !/^[a-f0-9]{64}$/.test(photo.sha256) || await sha256Blob(photo.blob) !== photo.sha256) throw new Error('Bytes ou metadados da foto preparada inválidos.');
    if (photo.original.kind === 'termica') {
      const original = await this.getBlob(id, photo.photoId);
      if (!original || await sha256Blob(original) !== photo.sha256) throw new Error('Bytes da térmica original não podem ser alterados na preparação.');
    }
    return this.write(async () => {
      const draft = await this.current(id, expectedRevision); const original = draft.photos.find(p => p.id === photo.photoId);
      if (!original || JSON.stringify(original) !== JSON.stringify(photo.original)) throw new Error('Original da preparação não confere.');
      const canonical = preparedPhotoPath(this.scope, id, original, photo.contentType);
      if (canonical.storagePath !== photo.storagePath || canonical.fileName !== photo.fileName) throw new Error('Path da foto preparada inválido.');
      const existing = await this.db.prepared.get(this.blobKey(id, photo.photoId));
      if (existing) {
        const descriptor = (p: PreparedPhoto) => JSON.stringify({ ...p, blob: undefined });
        if (descriptor(existing.photo) !== descriptor(photo)) throw new Error('Preparação congelada já existe para esta foto.');
        return draft;
      }
      if (draft.sync.status === 'synced' || draft.sync.checkpoints.photoIds.includes(photo.photoId)) throw new Error('Foto enviada não pode ser preparada novamente.');
      await this.db.prepared.add({ key: this.blobKey(id, photo.photoId), draftKey: this.key(id), photo });
      return this.persist(draft);
    });
  }
  async queue(id: string, expectedRevision: number): Promise<FieldCollection> {
    return this.write(async () => {
      const draft = await this.current(id, expectedRevision); this.editable(draft); validateReadyToQueue(draft);
      for (const photo of draft.photos) {
        const blob = await this.db.blobs.get(this.blobKey(id, photo.id));
        if (!blob || blob.original.size !== photo.size) throw new Error('Original ausente. Recupere a foto antes do envio.');
      }
      draft.sync = { status: 'queued', snapshot: collectionSnapshot(draft), checkpoints: { report: false, pointIds: [], photoIds: [] } };
      return this.persist(draft);
    });
  }
  async setSyncState(id: string, expectedRevision: number, status: Exclude<SyncStatus, 'draft'>, error?: string): Promise<FieldCollection> {
    return this.write(async () => {
      const draft = await this.current(id, expectedRevision);
      if (draft.sync.status === 'draft' || draft.sync.status === 'synced') throw new Error('Transição de envio inválida.');
      if (status === 'synced' && (!draft.sync.checkpoints.report || draft.points.some(p => !draft.sync.checkpoints.pointIds.includes(p.id)) || draft.photos.some(p => !draft.sync.checkpoints.photoIds.includes(p.id)))) throw new Error('Envio não confirmado integralmente.');
      draft.sync.status = status; draft.sync.error = error;
      return this.persist(draft);
    });
  }
  async checkpoint(id: string, expectedRevision: number, update: Partial<SyncCheckpoints>): Promise<FieldCollection> {
    return this.write(async () => {
      const draft = await this.current(id, expectedRevision);
      if (draft.sync.status !== 'syncing') throw new Error('Checkpoint exige envio em andamento.');
      const current = draft.sync.checkpoints;
      draft.sync.checkpoints = { report: current.report || update.report === true,
        pointIds: [...new Set([...current.pointIds, ...(update.pointIds ?? [])])], photoIds: [...new Set([...current.photoIds, ...(update.photoIds ?? [])])] };
      return this.persist(draft);
    });
  }
}
