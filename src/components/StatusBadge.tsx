import { Order } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isBefore, isSameDay, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, AlertCircle, AlertTriangle, User, Calendar, CheckCircle2 } from 'lucide-react';

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
  let isOverdue = false;
  let isToday = false;

  if (order.dueDate) {
    const dueDate = parseISO(order.dueDate);
    isOverdue = isBefore(dueDate, today) && !isSameDay(dueDate, today);
    isToday = isSameDay(dueDate, today);
  }

  // 1. Overdue
  if (isOverdue && order.status !== 'Concluído') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
        <AlertTriangle className="w-3.5 h-3.5" />
        Vencido: {format(parseISO(order.dueDate!), "dd/MM", { locale: ptBR })}
      </div>
    );
  }

  if (order.status === 'Concluído') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Concluído
      </div>
    );
  }

  // 2. High Priority Today
  if (isToday && order.priority === 'Alta') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">
        <AlertCircle className="w-3.5 h-3.5" />
        Urgente para Hoje
      </div>
    );
  }

  // 3. Aguardando Cliente
  if (order.status === 'Aguardando Cliente') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
        <Clock className="w-3.5 h-3.5" />
        Aguardando Cliente
      </div>
    );
  }

  // 4. Prazo Concessionária
  if (order.status === 'Prazo Concessionária') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
        <Calendar className="w-3.5 h-3.5" />
        {order.dueDate ? `Concessionária: ${format(parseISO(order.dueDate), "dd/MM", { locale: ptBR })}` : 'Prazo Concessionária'}
      </div>
    );
  }

  // 5. Ação Pendente
  if (order.status === 'Ação Pendente') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
        <User className="w-3.5 h-3.5" />
        {order.assignee ? `Ação: ${order.assignee}` : 'Ação Pendente'}
      </div>
    );
  }

  return null;
}
