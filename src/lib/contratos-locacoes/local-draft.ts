export type StoredLocalDraft<T> = {
  version: 1;
  savedAt: string;
  baseFingerprint: string | null;
  data: T;
};

type SaveLocalDraftInput<T> = {
  data: T;
  baseFingerprint: unknown | string | null;
};

type LocalDraftRecovery<T> =
  | { mode: 'none' }
  | { mode: 'restore'; draft: StoredLocalDraft<T> }
  | { mode: 'conflict'; draft: StoredLocalDraft<T> };

const LOCAL_DRAFT_PREFIX = 'radial:contratos-locacoes:draft:';

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`)
    .join(',')}}`;
}

function normalizeBaseFingerprint(value: unknown | string | null): string | null {
  if (value === null) {
    return null;
  }

  return typeof value === 'string' ? value : fingerprintLocalDraftBase(value);
}

export function createLocalDraftKey(scope: string): string {
  return `${LOCAL_DRAFT_PREFIX}${scope}`;
}

export function fingerprintLocalDraftBase(value: unknown): string {
  return stableSerialize(value);
}

export function saveLocalDraft<T>(key: string, input: SaveLocalDraftInput<T>): StoredLocalDraft<T> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const payload: StoredLocalDraft<T> = {
    version: 1,
    savedAt: new Date().toISOString(),
    baseFingerprint: normalizeBaseFingerprint(input.baseFingerprint),
    data: input.data,
  };

  window.localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}

export function loadLocalDraft<T>(key: string): StoredLocalDraft<T> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLocalDraft<T>>;
    if (
      parsed.version !== 1 ||
      typeof parsed.savedAt !== 'string' ||
      !('data' in parsed) ||
      (parsed.baseFingerprint !== null && typeof parsed.baseFingerprint !== 'string')
    ) {
      return null;
    }

    return parsed as StoredLocalDraft<T>;
  } catch {
    return null;
  }
}

export function clearLocalDraft(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(key);
}

export function resolveLocalDraftRecovery<T>(
  storedDraft: StoredLocalDraft<T> | null,
  remoteValue: T | null
): LocalDraftRecovery<T> {
  if (!storedDraft) {
    return { mode: 'none' };
  }

  if (remoteValue === null) {
    return { mode: 'restore', draft: storedDraft };
  }

  if (
    storedDraft.baseFingerprint !== null &&
    storedDraft.baseFingerprint === fingerprintLocalDraftBase(remoteValue)
  ) {
    return { mode: 'restore', draft: storedDraft };
  }

  return { mode: 'conflict', draft: storedDraft };
}
