'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

const invalidLink = 'Link inválido ou expirado. Volte ao login e solicite um novo link em “Esqueci minha senha”.';

export default function ResetPassword() {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const failedLink = hash.has('error') || hash.has('error_code') || query.has('error') || query.has('error_code');
    // The SDK consumes the recovery tokens; never persist or log the URL ourselves.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || failedLink) return;
      if (event === 'PASSWORD_RECOVERY' && session) setState('ready');
      if (event === 'SIGNED_OUT') setState(current => current === 'done' ? current : 'invalid');
    });
    const validate = async () => {
      try {
        // getSession waits for the SDK's URL/session initialization to finish.
        const { data, error } = await supabase.auth.getSession();
        if (active) setState(!failedLink && !error && data.session ? 'ready' : 'invalid');
      } catch {
        if (active) setState('invalid');
      }
    };
    void validate();
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state !== 'ready' || saving) return;
    setError(null);
    if (password.length < 8) { setError('Use uma senha com pelo menos 8 caracteres.'); return; }
    if (password !== confirmation) { setError('As senhas não coincidem.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (['session_not_found', 'session_expired', 'refresh_token_not_found', 'bad_jwt'].includes(error.code ?? '')) {
          setState('invalid');
        } else {
          setError(error.code === 'weak_password'
            ? 'Escolha uma senha mais forte, com letras, números e símbolos.'
            : error.code === 'same_password'
              ? 'Escolha uma senha diferente da anterior.'
              : 'Não foi possível salvar a senha. Tente novamente ou solicite um novo link.');
        }
        return;
      }
      setPassword('');
      setConfirmation('');
      setState('done');
    } catch {
      setError('Não foi possível conectar. Verifique sua conexão e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      <section className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 text-white">
        <h1 className="text-2xl font-bold mb-2">Definir nova senha</h1>
        <p className="text-sm text-gray-400 mb-6">Radial — Controle de Pedidos</p>
        {state === 'loading' && <p role="status">Validando seu acesso…</p>}
        {state === 'invalid' && <p role="alert" className="text-sm text-red-300">{invalidLink}</p>}
        {state === 'done' && <p role="status" className="text-sm text-green-300">Senha atualizada. Você já pode entrar com a nova senha.</p>}
        {state === 'ready' && <form onSubmit={save} className="space-y-4">
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div>
            <label htmlFor="new-password" className="block text-sm mb-2">Nova senha</label>
            <input id="new-password" type="password" autoComplete="new-password" required minLength={8}
              value={password} onChange={e => setPassword(e.target.value)} disabled={saving}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-2">Use pelo menos 8 caracteres.</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm mb-2">Confirmar nova senha</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8}
              value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={saving}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button disabled={saving} className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 p-3 font-semibold disabled:opacity-50">
            {saving ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>}
        {state !== 'loading' && <Link href="/login" className="inline-block mt-6 text-sm text-blue-300 hover:underline">Voltar ao login</Link>}
      </section>
    </main>
  );
}
