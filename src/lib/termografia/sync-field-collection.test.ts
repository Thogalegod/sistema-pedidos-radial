// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFieldCollection, createFieldPoint } from './field-collection';
import { DraftStore } from './offline-store';
import { prepareFieldCollection, syncFieldCollection } from './sync-field-collection';

const scope = { projectId: 'backend-a', origin: 'https://example.test', userId: '73e033ea-160c-483f-bce1-79339fb39936', organizationId: 'c1d48bc9-3599-40bf-8d63-6117fc39c9a4' };
const stores: DraftStore[] = [];
const names: string[] = [];
function open(name = crypto.randomUUID()) { names.push(name); const store = new DraftStore(scope, { name }); stores.push(store); return store; }
afterEach(async () => { stores.forEach(s => s.close()); for (const name of new Set(names.splice(0))) await Dexie.delete(name); stores.length = 0; });
async function draftWithPhotos(store: DraftStore) {
  let d = createFieldCollection(scope, { cliente_nome: 'Cliente' });
  d.points = [createFieldPoint({ setor: 'A', local: 'Quadro' })]; d = await store.create(d);
  for (const text of ['thermal-a', 'thermal-b']) d = await store.attachPhoto(d.id, d.revision, d.points[0].id, new Blob([text], { type: 'image/jpeg' }), { kind: 'termica', fileName: `${text}.jpg` });
  d.points[0].hotspots = d.photos.flatMap(p => [1, 2].map(n => ({ id: crypto.randomUUID(), photoId: p.id, componente: `Fase ${n}`, temperatura: '67', conclusao: 'Verificar' })));
  return store.save(d);
}
function remote() {
  const objects = new Map<string, Blob>(); const files = new Map<string, Record<string, unknown>>();
  let snapshot: { files: Record<string, unknown>[] } | undefined; let hash = ''; let state = 'pending';
  let listener: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
  let userId = scope.userId; let membership = true;
  const flags = { loseUpload: false, loseAppend: false, loseFinalize: false, failFinalize: false, corrupt: false, capability: true, switchOnUpload: false };
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
      onAuthStateChange: vi.fn((cb: typeof listener) => { listener = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; }) },
    from: vi.fn(() => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: membership ? { organization_id: scope.organizationId } : null, error: null }) }; return q; }),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (args.p_expected_user !== userId) return { data: null, error: new Error('Conta alterada') };
      if (name === 'termografia_mobile_capabilities') return { data: flags.capability ? { version: 1, maxFileBytes: 10485760 } : null, error: null };
      if (name === 'prepare_termografia_mobile') { snapshot = args.p_snapshot as typeof snapshot; hash = args.p_snapshot_hash as string; return { data: { id: args.p_report_id, snapshot_hash: hash, sync_state: state }, error: null }; }
      if (name === 'append_termografia_mobile_photo') {
        const f = snapshot!.files.find(f => f.id === args.p_file_id)!;
        if (!objects.has(f.storagePath as string)) return { data: null, error: new Error('Objeto ausente') };
        const row = { id: f.id, storage_path: f.storagePath, content_sha256: f.sha256, tamanho_bytes: f.size };
        files.set(f.id as string, row);
        if (flags.loseAppend) { flags.loseAppend = false; return { data: null, error: new Error('Resposta perdida') }; }
        return { data: row, error: null };
      }
      if (name === 'finalize_termografia_mobile') {
        if (flags.failFinalize) return { data: null, error: new Error('Finalize unavailable') };
        state = 'complete';
        if (flags.loseFinalize) { flags.loseFinalize = false; return { data: null, error: new Error('Resposta perdida') }; }
        return { data: { id: args.p_report_id, snapshot_hash: hash, sync_state: state }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }),
    storage: { from: () => ({
      upload: vi.fn(async (path: string, blob: Blob) => {
        if (objects.has(path)) return { error: { statusCode: '409' } };
        objects.set(path, blob);
        if (flags.switchOnUpload) { userId = crypto.randomUUID(); listener?.('SIGNED_IN', { user: { id: userId } }); }
        if (flags.loseUpload) { flags.loseUpload = false; return { error: new Error('Upload response lost') }; }
        return { error: null };
      }),
      download: vi.fn(async (path: string) => ({ data: flags.corrupt ? new Blob(['wrong']) : objects.get(path), error: null })),
    }) },
  };
  return { client, flags, objects, files, setUser: (id: string) => { userId = id; }, deny: () => { membership = false; } };
}
const preparePhoto = vi.fn(async (original: Blob) => ({ blob: original, width: 10, height: 10 }));
const options = { backendProjectId: scope.projectId, origin: scope.origin, preparePhoto };

