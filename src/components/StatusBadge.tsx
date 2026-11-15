import { Order } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isBefore, isSameDay, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, AlertCircle, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Color map por membro da equipe
export const memberColor = (name?: string) => {
  switch (name) {
    case 'Thomás':
      return {
        badge: 'bg-blue-100 text-blue-700 border border-blue-200',
        avatar: 'bg-blue-600',
        dot: 'bg-blue-500'
      };
    case 'Roberto':
      return {
        badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
        avatar: 'bg-emerald-600',
        dot: 'bg-emerald-500'
      };
    case 'Katlyn':
      return {
        badge: 'bg-violet-100 text-violet-700 border border-violet-200',
        avatar: 'bg-violet-600',
        dot: 'bg-violet-500'
      };
    case 'Equipe de Campo':
      return {
        badge: 'bg-amber-100 text-amber-700 border border-amber-200',
        avatar: 'bg-amber-600',
        dot: 'bg-amber-500'
      };
    default:
      return {
        badge: 'bg-gray-100 text-gray-600 border border-gray-200',
        avatar: 'bg-gray-500',
        dot: 'bg-gray-400'
      };
  }
};

interface StatusBadgeProps {
  order: Order;
  today?: Date;
}

export function StatusBadge({ order, today = new Date('2026-04-29') }: StatusBadgeProps) {
  const active = order.status === 'Em andamento';
  const dueDate = order.dueDate ? parseISO(order.dueDate) : null;
  const isOverdue = active && dueDate && isBefore(dueDate, today) && !isSameDay(dueDate, today);
  const Icon = order.status === 'Finalizado' ? CheckCircle2 : order.status === 'Cancelado' ? XCircle : Clock;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        order.status === 'Finalizado' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
        active ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-200 bg-gray-50 text-gray-700')}>
        <Icon className="w-3.5 h-3.5" />{order.status}
      </span>
      {isOverdue && dueDate && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
          <AlertTriangle className="w-3.5 h-3.5" />Vencido: {format(dueDate, 'dd/MM', { locale: ptBR })}
        </span>
      )}
      {active && dueDate && isSameDay(dueDate, today) && order.priority === 'Alta' && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">
          <AlertCircle className="w-3.5 h-3.5" />Urgente para Hoje
        </span>
      )}
    </div>
  );
}
