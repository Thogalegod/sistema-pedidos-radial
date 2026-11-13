import 'fake-indexeddb/auto';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftStore } from '@/lib/termografia/offline-store';
import { createFieldCollection, createFieldPoint } from '@/lib/termografia/field-collection';
import { clearLocalIdentity, readLocalIdentity, saveLocalIdentity } from '@/lib/termografia/local-identity';
import { useFieldCollector } from './useFieldCollector';
const mock = vi.hoisted(() => ({ shell: vi.fn(), sync: vi.fn(), prepare: vi.fn(), getUser: vi.fn(), membership: vi.fn(), authChanged: undefined as ((event: string, session: { user: { id: string } } | null) => void) | undefined }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: mock.getUser, onAuthStateChange: (callback: typeof mock.authChanged) => { mock.authChanged = callback; return { data: { subscription: { unsubscribe: () => {} } } }; } },
  from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: mock.membership }) }) }) }),
} }));
vi.mock('@/lib/termografia/sync-field-collection', () => ({ syncFieldCollection: mock.sync, prepareFieldCollection: mock.prepare, mobileTermografiaClient: (client: unknown) => client }));
vi.mock('@/lib/termografia/offline-shell', () => ({ getOfflineReadiness: async () => ({ ready: false }), prepareOfflineShell: mock.shell }));
const scope = { projectId: 'project', origin: window.location.origin, userId: 'user', organizationId: 'org' };
let store: DraftStore;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  localStorage.clear(); saveLocalIdentity(scope);
  store = new DraftStore(scope);
  mock.getUser.mockReset().mockImplementation(() => new Promise(() => {}));
  mock.sync.mockReset(); mock.prepare.mockReset(); mock.shell.mockReset().mockResolvedValue({ ready: true });
  mock.membership.mockReset(); mock.authChanged = undefined;
});
afterEach(async () => { cleanup(); store.close(); await store.db.delete(); vi.unstubAllEnvs(); });
async function draft() { const d = createFieldCollection(scope, { cliente_nome: 'Recuperado' }); d.points.push(createFieldPoint({ setor: 'Sala', local: 'QD1' })); d.activePointId = d.points[0].id; return store.create(d); }
describe('prepared collector access and send authorization', () => {
  it('creates a new collection without an empty panel and preserves the editor on cold reopen', async () => {
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    expect(view.result.current.state?.draft.points).toHaveLength(0);
    await waitFor(() => expect(view.result.current.busy).toBe(false));
    act(() => view.result.current.edit(d => { const p = createFieldPoint({ setor: 'Sala', local: 'Q1' }); d.points.push(p); d.activePointId = p.id; }));
    await act(() => view.result.current.flush());
    const id = view.result.current.state!.draft.id;
    window.history.replaceState({}, '', `/termografia/nova?rascunho=${id}&tela=point`);
    view.unmount();
    const reopened = renderHook(useFieldCollector);
    await waitFor(() => expect(reopened.result.current.state?.draft.id).toBe(id));
    expect(new URLSearchParams(window.location.search).get('tela')).toBe('point');
  });
  it('keeps saving edits while automatic shell preparation is pending, without queueing', async () => {
    const original = await draft();
    let finish!: (value: { ready: boolean }) => void;
    mock.shell.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(mock.shell).toHaveBeenCalledOnce());
    await waitFor(() => expect(view.result.current.busy).toBe(false));
    expect(view.result.current.preparingOffline).toBe(true);
    act(() => view.result.current.edit(d => { d.report.cliente_nome = 'Preenchendo normalmente'; }));
    await act(() => view.result.current.flush());
    expect((await store.get(original.id))?.report.cliente_nome).toBe('Preenchendo normalmente');
    expect((await store.get(original.id))?.sync.status).toBe('draft');
    expect(mock.sync).not.toHaveBeenCalled();
    await act(async () => finish({ ready: true }));
  });
  it('restores the explicitly selected older draft on remount', async () => {
    const first = await draft();
    const second = createFieldCollection(scope, { cliente_nome: 'Outro cliente' }); second.points.push(createFieldPoint({ setor: 'B', local: 'Q2' })); await store.create(second);
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await waitFor(() => expect(view.result.current.busy).toBe(false));
    await act(() => view.result.current.open(first.id));
    expect(new URLSearchParams(window.location.search).get('rascunho')).toBe(first.id);
    view.unmount();
    const reopened = renderHook(useFieldCollector);
    await waitFor(() => expect(reopened.result.current.state?.draft.id).toBe(first.id));
  });
  it.each(['local-revoke', 'SIGNED_OUT', 'other-user'])('never resurrects first-boot identity after %s during membership lookup', async event => {
    clearLocalIdentity();
    mock.getUser.mockResolvedValue({ data: { user: { id: scope.userId } }, error: null });
    let finish!: (value: unknown) => void;
    mock.membership.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(mock.membership).toHaveBeenCalled());
    act(() => {
      if (event === 'local-revoke') clearLocalIdentity();
      else mock.authChanged?.(event === 'other-user' ? 'SIGNED_IN' : event, event === 'other-user' ? { user: { id: 'different-user' } } : null);
    });
    await act(async () => finish({ data: { organization_id: scope.organizationId }, error: null }));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(readLocalIdentity(scope.projectId, scope.origin)).toBeNull();
    expect(view.result.current.state).toBeNull();
  });
  it('opens prepared local draft without waiting for network auth and recovers it on remount', async () => {
    await draft(); const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state?.draft.report.cliente_nome).toBe('Recuperado'));
    act(() => view.result.current.edit(d => { d.report.cliente_nome = 'Salvo offline'; }));
    await act(() => view.result.current.flush()); view.unmount();
    const reopened = renderHook(useFieldCollector);
    await waitFor(() => expect(reopened.result.current.state?.draft.report.cliente_nome).toBe('Salvo offline'));
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it('hides active data immediately when local identity is revoked', async () => {
    await draft(); const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    act(() => clearLocalIdentity());
    expect(view.result.current.state).toBeNull(); expect(view.result.current.drafts).toEqual([]);
    expect(view.result.current.error).toContain('conta');
  });
  it('online event sends only the previously authorized queue, never editable drafts', async () => {
    const editable = await draft(); let queued = await draft(); queued = await store.queue(queued.id, queued.revision);
    mock.sync.mockImplementation(async (_store: DraftStore, id: string) => (await store.get(id))!);
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(mock.sync).toHaveBeenCalled());
    expect(mock.sync.mock.calls.every(call => call[1] === queued.id)).toBe(true);
    expect(mock.sync.mock.calls.some(call => call[1] === editable.id)).toBe(false);
  });
  it('keeps an invalid-photo preparation editable with its original metadata and a visible error', async () => {
    const original = await draft();
    mock.prepare.mockRejectedValueOnce(new Error('Formato não suportado; original preservado'));
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await waitFor(() => expect(view.result.current.busy).toBe(false));
    await act(() => view.result.current.authorizeSend());
    expect(view.result.current.error).toContain('original preservado');
    expect((await store.get(original.id))?.sync.status).toBe('draft');
    expect(mock.sync).not.toHaveBeenCalled();
  });
  it('freezes the version only after explicit authorization, keeping an offline queue', async () => {
    const original = await draft();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mock.prepare.mockImplementation(async (source: DraftStore, id: string) => (await source.get(id))!);
    const view = renderHook(useFieldCollector);
    await waitFor(() => expect(view.result.current.state).not.toBeNull());
    await waitFor(() => expect(view.result.current.busy).toBe(false));
    expect((await store.get(original.id))?.sync.status).toBe('draft');
    await act(() => view.result.current.authorizeSend());
    expect((await store.get(original.id))?.sync.status).toBe('queued');
    expect(view.result.current.state?.draft.sync.snapshot?.id).toBe(original.id);
    expect(mock.sync).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