describe('durable normalized mobile sync', () => {
  it('prepares exact immutable bytes before queue and reuses them after reopening', async () => {
    const name = crypto.randomUUID(); const s = open(name); const d = await draftWithPhotos(s);
    await prepareFieldCollection(s, d.id, options);
    const p = await s.getPreparedPhoto(d.id, d.photos[0].id);
    expect(p?.sha256).toMatch(/^[a-f0-9]{64}$/); expect(await p!.blob.text()).toBe('thermal-a');
    s.close(); const reopened = open(name);
    expect((await reopened.getPreparedPhoto(d.id, d.photos[0].id))?.storagePath).toBe(p?.storagePath);
    expect(await (await reopened.getBlob(d.id, d.photos[0].id))!.text()).toBe('thermal-a');
    await expect(reopened.putPreparedPhoto(d.id, (await reopened.get(d.id))!.revision, { ...p!, blob: new Blob(['changed']) })).rejects.toThrow();
  });
  it('sends all thermals and hotspots without replacing; confirms downloaded bytes then finalization', async () => {
    const s = open(); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote();
    const result = await syncFieldCollection(s, d.id, { ...options, client: r.client });
    expect(result.sync.status).toBe('synced'); expect(result.sync.checkpoints.report).toBe(true);
    expect(r.files.size).toBe(2); expect(r.objects.size).toBe(2);
    const payload = r.client.rpc.mock.calls.find(c => c[0] === 'prepare_termografia_mobile')![1].p_snapshot as { points: { metadata: { hotspots: unknown[] } }[] };
    expect(payload.points[0].metadata.hotspots).toHaveLength(4);
  });
  it('reconciles lost upload/registration/finalization responses with same IDs and canonical paths', async () => {
    const s = open(); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote();
    r.flags.loseUpload = r.flags.loseAppend = r.flags.loseFinalize = true;
    expect((await syncFieldCollection(s, d.id, { ...options, client: r.client })).sync.status).toBe('synced');
    expect(r.files.size).toBe(2); expect(r.objects.size).toBe(2);
  });
  it('keeps skeleton completion false on failed finalization and resumes frozen IDs after reopening', async () => {
    const name = crypto.randomUUID(); const s = open(name); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote(); r.flags.failFinalize = true;
    await expect(syncFieldCollection(s, d.id, { ...options, client: r.client })).rejects.toThrow();
    expect((await s.get(d.id))!.sync.checkpoints.report).toBe(false); s.close(); r.flags.failFinalize = false;
    expect((await syncFieldCollection(open(name), d.id, { ...options, client: r.client })).sync.status).toBe('synced');
    expect(r.objects.size).toBe(2);
  });
  it('fails on corrupted bytes even on first successful upload and preserves originals', async () => {
    const s = open(); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote(); r.flags.corrupt = true;
    await expect(syncFieldCollection(s, d.id, { ...options, client: r.client })).rejects.toThrow(/conteúdo|bytes/i);
    expect((await s.get(d.id))!.sync.checkpoints.photoIds).toEqual([]);
    expect(await (await s.getBlob(d.id, d.photos[0].id))!.text()).toBe('thermal-a');
  });
  it('rechecks checkpointed bytes after reopening and never finalizes altered content', async () => {
    const name = crypto.randomUUID(); const s = open(name); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote();
    r.flags.failFinalize = true;
    await expect(syncFieldCollection(s, d.id, { ...options, client: r.client })).rejects.toThrow();
    expect((await s.get(d.id))!.sync.checkpoints.photoIds).toHaveLength(2);
    const path = (await s.getPreparedPhoto(d.id, d.photos[0].id))!.storagePath;
    r.objects.set(path, new Blob(['tampered!'], { type: 'image/jpeg' }));
    s.close(); r.flags.failFinalize = false; r.client.rpc.mockClear();
    await expect(syncFieldCollection(open(name), d.id, { ...options, client: r.client })).rejects.toThrow(/conteúdo|bytes/i);
    expect(r.client.rpc.mock.calls.some(call => call[0] === 'finalize_termografia_mobile')).toBe(false);
  });
  it('restores a missing checkpointed object using its prepared canonical bytes', async () => {
    const s = open(); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote();
    r.flags.failFinalize = true; await expect(syncFieldCollection(s, d.id, { ...options, client: r.client })).rejects.toThrow();
    const prepared = (await s.getPreparedPhoto(d.id, d.photos[0].id))!;
    r.objects.delete(prepared.storagePath); r.flags.failFinalize = false;
    expect((await syncFieldCollection(s, d.id, { ...options, client: r.client })).sync.status).toBe('synced');
    expect(await r.objects.get(prepared.storagePath)!.text()).toBe('thermal-a');
    expect(r.objects.size).toBe(2);
  });
  it('refuses different configured backend/origin, changed user, exact membership and unsupported backend before uploads', async () => {
    for (const kind of ['backend', 'origin', 'user', 'membership', 'capability']) {
      const s = open(); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote();
      if (kind === 'user') r.setUser(crypto.randomUUID()); if (kind === 'membership') r.deny(); if (kind === 'capability') r.flags.capability = false;
      await expect(syncFieldCollection(s, d.id, { ...options, client: r.client, ...(kind === 'backend' ? { backendProjectId: 'other' } : {}), ...(kind === 'origin' ? { origin: 'https://other.test' } : {}) })).rejects.toThrow();
      expect(r.objects.size).toBe(0);
    }
  });
  it('stops new operations after account changes during upload', async () => {
    const s = open(); let d = await draftWithPhotos(s); d = await s.queue(d.id, d.revision); const r = remote(); r.flags.switchOnUpload = true;
    await expect(syncFieldCollection(s, d.id, { ...options, client: r.client })).rejects.toThrow(/conta|sessão/i);
    expect(r.objects.size).toBe(1); expect(r.files.size).toBe(0);
    expect(r.client.rpc.mock.calls.some(c => c[0] === 'finalize_termografia_mobile')).toBe(false);
  });
  it('keeps preparation failure editable before queue and marks failed after a partial queued preparation', async () => {
    const s = open(); const d = await draftWithPhotos(s);
    const invalidPrepare = async () => { throw new Error('Formato incompatível; original preservado'); };
    await expect(prepareFieldCollection(s, d.id, { ...options, preparePhoto: invalidPrepare })).rejects.toThrow(/Formato/);
    expect((await s.get(d.id))!.sync.status).toBe('draft');
    let queued = await s.queue(d.id, d.revision); let attempts = 0; const r = remote();
    await expect(syncFieldCollection(s, queued.id, { ...options, client: r.client, preparePhoto: async original => {
      if (++attempts === 2) throw new Error('Formato incompatível'); return { blob: original, width: 10, height: 10 };
    } })).rejects.toThrow(/Formato/);
    queued = (await s.get(d.id))!;
    expect(queued.sync.status).toBe('failed'); expect(queued.sync.checkpoints.report).toBe(false); expect(r.objects.size).toBe(0);
    expect(await (await s.getBlob(d.id, d.photos[1].id))!.text()).toBe('thermal-b');
  });
});
