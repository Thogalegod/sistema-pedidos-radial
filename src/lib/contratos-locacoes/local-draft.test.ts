import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearLocalDraft,
  createLocalDraftKey,
  loadLocalDraft,
  resolveLocalDraftRecovery,
  saveLocalDraft,
  type StoredLocalDraft,
} from './local-draft';

describe('local draft', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads a local draft payload', () => {
    const key = createLocalDraftKey('clientes/novo');

    saveLocalDraft(key, {
      data: { legal_name: 'Radial Energia' },
      baseFingerprint: null,
    });

    expect(loadLocalDraft<{ legal_name: string }>(key)).toMatchObject({
      data: { legal_name: 'Radial Energia' },
      baseFingerprint: null,
    });
  });

  it('restores a create-flow draft without remote comparison', () => {
    const storedDraft: StoredLocalDraft<{ legal_name: string }> = {
      version: 1,
      savedAt: '2026-07-06T12:00:00.000Z',
      baseFingerprint: null,
      data: { legal_name: 'Rascunho local' },
    };

    expect(resolveLocalDraftRecovery(storedDraft, null)).toEqual({
      mode: 'restore',
      draft: storedDraft,
    });
  });

  it('restores an edit draft when the server base still matches', () => {
    const serverValue = { legal_name: 'Cliente atual', trade_name: 'Atual' };
    const key = createLocalDraftKey('clientes/customer-1');

    saveLocalDraft(key, {
      data: { legal_name: 'Cliente em edição', trade_name: 'Atual' },
      baseFingerprint: serverValue,
    });

    const storedDraft = loadLocalDraft<typeof serverValue>(key);

    expect(resolveLocalDraftRecovery(storedDraft, serverValue)).toMatchObject({
      mode: 'restore',
    });
  });

  it('marks a conflict when the server changed after the local draft', () => {
    const storedDraft: StoredLocalDraft<{ legal_name: string }> = {
      version: 1,
      savedAt: '2026-07-06T12:00:00.000Z',
      baseFingerprint: '{"legal_name":"Servidor antigo"}',
      data: { legal_name: 'Alteração local' },
    };

    expect(resolveLocalDraftRecovery(storedDraft, { legal_name: 'Servidor novo' })).toEqual({
      mode: 'conflict',
      draft: storedDraft,
    });
  });

  it('clears a stored draft explicitly', () => {
    const key = createLocalDraftKey('contratos/novo');

    saveLocalDraft(key, {
      data: { start_date: '2026-07-06' },
      baseFingerprint: null,
    });
    clearLocalDraft(key);

    expect(loadLocalDraft(key)).toBeNull();
  });
});
