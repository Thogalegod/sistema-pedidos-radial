'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCalendar } from '@/lib/pedidos-tarefas/calendar-queries';
import type { CalendarEntry, CalendarScope } from '@/lib/pedidos-tarefas/calendar';
import type { DateKey } from '@/lib/pedidos-tarefas/types';

export const CALENDAR_CHANGED_EVENT = 'radial:calendar-changed';

const kindLabels: Record<CalendarEntry['kind'], string> = {
  task_due: 'Prazo de tarefa',
  subtask_due: 'Prazo de subtarefa',
  follow_up: 'Follow-up',
  meeting: 'Reunião',
  visit: 'Visita',
  external_service: 'Serviço externo',
  other: 'Outro evento',
};

function monthWindow(anchor: DateKey): Pick<CalendarScope, 'from' | 'to'> {
  const [year, month] = anchor.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
}

function shiftMonth(anchor: DateKey, amount: number): DateKey {
  const [year, month] = anchor.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(anchor: DateKey) {
  const [year, month] = anchor.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function dayLabel(date: DateKey) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function CalendarView({ scope, onOpenEntry, client: argumentsClient,
  organizationId: argumentsOrganizationId }: {
  scope: CalendarScope;
  onOpenEntry: (entry: CalendarEntry) => void;
  client?: SupabaseClient;
  organizationId?: string;
}) {
  const [anchor, setAnchor] = useState<DateKey>(scope.from);
  const [result, setResult] = useState<{
    key: string; entries: CalendarEntry[] | null; error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const monthRange = useMemo(() => monthWindow(anchor), [anchor]);
  const requestKey = `${scope.orderId ?? 'global'}:${monthRange.from}:${monthRange.to}:${reloadToken}`;

  useEffect(() => {
    const refresh = () => setReloadToken(value => value + 1);
    globalThis.addEventListener?.(CALENDAR_CHANGED_EVENT, refresh);
    return () => globalThis.removeEventListener?.(CALENDAR_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      import('@/lib/supabase'),
      import('@/lib/pedidos-tarefas/organization'),
    ]).then(async ([clientModule, organizationModule]) => {
      const resolvedClient = argumentsClient ?? clientModule.supabase;
      const org = argumentsOrganizationId
        ?? await organizationModule.getCurrentOrganizationId(resolvedClient);
      return loadCalendar(resolvedClient, org,
        { ...(scope.orderId ? { orderId: scope.orderId } : {}), ...monthRange });
    })
      .then(next => { if (active) setResult({ key: requestKey, entries: next, error: null }); })
      .catch((reason: unknown) => {
        if (active) setResult({ key: requestKey, entries: null,
          error: reason instanceof Error ? reason.message : 'Não foi possível carregar o calendário.' });
      });
    return () => { active = false; };
  }, [scope.orderId, monthRange, reloadToken, argumentsClient, argumentsOrganizationId, requestKey]);

  const loading = result?.key !== requestKey;
  const entries = loading ? null : result?.entries ?? null;
  const error = loading ? null : result?.error ?? null;

  const groups = useMemo(() => {
    const result = new Map<DateKey, CalendarEntry[]>();
    entries?.forEach(entry => result.set(entry.date, [...(result.get(entry.date) ?? []), entry]));
    return [...result.entries()];
  }, [entries]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  return <section aria-label={scope.orderId ? 'Calendário do Pedido' : 'Calendário global'}
    className="rounded-xl border border-slate-200 bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="flex items-center gap-2">
        <CalendarDays size={18} className="text-blue-600" aria-hidden="true" />
        <h2 className="font-semibold capitalize text-slate-900">{monthLabel(anchor)}</h2>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setAnchor(value => shiftMonth(value, -1))}
          aria-label="Mês anterior" className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setAnchor(todayKey)}
          className="min-h-9 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">Hoje</button>
        <button type="button" onClick={() => setAnchor(value => shiftMonth(value, 1))}
          aria-label="Próximo mês" className="flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
    <div className="p-4">
      {!entries && !error && <p role="status" className="py-8 text-center text-sm text-slate-500">Carregando calendário…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {entries?.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum item neste mês.</p>}
      {groups.length > 0 && <ol className="space-y-4">
        {groups.map(([date, dayEntries]) => <li key={date}>
          <h3 className="mb-2 text-xs font-semibold capitalize text-slate-500">{dayLabel(date)}</h3>
          <ul className="space-y-2">
            {dayEntries.map(entry => <li key={entry.key}>
              <button type="button" onClick={() => onOpenEntry(entry)}
                aria-label={`${entry.title} · ${kindLabels[entry.kind]}`}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-500">{entry.time ?? 'Dia'}</span>
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${entry.completed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{entry.title}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{kindLabels[entry.kind]}</span>
              </button>
            </li>)}
          </ul>
        </li>)}
      </ol>}
    </div>
  </section>;
}
