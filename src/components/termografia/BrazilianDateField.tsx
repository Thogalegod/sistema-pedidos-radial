'use client';

import { useId, useRef, useState } from 'react';
import { buttonClass, fieldClass } from './collectorStyles';

const display = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : '';
function parse(text: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return '';
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? `${year}-${month}-${day}` : '';
}
function dateParts(value: string): { year: number; month: number } {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Explicit Brazilian display/calendar; stored dates keep their ISO representation. */
export function BrazilianDateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [text, setText] = useState(display(value));
  const [month, setMonth] = useState(() => dateParts(value));
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const title = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month, 1));
  const offset = new Date(month.year, month.month, 1).getDay();
  const days = new Date(month.year, month.month + 1, 0).getDate();
  const change = (next: string) => {
    setText(next);
    const iso = parse(next);
    input.current?.setCustomValidity(next && !iso ? 'Informe uma data válida no formato dia/mês/ano.' : '');
    onChange(iso);
  };
  const shift = (delta: number) => {
    const date = new Date(month.year, month.month + delta, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
  };
  return <div className="min-w-0 space-y-1" lang="pt-BR">
    <label className="text-sm" htmlFor={id}>Data da inspeção *</label>
    <div className="flex gap-2">
      <input ref={input} id={id} required className={fieldClass} type="text" inputMode="numeric" autoComplete="off" placeholder="dd/mm/aaaa" maxLength={10} value={text}
        onChange={event => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
          change(digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
        }} />
      <button type="button" className={`${buttonClass} shrink-0`} aria-label="Abrir calendário" onClick={() => { setMonth(dateParts(value)); dialog.current?.showModal(); }}>Calendário</button>
    </div>
    <dialog ref={dialog} aria-label="Escolher data da inspeção" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
      <div className="mb-3 flex items-center justify-between gap-2"><button type="button" className={buttonClass} aria-label="Mês anterior" onClick={() => shift(-1)}>‹</button><h2 aria-live="polite" className="font-semibold capitalize">{title}</h2><button type="button" className={buttonClass} aria-label="Próximo mês" onClick={() => shift(1)}>›</button></div>
      <div className="grid grid-cols-7 text-center text-xs text-slate-500">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <span key={day} className="py-2">{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const iso = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return <button type="button" key={day} aria-label={display(iso)} aria-pressed={value === iso} className={`min-h-11 rounded-lg text-sm ${value === iso ? 'bg-blue-700 font-bold text-white' : 'hover:bg-blue-50'}`} onClick={() => { change(display(iso)); dialog.current?.close(); }}>{day}</button>;
        })}
      </div>
      <button type="button" className={`${buttonClass} mt-3 w-full`} onClick={() => dialog.current?.close()}>Fechar calendário</button>
    </dialog>
  </div>;
}
