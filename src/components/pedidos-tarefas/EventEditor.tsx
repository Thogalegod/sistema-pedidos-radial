'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { deleteEvent, loadEvent, loadEventEditorOptions, saveEvent, type EventEditorOptions,
  type EventKind, type EventV1 } from '@/lib/pedidos-tarefas/events';
import { getCurrentOrganizationId } from '@/lib/pedidos-tarefas/organization';
import { formatMemberLabel, listMembers } from '@/lib/pedidos-tarefas/members';
import type { Member } from '@/lib/pedidos-tarefas/types';
import { CALENDAR_CHANGED_EVENT } from './CalendarView';

const emptyEvent: EventV1 = { id: '', kind: 'meeting', title: '', date: '', time: '',
  assigneeId: '', note: null, customerId: null, orderId: null, frontId: null, taskId: null };

const typeOptions: Array<{ value: EventKind; label: string }> = [
  { value: 'meeting', label: 'Reunião' },
  { value: 'visit', label: 'Visita' },
  { value: 'external_service', label: 'Serviço externo' },
  { value: 'other', label: 'Outro' },
];
const emptyOptions: EventEditorOptions = { orders: [], fronts: [], tasks: [], customers: [] };

export function EventEditor({ eventId, onClose, onSaved }: {
  eventId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventV1>(emptyEvent);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<EventEditorOptions>(emptyOptions);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    let active = true;
    getCurrentOrganizationId(supabase).then(async org => {
      const [event, nextOptions, nextMembers] = await Promise.all([
        eventId ? loadEvent(supabase, org, eventId) : Promise.resolve(emptyEvent),
        loadEventEditorOptions(supabase, org),
        listMembers(supabase, org),
      ]);
      if (!active) return;
      setOrganizationId(org);
      setOptions(nextOptions);
      setMembers(nextMembers);
      if (eventId && !event) setError('Evento não encontrado ou sem acesso.');
      else setDraft(event ?? emptyEvent);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o evento.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  const update = <K extends keyof EventV1>(field: K, value: EventV1[K]) =>
    setDraft(current => ({ ...current, [field]: value }));

  const selectOrder = (orderId: string | null) => setDraft(current => ({
    ...current,
    orderId,
    frontId: current.frontId && options.fronts.some(front => front.id === current.frontId && front.orderId === orderId)
      ? current.frontId : null,
    taskId: current.taskId && options.tasks.some(task => task.id === current.taskId && task.orderId === orderId)
      ? current.taskId : null,
  }));

  const selectTask = (taskId: string | null) => {
    const task = options.tasks.find(option => option.id === taskId);
    setDraft(current => ({ ...current, taskId,
      orderId: task ? task.orderId : current.orderId,
      frontId: task ? task.frontId : current.frontId }));
  };

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!organizationId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveEvent(supabase, organizationId, draft);
      if (!result.ok) { setError(result.message); return; }
      globalThis.dispatchEvent?.(new Event(CALENDAR_CHANGED_EVENT));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!organizationId || !draft.id || saving || !window.confirm('Excluir este evento?')) return;
    setSaving(true);
    setError(null);
    try {
      const result = await deleteEvent(supabase, organizationId, draft.id);
      if (!result.ok) { setError(result.message); return; }
      globalThis.dispatchEvent?.(new Event(CALENDAR_CHANGED_EVENT));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return <div role="dialog" aria-modal="true" aria-label={eventId ? 'Editar evento' : 'Novo evento'}
    className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4">
    <div className="max-h-dvh w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-950">{eventId ? 'Editar evento' : 'Novo evento'}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar editor de evento"
          className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={19} /></button>
      </header>
      {loading && <p role="status" className="p-6 text-sm text-slate-500">Carregando evento…</p>}
      {!loading && error && eventId && !draft.id
        ? <p role="alert" className="m-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
        : !loading && <form onSubmit={submit} className="space-y-4 p-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Tipo
              <select value={draft.kind} onChange={event => update('kind', event.target.value as EventKind)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3">
                {typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Responsável
              <select required value={draft.assigneeId} onChange={event => update('assigneeId', event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3">
                <option value="">Selecione</option>
                {members.map(member => <option key={member.userId} value={member.userId}>{formatMemberLabel(member)}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Título
            <input required value={draft.title} onChange={event => update('title', event.target.value)}
              className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Data
              <input required type="date" value={draft.date} onChange={event => update('date', event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3" />
            </label>
            <label className="text-sm font-medium text-slate-700">Horário
              <input required type="time" value={draft.time} onChange={event => update('time', event.target.value)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3" />
            </label>
          </div>
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-semibold text-slate-700">Associações opcionais</legend>
            <label className="text-sm font-medium text-slate-700">Pedido
              <select value={draft.orderId ?? ''} onChange={event => selectOrder(event.target.value || null)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3">
                <option value="">Sem Pedido</option>
                {options.orders.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Frente
              <select value={draft.frontId ?? ''} onChange={event => update('frontId', event.target.value || null)}
                disabled={!draft.orderId} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 disabled:bg-slate-100">
                <option value="">Sem Frente</option>
                {options.fronts.filter(front => front.orderId === draft.orderId)
                  .map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Tarefa
              <select value={draft.taskId ?? ''} onChange={event => selectTask(event.target.value || null)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3">
                <option value="">Sem Tarefa</option>
                {options.tasks.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Cliente
              <select value={draft.customerId ?? ''} onChange={event => update('customerId', event.target.value || null)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3">
                <option value="">Sem cliente</option>
                {options.customers.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </fieldset>
          <label className="block text-sm font-medium text-slate-700">Observação
            <textarea value={draft.note ?? ''} onChange={event => update('note', event.target.value || null)} rows={3}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
            {draft.id ? <button type="button" onClick={() => void remove()} disabled={saving}
              className="min-h-10 rounded-lg px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Excluir evento</button> : <span />}
            <div className="flex gap-2 sm:justify-end">
              <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={saving || !organizationId}
                className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Salvar evento</button>
            </div>
          </div>
        </form>}
    </div>
  </div>;
}
