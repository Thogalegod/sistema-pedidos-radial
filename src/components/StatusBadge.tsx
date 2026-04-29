import { Order } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isBefore, isSameDay, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, AlertCircle, AlertTriangle, User, Calendar, CheckCircle2 } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold shadow-sm border border-red-200">
        <AlertTriangle className="w-3.5 h-3.5" />
        Vencido: {format(parseISO(order.dueDate!), "dd/MM", { locale: ptBR })}
      </div>
    );
  }

  if (order.status === 'Concluído') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold shadow-sm border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Concluído
      </div>
    );
  }

  // 2. High Priority Today
  if (isToday && order.priority === 'Alta') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold shadow-sm border border-orange-200 animate-pulse">
        <AlertCircle className="w-3.5 h-3.5" />
        Urgente para Hoje
      </div>
    );
  }

  // 3. Aguardando Cliente
  if (order.status === 'Aguardando Cliente') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-semibold shadow-sm border border-yellow-200">
        <Clock className="w-3.5 h-3.5" />
        Aguardando Cliente
      </div>
    );
  }

  // 4. Prazo Concessionária
  if (order.status === 'Prazo Concessionária') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold shadow-sm border border-blue-200">
        <Calendar className="w-3.5 h-3.5" />
        {order.dueDate ? `Concessionária: ${format(parseISO(order.dueDate), "dd/MM", { locale: ptBR })}` : 'Prazo Concessionária'}
      </div>
    );
  }

  // 5. Ação Pendente
  if (order.status === 'Ação Pendente') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold shadow-sm border border-amber-200">
        <User className="w-3.5 h-3.5" />
        {order.assignee ? `Ação: ${order.assignee}` : 'Ação Pendente'}
      </div>
    );
  }

  return null;
}
