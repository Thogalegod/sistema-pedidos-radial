import { pointMetadata, scopeKey, type FieldCollection, type OfflineScope } from './field-collection';
import { DraftStore, RevisionConflictError } from './offline-store';
import { MOBILE_MAX_FILE_BYTES, preparedPhotoPath, prepareFieldPhoto, sha256Blob, type PreparePhoto, type PreparedPhoto } from './prepared-photo';
import { TERMOGRAFIA_DOCUMENT_BUCKET } from './paths';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Result { data: unknown; error: unknown }
interface Query { eq(column: string, value: string): Query; maybeSingle(): PromiseLike<Result> }
export interface MobileTermografiaClient {
  auth: {
    getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
    onAuthStateChange(callback: (event: string, session: { user: { id: string } } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
  from(table: string): { select(columns: string): Query };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result>;
  storage: { from(bucket: string): {
    upload(path: string, blob: Blob, options: { contentType: string; upsert: boolean }): PromiseLike<{ error: unknown }>;
    download(path: string): PromiseLike<{ data: Blob | null | undefined; error: unknown }>;
  } };
}

/** Normalize the generic SDK builders at the boundary without casting its results. */
export function mobileTermografiaClient(client: SupabaseClient): MobileTermografiaClient {
  return {
    auth: {
      getUser: async () => { const { data, error } = await client.auth.getUser(); return { data: { user: data.user }, error }; },
      onAuthStateChange: callback => client.auth.onAuthStateChange((event, session) => callback(event, session)),
    },
    from: table => ({ select: columns => {
      let query = client.from(table).select(columns);
      const filters: Query = {
        eq: (column, value) => { query = query.eq(column, value); return filters; },
        maybeSingle: async () => { const { data, error } = await query.maybeSingle(); return { data, error }; },
      };
      return filters;
    } }),
    rpc: async (name, args) => { const { data, error } = await client.rpc(name, args); return { data, error }; },
    storage: { from: bucket => ({
      upload: async (path, blob, options) => { const { error } = await client.storage.from(bucket).upload(path, blob, options); return { error }; },
      download: async path => { const { data, error } = await client.storage.from(bucket).download(path); return { data, error }; },
    }) },
  };
}
export interface PreparationOptions { backendProjectId: string; origin: string; preparePhoto?: PreparePhoto }
export interface SyncProgress { phase: 'preparing' | 'report' | 'photo' | 'finalizing' | 'complete'; completedPhotos: number; totalPhotos: number; photoId?: string }
export interface SyncOptions extends PreparationOptions {
  client: MobileTermografiaClient; signal?: AbortSignal; isScopeCurrent?: () => boolean; onProgress?: (progress: SyncProgress) => void;
}
export interface MobileSnapshot {
  version: 1; sourceReportId?: string; report: FieldCollection['report'];
  points: { id: string; ordem: number; setor: string; local: string; equipamento: string | null; metadata: ReturnType<typeof pointMetadata> }[];
  files: { id: string; pointId: string; kind: 'digital' | 'termica'; fileName: string; storagePath: string; contentType: string; size: number; sha256: string; width: number; height: number }[];
}
function mobileReportPayload(report: FieldCollection['report']): FieldCollection['report'] {
  return { cliente_nome: report.cliente_nome, data_execucao: report.data_execucao,
    cliente_cnpj: report.cliente_cnpj || null, cliente_endereco: report.cliente_endereco || null, cliente_cidade: report.cliente_cidade || null,
    cliente_uf: report.cliente_uf || null, cliente_cep: report.cliente_cep || null,
    objetivo: report.objetivo ?? 'Estudo Termográfico da subestação primária e dos painéis elétricos', equipamento: report.equipamento ?? 'InfiRay T2S Plus',
    responsavel_nome: report.responsavel_nome ?? 'Roberto Fontes Lopes', responsavel_crea: report.responsavel_crea ?? '0601049229',
    revisao: report.revisao ?? 0, status: report.status ?? 'gerado' };
}
function assertDestination(scope: OfflineScope, options: PreparationOptions) {
  if (scope.projectId !== options.backendProjectId || scope.origin !== options.origin || (typeof window !== 'undefined' && window.location.origin !== options.origin)) throw new Error('Esta coleta pertence a outro projeto ou endereço. Reabra na conta e no destino originais.');
}
function fail(error: unknown): never { if (error instanceof Error) throw error; throw new Error(typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Falha ao comunicar com o servidor de Termografia.'); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Confirmação do servidor incompatível.'); return value as Record<string, unknown>; }
async function requireDraft(store: DraftStore, id: string) { const draft = await store.get(id); if (!draft) throw new Error('Coleta local não encontrada.'); return draft; }

/** Call while editable, before queue(): unsupported/oversize originals can then be replaced without unlocking a send. */
export async function prepareFieldCollection(store: DraftStore, id: string, options: PreparationOptions): Promise<FieldCollection> {
  let draft = await requireDraft(store, id); assertDestination(draft.scope, options);
  for (const photo of draft.photos) {
    const existing = await store.getPreparedPhoto(id, photo.id);
    if (existing) {
      if (existing.sha256 !== await sha256Blob(existing.blob) || existing.blob.size !== existing.size) throw new Error('Bytes da preparação local não conferem. Originais preservados.');
      continue;
    }
    const original = await store.getBlob(id, photo.id);
    if (!original || original.size !== photo.size) throw new Error('Original ausente ou incompleto; envio interrompido.');
    const image = await (options.preparePhoto ?? prepareFieldPhoto)(original, photo);
    // Even custom preparation cannot alter thermal evidence.
    if (photo.kind === 'termica' && await sha256Blob(image.blob) !== await sha256Blob(original)) throw new Error('A preparação não pode alterar os bytes da térmica original.');
    const prepared: PreparedPhoto = { photoId: photo.id, original: photo, ...image, ...preparedPhotoPath(draft.scope, id, photo, image.blob.type), contentType: image.blob.type, size: image.blob.size, sha256: await sha256Blob(image.blob) };
    draft = await store.putPreparedPhoto(id, draft.revision, prepared);
  }
  return draft;
}

async function validateIdentity(client: MobileTermografiaClient, scope: OfflineScope) {
  const user = await client.auth.getUser(); if (user.error) fail(user.error);
  if (user.data.user?.id !== scope.userId) throw new Error('A conta mudou ou a sessão expirou. Entre na conta original antes de enviar.');
  const member = await client.from('organization_members').select('organization_id').eq('user_id', scope.userId).eq('organization_id', scope.organizationId).maybeSingle();
  if (member.error) fail(member.error);
  if (!member.data || object(member.data).organization_id !== scope.organizationId) throw new Error('Sem acesso à organização original desta coleta.');
}
const running = new Set<string>();
/** Only explicitly queued immutable snapshots are sent. Originals and prepared bytes are never deleted here. */
export async function syncFieldCollection(store: DraftStore, id: string, options: SyncOptions): Promise<FieldCollection> {
  let draft = await requireDraft(store, id); assertDestination(draft.scope, options);
  if (draft.sync.status === 'draft') throw new Error('Confira e enfileire a coleta antes do envio.');
  if (draft.sync.status === 'synced') return draft;
  const runKey = `${scopeKey(draft.scope)}:${id}`; if (running.has(runKey)) throw new Error('Esta coleta já está sendo enviada nesta aba.');
  running.add(runKey);
  let identityChanged = false; let ownsState = false;
  const subscription = options.client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (session && session.user.id !== store.scope.userId)) identityChanged = true;
  }).data.subscription;
  const guard = () => {
    assertDestination(store.scope, options);
    if (identityChanged || options.signal?.aborted || options.isScopeCurrent?.() === false) throw new Error('Conta, organização ou sessão mudou. Envio interrompido; os originais continuam salvos.');
  };
  const rpc = async (name: string, args: Record<string, unknown>, reconcile = false) => {
    guard(); const result = await options.client.rpc(name, { p_expected_user: store.scope.userId, ...args });
    guard();
    if (result.error && reconcile) { guard(); const retry = await options.client.rpc(name, { p_expected_user: store.scope.userId, ...args }); guard(); if (retry.error) fail(retry.error); return object(retry.data); }
    if (result.error) fail(result.error); return object(result.data);
  };
  const progress = (phase: SyncProgress['phase'], photoId?: string) => options.onProgress?.({ phase, completedPhotos: draft.sync.checkpoints.photoIds.length, totalPhotos: draft.photos.length, ...(photoId ? { photoId } : {}) });
  try {
    guard(); await validateIdentity(options.client, store.scope); guard();
    let capability: Record<string, unknown>;
    try { capability = await rpc('termografia_mobile_capabilities', {}); }
    catch (cause) { guard(); throw new Error('O servidor ainda não suporta esta coleta móvel ou está indisponível. Mantenha o rascunho/cópia e tente após a atualização.', { cause }); }
    if (capability.version !== 1 || capability.maxFileBytes !== MOBILE_MAX_FILE_BYTES) throw new Error('O servidor ainda não suporta esta coleta móvel. Mantenha o rascunho/cópia e tente após a atualização.');
    draft = await store.setSyncState(id, draft.revision, 'syncing'); ownsState = true;
    progress('preparing'); draft = await prepareFieldCollection(store, id, options); guard();
    const frozen = draft.sync.snapshot!;
    const payload: MobileSnapshot = { version: 1, ...(frozen.sourceReportId ? { sourceReportId: frozen.sourceReportId } : {}), report: mobileReportPayload(frozen.report),
      points: frozen.points.map((p, i) => ({ id: p.id, ordem: i + 1, setor: p.setor, local: p.local, equipamento: p.equipamento ?? null, metadata: pointMetadata(p) })), files: [] };
    for (const p of frozen.photos) {
      const prepared = (await store.getPreparedPhoto(id, p.id))!;
      payload.files.push({ id: p.id, pointId: p.pointId, kind: p.kind, fileName: prepared.fileName, storagePath: prepared.storagePath, contentType: prepared.contentType, size: prepared.size, sha256: prepared.sha256, width: prepared.width, height: prepared.height });
    }
    const hash = await sha256Blob(new Blob([JSON.stringify(payload)]));
    const args = { p_organization_id: store.scope.organizationId, p_report_id: id, p_snapshot_hash: hash };
    const confirm = (row: Record<string, unknown>, complete = false) => {
      if (row.id !== id || row.snapshot_hash !== hash || (complete && row.sync_state !== 'complete')) throw new Error('Snapshot remoto não foi confirmado. Os originais permanecem salvos.');
    };
    progress('report'); const report = await rpc('prepare_termografia_mobile', { ...args, p_snapshot: payload }, true); confirm(report);
    draft = await store.checkpoint(id, draft.revision, { pointIds: frozen.points.map(p => p.id) });
    for (const p of frozen.photos) {
      guard(); progress('photo', p.id); const prepared = (await store.getPreparedPhoto(id, p.id))!;
      if (draft.sync.checkpoints.photoIds.includes(p.id)) {
        // A local acknowledgement is not proof that the server still has the same bytes.
        guard();
        const existing = await options.client.storage.from(TERMOGRAFIA_DOCUMENT_BUCKET).download(prepared.storagePath); guard();
        if (existing.data && !existing.error) {
          if (existing.data.size !== prepared.size || await sha256Blob(existing.data) !== prepared.sha256) throw new Error('O conteúdo em bytes da foto já enviada mudou. Originais preservados; envio não concluído.');
          continue;
        }
        // Restore a missing canonical object from the exact persisted preparation.
        // A temporary network failure still fails below; no success is inferred from the checkpoint.
      }
      guard();
      // An uncertain upload may have committed. Registration of this exact stable path is the reconciliation.
      try { await options.client.storage.from(TERMOGRAFIA_DOCUMENT_BUCKET).upload(prepared.storagePath, prepared.blob, { contentType: prepared.contentType, upsert: false }); }
      catch { /* Registration below distinguishes committed objects from missing uploads, without deleting either. */ }
      guard(); const saved = await rpc('append_termografia_mobile_photo', { ...args, p_file_id: p.id }, true);
      if (saved.id !== p.id || saved.storage_path !== prepared.storagePath || saved.content_sha256 !== prepared.sha256 || Number(saved.tamanho_bytes) !== prepared.size) throw new Error('Metadados da foto remota não conferem.');
      guard(); const downloaded = await options.client.storage.from(TERMOGRAFIA_DOCUMENT_BUCKET).download(prepared.storagePath); guard();
      if (downloaded.error) fail(downloaded.error);
      if (!downloaded.data || downloaded.data.size !== prepared.size || await sha256Blob(downloaded.data) !== prepared.sha256) throw new Error('O conteúdo em bytes da foto enviada não confere. Originais preservados; envio não concluído.');
      draft = await store.checkpoint(id, draft.revision, { photoIds: [p.id] });
    }
    progress('finalizing'); guard(); await validateIdentity(options.client, store.scope); guard();
    confirm(await rpc('finalize_termografia_mobile', args, true), true);
    // report=true means authoritative finalization, never merely a report skeleton.
    draft = await store.checkpoint(id, draft.revision, { report: true });
    draft = await store.setSyncState(id, draft.revision, 'synced'); progress('complete'); return draft;
  } catch (error) {
    if (ownsState && !(error instanceof RevisionConflictError)) {
      try {
        // Preparation commits one file at a time and can fail after an earlier
        // prepared file advanced the revision. The snapshot remains frozen.
        const latest = await requireDraft(store, id);
        if (latest.sync.status === 'syncing') draft = await store.setSyncState(id, latest.revision, 'failed', error instanceof Error ? error.message : 'Falha ao enviar.');
      } catch { /* A concurrent tab owns the newer revision; never overwrite it. */ }
    }
    throw error;
  } finally { subscription.unsubscribe(); running.delete(runKey); }
}
