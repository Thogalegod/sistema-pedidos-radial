'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useDebouncedValue } from '@/lib/contratos-locacoes/use-debounced-value';
import {
  createSupabaseCentralSearchReadClient,
  searchCentral,
  type CentralSearchResults,
} from '@/lib/central/search';

const EMPTY_RESULTS: CentralSearchResults = { tasks: [], orders: [], customers: [], contracts: [], billings: [] };
const GROUPS = [
  { key: 'tasks', label: 'Tarefas' },
  { key: 'orders', label: 'Pedidos' },
  { key: 'customers', label: 'Clientes' },
  { key: 'contracts', label: 'Contratos' },
  { key: 'billings', label: 'Cobranças' },
] as const;

export function GlobalSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  return <dialog
    ref={dialogRef}
    aria-label="Busca global"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-0 m-auto max-h-[min(680px,calc(100dvh-2rem))] w-[min(680px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/35"
  >
    {open && <div className="flex max-h-[min(680px,calc(100dvh-2rem))] flex-col">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Buscar em todo o Radial</h2>
          <p className="mt-0.5 text-xs text-slate-500">Tarefas, pedidos, clientes, contratos e cobranças</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar busca"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <SearchExperience inputRef={inputRef} onNavigate={onClose} />
    </div>}
  </dialog>;
}

function SearchExperience({ inputRef, onNavigate }: { inputRef: RefObject<HTMLInputElement | null>; onNavigate: () => void }) {
  const [query, setQuery] = useState('');
  const [resultState, setResultState] = useState<{
    query: string;
    results: CentralSearchResults;
    error: string | null;
  } | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const client = useMemo(() => createSupabaseCentralSearchReadClient(supabase), []);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) return;
    let active = true;
    searchCentral(client, debouncedQuery)
      .then((results) => {
        if (active) setResultState({ query: debouncedQuery.trim(), results, error: null });
      })
      .catch((searchError: unknown) => {
        if (active) setResultState({
          query: debouncedQuery.trim(),
          results: EMPTY_RESULTS,
          error: searchError instanceof Error ? searchError.message : 'Não foi possível realizar a busca.',
        });
      });
    return () => { active = false; };
  }, [client, debouncedQuery]);

  const active = query.trim().length >= 2;
  const visibleState = resultState?.query === query.trim() ? resultState : null;
  const searching = active && !visibleState;
  const results = visibleState?.results ?? EMPTY_RESULTS;
  const error = visibleState?.error ?? null;
  const total = GROUPS.reduce((sum, group) => sum + results[group.key].length, 0);

  return <section aria-label="Resultados da busca global" className="min-h-0 overflow-y-auto p-4 sm:p-5">
    <div className="relative sticky top-0 z-10 bg-white">
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={inputRef} type="search" aria-label="Busca global" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar tarefa, pedido, cliente, contrato, cobrança..."
        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
      {query && <button type="button" aria-label="Limpar busca" onClick={() => { setQuery(''); setResultState(null); }}
        className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">
        <X size={16} aria-hidden="true" />
      </button>}
    </div>

    {query.trim().length === 1 && <p className="mt-3 px-1 text-xs text-slate-500">Digite pelo menos dois caracteres.</p>}
    {active && <div className="mt-4 border-t border-slate-100 pt-4">
      {searching && <p role="status" className="text-sm text-slate-500">Buscando…</p>}
      {!searching && error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!searching && !error && total === 0 && <p className="text-sm text-slate-500">Nenhum resultado encontrado.</p>}
      {!searching && !error && total > 0 && <div className="grid gap-5 md:grid-cols-2">
        {GROUPS.map((group) => results[group.key].length > 0 && <div key={group.key}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</h2>
          <div className="space-y-1">
            {results[group.key].map((item) => <Link key={item.id} href={item.href} onClick={onNavigate}
              className="block rounded-lg px-3 py-2.5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600">
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</p>
            </Link>)}
          </div>
        </div>)}
      </div>}
    </div>}
  </section>;
}
