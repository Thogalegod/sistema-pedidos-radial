import type { FieldCollection, FieldPhoto } from './field-collection';
import { DraftStore, RevisionConflictError } from './offline-store';

type Change = (draft: FieldCollection) => void;
interface Operation { apply: Change; persist: (base: FieldCollection) => Promise<FieldCollection> }
export interface CollectorState { draft: FieldCollection; saved: boolean; saving: boolean; error?: string; conflict: boolean }

/** Rebase queued user intents on each committed revision, including atomic photo operations.
 * Failed intents (and original Files) remain in memory until retry or explicit reload. */
export class CollectorSession {
  state: CollectorState;
  private committed: FieldCollection;
  private pending: Operation[] = [];
  private running?: Promise<void>;
  private stopped = false;
  private listeners = new Set<() => void>();
  constructor(readonly store: DraftStore, draft: FieldCollection) {
    this.committed = draft; this.state = { draft, saved: true, saving: false, conflict: false };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<CollectorState> = {}) {
    if (this.stopped) return;
    let draft = structuredClone(this.committed);
    // An intent may insert a newly created point/object captured by its closure.
    // Detach it before applying later intents, so optimistic edits cannot mutate
    // the earlier intent and corrupt its retry payload.
    for (const operation of this.pending) { operation.apply(draft); draft = structuredClone(draft); }
    this.state = { ...this.state, draft, saved: this.pending.length === 0 && !this.state.error, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private enqueue(operation: Operation) {
    if (this.stopped || this.committed.sync.status !== 'draft') throw new Error('Esta coleta está somente para leitura. Crie uma cópia para editar.');
    this.pending.push(operation); this.publish({ saved: false });
    if (!this.state.error) void this.drain().catch(() => { /* error is visible in state; flush/retry can reject */ });
  }
  edit(change: Change) {
    this.enqueue({ apply: change, persist: base => { const next = structuredClone(base); change(next); return this.store.save(next); } });
  }
  attach(pointId: string, file: File, kind: FieldPhoto['kind']) {
    const photo: FieldPhoto = { id: crypto.randomUUID(), pointId, kind, fileName: file.name, contentType: file.type, size: file.size, lastModified: file.lastModified };
    this.enqueue({ apply: draft => { draft.photos.push(photo); draft.points.find(p => p.id === pointId)!.photoIds.push(photo.id); },
      persist: base => this.store.attachPhoto(base.id, base.revision, pointId, file, { kind, id: photo.id, fileName: file.name, lastModified: file.lastModified }) });
    return photo.id;
  }
  removePhoto(photoId: string) {
    this.enqueue({ apply: draft => {
      draft.photos = draft.photos.filter(photo => photo.id !== photoId);
      for (const point of draft.points) {
        const removed = new Set(point.hotspots.filter(h => (h.photoId === photoId || h.digitalPhotoId === photoId)).map(h => h.id));
        point.photoIds = point.photoIds.filter(id => id !== photoId); point.hotspots = point.hotspots.filter(h => h.photoId !== photoId && h.digitalPhotoId !== photoId);
        point.annotations = point.annotations.filter(a => a.photoId !== photoId && (!a.hotspotId || !removed.has(a.hotspotId)));
      }
    }, persist: base => this.store.removePhoto(base.id, base.revision, photoId) });
  }
  private drain(): Promise<void> {
    if (this.running) return this.running;
    if (!this.pending.length || this.stopped) return Promise.resolve();
    this.running = (async () => {
      this.publish({ saving: true });
      try {
        while (this.pending.length && !this.stopped) {
          const next = await this.pending[0].persist(this.committed);
          this.committed = next; this.pending.shift(); this.publish({ error: undefined, conflict: false });
        }
      } catch (error) {
        this.publish({ error: error instanceof Error ? error.message : 'Falha ao salvar localmente. Mantenha esta aba aberta.', conflict: error instanceof RevisionConflictError, saved: false });
        throw error;
      } finally { this.running = undefined; this.publish({ saving: false, saved: !this.pending.length && !this.state.error }); }
    })();
    return this.running;
  }
  async flush() {
    if (this.state.error) throw new Error(this.state.error);
    await this.drain();
    if (this.stopped) throw new Error('Conta alterada; operação interrompida.');
  }
  async retry() {
    if (this.state.conflict) throw new Error('Reabra a versão salva antes de continuar. Sua edição ainda está nesta tela.');
    this.publish({ error: undefined }); await this.drain();
  }
  /** Only after flush and with controls locked; external preparation/sync advances revisions. */
  adopt(draft: FieldCollection) { if (this.pending.length) throw new Error('Há alterações locais pendentes.'); this.committed = draft; this.publish({ error: undefined, saved: true }); }
  dispose() { this.stopped = true; this.listeners.clear(); }
}
