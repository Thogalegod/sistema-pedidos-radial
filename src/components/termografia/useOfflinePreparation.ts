'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOfflineReadiness, prepareOfflineShell, type OfflineReadiness } from '@/lib/termografia/offline-shell';

/** Public app files only: preparation never locks editing or authorizes sending a draft. */
export function useOfflinePreparation(enabled: boolean) {
  const [readiness, setReadiness] = useState<OfflineReadiness>({ ready: false });
  const [online, setOnline] = useState(true);
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<{ done: number; total: number }>();
  const [offlineError, setOfflineError] = useState<string>();
  const retry = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let job: Promise<void> | undefined;
    const prepare = (): Promise<void> => {
      if (!alive) return Promise.resolve();
      if (job) return job;
      setOnline(navigator.onLine);
      setPreparingOffline(navigator.onLine);
      setOfflineError(undefined); setOfflineProgress(undefined);
      job = (async () => {
        const cached = await getOfflineReadiness().catch(() => ({ ready: false }));
        if (!alive) return;
        setReadiness(cached);
        if (!navigator.onLine) return;
        const result = await prepareOfflineShell((done, total) => { if (alive) setOfflineProgress({ done, total }); }, { requestPersistence: false });
        if (!result.ready) throw new Error(result.error ?? 'Não foi possível preparar o uso sem internet.');
        if (alive) setReadiness(result);
      })().catch(async cause => {
        // A failed update can leave a previously prepared build intact.
        const cached = await getOfflineReadiness().catch(() => ({ ready: false }));
        if (alive) {
          setReadiness(cached);
          setOfflineError(cause instanceof Error ? cause.message : 'Confira a conexão e tente novamente.');
        }
      }).finally(() => {
        job = undefined;
        if (alive) setPreparingOffline(false);
      });
      return job;
    };
    retry.current = prepare;
    const connected = () => { void prepare(); };
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    void prepare();
    return () => {
      alive = false;
      retry.current = async () => {};
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, [enabled]);

  const prepareOffline = useCallback(() => retry.current(), []);
  return { readiness, online, preparingOffline, offlineProgress, offlineError, prepareOffline };
}
