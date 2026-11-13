import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalIdentity, readLocalIdentity, saveLocalIdentity, observeLocalAuthIdentity } from './local-identity';

const scope = { projectId: 'iurq', origin: 'https://radial.test', userId: 'user-a', organizationId: 'org-a' };
describe('prepared local identity', () => {
  beforeEach(() => localStorage.clear());
  it('opens only the prepared backend/origin and stores no session credential', () => {
    saveLocalIdentity(scope);
    expect(readLocalIdentity('iurq', scope.origin)?.scope).toEqual(scope);
    expect(readLocalIdentity('other', scope.origin)).toBeNull();
    expect(readLocalIdentity('iurq', 'https://other.test')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('access_token');
  });
  it('retains offline access on an empty initial session, but revokes logout and account changes', () => {
    let listener: (event: string, session: { user: { id: string } } | null) => void = () => {};
    const client = { auth: { onAuthStateChange: (fn: typeof listener) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; } } };
    const stop = observeLocalAuthIdentity(client);
    saveLocalIdentity(scope);
    listener('INITIAL_SESSION', null);
    expect(readLocalIdentity('iurq', scope.origin)).not.toBeNull();
    listener('SIGNED_IN', { user: { id: 'user-b' } });
    expect(readLocalIdentity('iurq', scope.origin)).toBeNull();
    saveLocalIdentity(scope);
    listener('SIGNED_OUT', null);
    expect(readLocalIdentity('iurq', scope.origin)).toBeNull();
    stop();
  });
  it('revokes binding without erasing saved draft storage', () => {
    localStorage.setItem('unrelated', 'retained');
    saveLocalIdentity(scope); clearLocalIdentity();
    expect(localStorage.getItem('unrelated')).toBe('retained');
    expect(readLocalIdentity('iurq', scope.origin)).toBeNull();
  });
});
