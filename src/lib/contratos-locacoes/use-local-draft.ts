'use client';

import { useEffect, useRef, useState } from 'react';
import {
  clearLocalDraft,
  fingerprintLocalDraftBase,
  loadLocalDraft,
  resolveLocalDraftRecovery,
  saveLocalDraft,
  type StoredLocalDraft,
} from './local-draft';

export type LocalDraftStatus = 'idle' | 'saving_local' | 'saved_local' | 'synced' | 'conflict';

type UseLocalDraftOptions<T> = {
  initialValue: T;
  serverValue: T | null;
  storageKey?: string;
};

type UseLocalDraftResult<T> = {
  draft: T;
  setDraft: React.Dispatch<React.SetStateAction<T>>;
  savedAt: string | null;
  status: LocalDraftStatus;
  restoreConflictDraft: () => void;
  discardLocalDraft: () => void;
  markSynced: (nextBaseValue?: T) => void;
};

export function useLocalDraft<T>({
  initialValue,
  serverValue,
  storageKey,
}: UseLocalDraftOptions<T>): UseLocalDraftResult<T> {
  const [draft, setDraft] = useState<T>(initialValue);
  const [status, setStatus] = useState<LocalDraftStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflictDraft, setConflictDraft] = useState<StoredLocalDraft<T> | null>(null);

  const hasHydratedRef = useRef(!storageKey);
  const baseFingerprintRef = useRef<string | null>(
    serverValue ? fingerprintLocalDraftBase(serverValue) : null
  );
  const lastPersistedFingerprintRef = useRef<string>(fingerprintLocalDraftBase(initialValue));

  useEffect(() => {
    if (!storageKey) {
      hasHydratedRef.current = true;
      return;
    }

    const storedDraft = loadLocalDraft<T>(storageKey);
    const recovery = resolveLocalDraftRecovery(storedDraft, serverValue);
    let isActive = true;

    queueMicrotask(() => {
      if (!isActive) {
        return;
      }

      if (recovery.mode === 'restore') {
        setDraft(recovery.draft.data);
        setStatus('saved_local');
        setSavedAt(recovery.draft.savedAt);
        setConflictDraft(null);
        lastPersistedFingerprintRef.current = fingerprintLocalDraftBase(recovery.draft.data);
      } else if (recovery.mode === 'conflict') {
        setStatus('conflict');
        setSavedAt(recovery.draft.savedAt);
        setConflictDraft(recovery.draft);
        lastPersistedFingerprintRef.current = fingerprintLocalDraftBase(initialValue);
      } else {
        setStatus('idle');
        setSavedAt(null);
        setConflictDraft(null);
        lastPersistedFingerprintRef.current = fingerprintLocalDraftBase(initialValue);
      }

      hasHydratedRef.current = true;
    });

    return () => {
      isActive = false;
    };
  }, [initialValue, serverValue, storageKey]);

  useEffect(() => {
    if (!storageKey || !hasHydratedRef.current || conflictDraft) {
      return;
    }

    const nextFingerprint = fingerprintLocalDraftBase(draft);
    if (nextFingerprint === lastPersistedFingerprintRef.current) {
      return;
    }

    setStatus('saving_local');

    const timeout = window.setTimeout(() => {
      const storedDraft = saveLocalDraft(storageKey, {
        data: draft,
        baseFingerprint: baseFingerprintRef.current,
      });

      if (!storedDraft) {
        return;
      }

      lastPersistedFingerprintRef.current = nextFingerprint;
      setSavedAt(storedDraft.savedAt);
      setStatus('saved_local');
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [conflictDraft, draft, storageKey]);

  const restoreConflictDraft = () => {
    if (!conflictDraft) {
      return;
    }

    setDraft(conflictDraft.data);
    setSavedAt(conflictDraft.savedAt);
    setStatus('saved_local');
    setConflictDraft(null);
    lastPersistedFingerprintRef.current = fingerprintLocalDraftBase(conflictDraft.data);
  };

  const discardLocalDraft = () => {
    if (storageKey) {
      clearLocalDraft(storageKey);
    }

    setSavedAt(null);
    setStatus('idle');
    setConflictDraft(null);
    lastPersistedFingerprintRef.current = fingerprintLocalDraftBase(draft);
  };

  const markSynced = (nextBaseValue = draft) => {
    if (storageKey) {
      clearLocalDraft(storageKey);
    }

    baseFingerprintRef.current = fingerprintLocalDraftBase(nextBaseValue);
    lastPersistedFingerprintRef.current = fingerprintLocalDraftBase(nextBaseValue);
    setSavedAt(null);
    setStatus('synced');
    setConflictDraft(null);
  };

  return {
    draft,
    setDraft,
    savedAt,
    status,
    restoreConflictDraft,
    discardLocalDraft,
    markSynced,
  };
}
