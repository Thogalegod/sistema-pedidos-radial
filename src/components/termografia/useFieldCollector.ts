'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createFieldCollection, scopeKey, type FieldCollection, type OfflineScope } from '@/lib/termografia/field-collection';
import { CollectorSession, type CollectorState } from '@/lib/termografia/collector-session';
import { DraftStore } from '@/lib/termografia/offline-store';
import { backendProjectId, readLocalIdentity, saveLocalIdentity, subscribeLocalIdentity } from '@/lib/termografia/local-identity';
import { useOfflinePreparation } from './useOfflinePreparation';
import { mobileTermografiaClient, prepareFieldCollection, syncFieldCollection, type SyncProgress } from '@/lib/termografia/sync-field-collection';
import { exportFieldCollection, importFieldCollection } from '@/lib/termografia/backup';
import { importReportRevision } from '@/lib/termografia/report-revision';
import { collectorUrl, initialCollectorView } from './collectorNavigation';

const message = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Mantenha esta aba aberta e tente novamente.';
export function useFieldCollector() {
  const [state, setState] = useState<CollectorState | null>(null);
  const [store, setStore] = useState<DraftStore | null>(null);
  const [drafts, setDrafts] = useState<FieldCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const offline = useOfflinePreparation(!!state);
  const [progress, setProgress] = useState<string>();
  const storeRef = useRef<DraftStore | null>(null);
  const sessionRef = useRef<CollectorSession | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef(new AbortController());
  const revisionJob = useRef<Promise<FieldCollection> | null>(null);
  const scopeRef = useRef<OfflineScope | null>(null);

  const bind = useCallback((store: DraftStore, draft: FieldCollection) => {
    unsubscribeRef.current?.(); sessionRef.current?.dispose();
    const session = new CollectorSession(store, draft); sessionRef.current = session;
    setState(session.state); unsubscribeRef.current = session.subscribe(() => setState(session.state));
    // Survive a cold return from the camera and consume one-shot revision imports.
    // Keep Next's history state, but make the actual document URL select this draft.
    window.history.replaceState(window.history.state, '', collectorUrl(draft.id, initialCollectorView(draft, window.location.search)));
  }, []);
  const current = useCallback(() => {
    const scope = scopeRef.current;
    return !!scope && !abortRef.current.signal.aborted && scopeKey(readLocalIdentity(scope.projectId, scope.origin)?.scope ?? { projectId: '', origin: '', userId: '', organizationId: '' }) === scopeKey(scope);
  }, []);
  const refresh = useCallback(async () => {
    const store = storeRef.current; if (!store) return;
    const list = await store.list(); if (current()) setDrafts(list);
  }, [current]);
  const resume = useCallback(async () => {
    const store = storeRef.current;
    if (!store || busyRef.current || !current() || !navigator.onLine) return;
    busyRef.current = true; setBusy(true); setError(undefined);
    try {
      const list = await store.list();
      for (const draft of list) {
        if (draft.sync.status === 'draft' || draft.sync.status === 'synced') continue;
        if (!current()) break;
        const onProgress = (p: SyncProgress) => { if (current()) setProgress(`Enviando: ${p.completedPhotos}/${p.totalPhotos} fotos confirmadas${p.phase === 'finalizing' ? ' · finalizando relatório' : ''}`); };
        try {
          const saved = await syncFieldCollection(store, draft.id, { client: mobileTermografiaClient(supabase), backendProjectId: store.scope.projectId, origin: store.scope.origin, signal: abortRef.current.signal, isScopeCurrent: current, onProgress });
          if (current() && sessionRef.current?.state.draft.id === draft.id) sessionRef.current.adopt(saved);
        } catch (cause) {
          if (!current()) break;
          const saved = await store.get(draft.id);
          if (saved && sessionRef.current?.state.draft.id === draft.id) sessionRef.current.adopt(saved);
          setError(message(cause)); break;
        }
      }
      await refresh();
    } catch (cause) { if (current()) setError(message(cause)); }
    finally { busyRef.current = false; if (current()) { setBusy(false); setProgress(undefined); } }
  }, [current, refresh]);

  useEffect(() => {
    let alive = true, bootRevoked = false, establishingBinding = false;
    let bootUserId: string | undefined;
    let observedUserId: string | undefined;
    const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const projectId = project ? backendProjectId(project) : '', origin = window.location.origin;
    const invalidateAccess = () => {
      bootRevoked = true;
      abortRef.current.abort(); sessionRef.current?.dispose(); unsubscribeRef.current?.();
      sessionRef.current = null; storeRef.current?.close(); storeRef.current = null; scopeRef.current = null;
      setState(null); setStore(null); setDrafts([]); setBusy(false); setLoading(false);
      setError('A conta ou organização mudou. Os rascunhos anteriores foram ocultados. Reabra a coleta após entrar na conta desejada.');
    };
    const revoke = subscribeLocalIdentity(() => {
      if (establishingBinding || (scopeRef.current && current())) return;
      invalidateAccess();
    });
    // There may not be a stored identity for the global observer to revoke yet.
    // Observe auth directly while first-login getUser/membership calls are pending.
    const authSubscription = supabase.auth.onAuthStateChange?.((event, session) => {
      if (!alive) return;
      if (event === 'SIGNED_OUT') { invalidateAccess(); return; }
      if (session?.user.id) {
        observedUserId = session.user.id;
        if ((bootUserId && bootUserId !== observedUserId) || (scopeRef.current && scopeRef.current.userId !== observedUserId)) invalidateAccess();
      }
    }).data.subscription;
    const boot = async () => {
      if (!project) throw new Error('O projeto de Termografia não está configurado.');
      let identity = readLocalIdentity(projectId, origin);
      if (!identity) {
        if (!navigator.onLine) throw new Error('Conecte-se e entre na sua conta para preparar a primeira coleta neste celular.');
        const user = await supabase.auth.getUser();
        if (!alive || bootRevoked) return;
        if (user.error || !user.data.user) throw new Error('Entre na sua conta com internet antes da primeira preparação.');
        bootUserId = user.data.user.id;
        if (observedUserId && observedUserId !== bootUserId) { invalidateAccess(); return; }
        const membership = await supabase.from('organization_members').select('organization_id').eq('user_id', user.data.user.id).limit(1).maybeSingle();
        if (!alive || bootRevoked) return;
        if (membership.error || !membership.data?.organization_id) throw new Error('Não foi possível validar sua organização. Confira a conexão e tente novamente.');
        establishingBinding = true;
        try { identity = saveLocalIdentity({ projectId, origin, userId: user.data.user.id, organizationId: membership.data.organization_id }); }
        finally { establishingBinding = false; }
      }
      if (!alive || bootRevoked) return;
      abortRef.current = new AbortController(); scopeRef.current = identity.scope;
      const store = new DraftStore(identity.scope); storeRef.current = store; setStore(store);
      let list = await store.list();
      if (!alive || !current()) return;
      const params = new URLSearchParams(window.location.search);
      const revisionId = params.get('revisar');
      if (revisionId) {
        if (!navigator.onLine) setError('Conecte-se para buscar o relatório e criar a revisão. Seus rascunhos locais continuam disponíveis.');
        else {
          setProgress('Baixando relatório e originais para revisão…');
          revisionJob.current ??= importReportRevision(store, mobileTermografiaClient(supabase), revisionId, (done, total) => { if (alive && current()) setProgress(`Revisão: ${done}/${total} originais conferidos`); }, abortRef.current.signal);
          try { const imported = await revisionJob.current; if (!alive || !current()) return; list = [imported, ...list]; }
          catch (cause) { if (alive && current()) setError(message(cause)); }
          finally { if (alive) setProgress(undefined); }
        }
      }
      if (!alive || !current()) return;
      if (!list.length) {
        const draft = createFieldCollection(store.scope);
        list = [await store.create(draft)];
      }
      if (!alive || !current()) return;
      setDrafts(list);
      bind(store, list.find(d => d.id === params.get('rascunho')) ?? list[0]); setLoading(false);
      void resume();
    };
    void boot().catch(cause => { if (alive) { setError(message(cause)); setLoading(false); } });
    window.addEventListener('online', resume);
    const warn = (event: BeforeUnloadEvent) => { if (sessionRef.current && !sessionRef.current.state.saved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { alive = false; revoke(); authSubscription?.unsubscribe(); window.removeEventListener('online', resume); window.removeEventListener('beforeunload', warn); abortRef.current.abort(); unsubscribeRef.current?.(); sessionRef.current?.dispose(); storeRef.current?.close(); storeRef.current = null; };
  }, [bind, current, resume]);

  const flush = useCallback(async () => { await sessionRef.current?.flush(); }, []);
  const edit = useCallback((change: (draft: FieldCollection) => void) => {
    if (busyRef.current || !current()) return;
    try { sessionRef.current?.edit(change); } catch (cause) { setError(message(cause)); }
  }, [current]);
  const action = useCallback(async <T,>(operation: (store: DraftStore, session: CollectorSession) => Promise<T>): Promise<T | undefined> => {
    const store = storeRef.current, session = sessionRef.current;
    if (!store || !session || busyRef.current || !current()) return;
    busyRef.current = true; setBusy(true); setError(undefined);
    try { await session.flush(); const result = await operation(store, session); if (current()) await refresh(); return result; }
    catch (cause) {
      if (current()) {
        // Preparation may have committed earlier files; keep its advanced revision.
        if (session.state.saved) { const saved = await store.get(session.state.draft.id); if (saved) session.adopt(saved); }
        setError(message(cause));
      }
    } finally { busyRef.current = false; if (current()) { setBusy(false); setProgress(undefined); } }
  }, [current, refresh]);
  const open = useCallback((id: string) => action(async (store) => { const saved = await store.get(id); if (saved && current()) bind(store, saved); }), [action, bind, current]);
  const create = useCallback(() => action(async store => { const draft = createFieldCollection(store.scope); const saved = await store.create(draft); if (current()) bind(store, saved); }), [action, bind, current]);
  const authorizeSend = useCallback(async () => {
    const authorized = await action(async (store, session) => {
      if (session.state.draft.sync.status !== 'draft') return true;
      setProgress('Conferindo originais antes de congelar a coleta…');
      const prepared = await prepareFieldCollection(store, session.state.draft.id, { backendProjectId: store.scope.projectId, origin: store.scope.origin });
      if (!current()) return;
      session.adopt(prepared); const queued = await store.queue(prepared.id, prepared.revision);
      if (current()) session.adopt(queued);
      return true;
    });
    if (authorized) await resume();
  }, [action, current, resume]);
  const exportBackup = useCallback(() => action((store, session) => exportFieldCollection(store, session.state.draft.id)), [action]);
  const importBackup = useCallback((file: Blob) => action(async store => { const draft = await importFieldCollection(store, file); if (current()) bind(store, draft); }), [action, bind, current]);
  const copy = useCallback(() => action(async (store, session) => { const zip = await exportFieldCollection(store, session.state.draft.id); const draft = await importFieldCollection(store, zip); if (current()) bind(store, draft); }), [action, bind, current]);
  const attach = useCallback((pointId: string, files: File[], kind: 'digital' | 'termica') => {
    if (busyRef.current || !current()) return;
    try { for (const file of files) sessionRef.current?.attach(pointId, file, kind); } catch (cause) { setError(message(cause)); }
  }, [current]);
  const removePhoto = useCallback((id: string) => { if (!busyRef.current && current()) sessionRef.current?.removePhoto(id); }, [current]);
  const retryLocal = useCallback(async () => { try { await sessionRef.current?.retry(); await refresh(); } catch (cause) { setError(message(cause)); } }, [refresh]);
  const reload = useCallback(async () => {
    const store = storeRef.current, session = sessionRef.current; if (!store || !session || !current()) return;
    if (!window.confirm('Reabrir a versão salva? As alterações ainda não salvas nesta tela serão descartadas.')) return;
    const draft = await store.get(session.state.draft.id); if (draft && current()) { bind(store, draft); setError(undefined); }
  }, [bind, current]);
  return { state, drafts, loading, busy, error, ...offline, progress, store, edit, flush, open, create, authorizeSend, resume, exportBackup, importBackup, copy, attach, removePhoto, retryLocal, reload };
}
