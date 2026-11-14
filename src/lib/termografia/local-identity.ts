import type { OfflineScope } from './field-collection';

const KEY = 'radial:termografia:local-identity:v1';
export const LOCAL_IDENTITY_EVENT = 'radial-termografia-identity';
export interface PreparedLocalIdentity { version: 1; scope: OfflineScope; preparedAt: string; generation: string }

function rawIdentity(): PreparedLocalIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value?.version !== 1 || !value.scope || !['projectId', 'origin', 'userId', 'organizationId'].every(key => typeof value.scope[key] === 'string' && value.scope[key].length > 0)
      || typeof value.generation !== 'string' || typeof value.preparedAt !== 'string') return null;
    return value as PreparedLocalIdentity;
  } catch { return null; }
}

/** Local access only. Call after online getUser + membership validation, never as server authentication. */
export function saveLocalIdentity(scope: OfflineScope): PreparedLocalIdentity {
  const identity: PreparedLocalIdentity = { version: 1, scope: { projectId: scope.projectId, origin: scope.origin, userId: scope.userId, organizationId: scope.organizationId }, preparedAt: new Date().toISOString(), generation: crypto.randomUUID() };
  localStorage.setItem(KEY, JSON.stringify(identity));
  window.dispatchEvent(new Event(LOCAL_IDENTITY_EVENT));
  return identity;
}
export function readLocalIdentity(projectId: string, origin: string): PreparedLocalIdentity | null {
  const identity = rawIdentity();
  return identity?.scope.projectId === projectId && identity.scope.origin === origin ? identity : null;
}
export function clearLocalIdentity() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* Unavailable storage cannot grant local access. Remote sign-out must still proceed. */ }
  finally { window.dispatchEvent(new Event(LOCAL_IDENTITY_EVENT)); }
}
export function subscribeLocalIdentity(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCAL_IDENTITY_EVENT, listener);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(LOCAL_IDENTITY_EVENT, listener); };
}
export function backendProjectId(url: string): string {
  const host = new URL(url).hostname;
  return host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : host;
}

interface AuthObserverClient {
  auth: { onAuthStateChange(callback: (event: string, session: { user: { id: string } } | null) => void): { data: { subscription: { unsubscribe(): void } } } };
}
/** Observe even while the collector is unmounted, including the login page. No awaited auth call inside this listener. */
export function observeLocalAuthIdentity(client: AuthObserverClient): () => void {
  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    const identity = rawIdentity();
    if (identity && (event === 'SIGNED_OUT' || (session?.user.id && session.user.id !== identity.scope.userId))) clearLocalIdentity();
  });
  return () => subscription.unsubscribe();
}
