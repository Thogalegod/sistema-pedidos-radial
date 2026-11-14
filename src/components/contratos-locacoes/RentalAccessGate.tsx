'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useShellUser } from '@/components/app-shell/AppShell';
import { supabase } from '@/lib/supabase';

// UX guard only. Database RLS and RPC authorization enforce the actual boundary.
export function RentalAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useShellUser();
  const userId = user?.id;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ userId: string; attempt: number; state: 'allowed' | 'denied' | 'error' } | null>(null);

  useEffect(() => {
    if (loading || !userId) return;
    let current = true;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('current_rental_organization');
        if (current) setResult({ userId, attempt, state: error ? 'error' : typeof data === 'string' && data ? 'allowed' : 'denied' });
      } catch {
        if (current) setResult({ userId, attempt, state: 'error' });
      }
    })();
    return () => { current = false; };
  }, [userId, loading, attempt]);

  const state = result?.userId === userId && result?.attempt === attempt ? result.state : null;
  if (loading || (userId && !state)) return <p role="status" className="py-8 text-slate-600">Verificando acesso…</p>;
  if (userId && state === 'allowed') return children;
  return <section className="rounded-xl border border-slate-200 bg-white p-6" aria-live="polite">
    <h2 className="text-lg font-semibold">{state === 'error' ? 'Não foi possível verificar seu acesso' : 'Acesso restrito'}</h2>
    <p className="mt-2 text-sm text-slate-600">{state === 'error'
      ? 'Confira sua conexão e tente novamente.'
      : 'O financeiro está disponível somente para o responsável autorizado nesta etapa.'}</p>
    {state === 'error' ? <button type="button" className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-white" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button> : null}
    <Link className="ml-3 mt-4 inline-block text-blue-700 underline" href="/hub">Voltar ao início</Link>
  </section>;
}
