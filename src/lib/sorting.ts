import { Order } from '../types';
import { isBefore, isSameDay, parseISO } from 'date-fns';

export function getOrderSortScore(order: Order, today: Date = new Date('2026-04-29')): number {
  if (order.status === 'Concluído') return 5; // Completed tasks at the very bottom

  if (order.dueDate) {
    const dueDate = parseISO(order.dueDate);
    
    // 1st: Tarefas Vencidas
    if (isBefore(dueDate, today) && !isSameDay(dueDate, today)) {
      return 1;
    }
    
    // 2nd: Prioridade 'Alta' para hoje
    if (isSameDay(dueDate, today) && order.priority === 'Alta') {
      return 2;
    }
  }

  // 4th: Aguardando terceiros
  if (order.status === 'Aguardando Cliente' || order.status === 'Prazo Concessionária') {
    return 4;
  }

  // 3rd: Normais em andamento (inclui Ação Pendente)
  return 3;
}

export function sortOrders(orders: Order[], today: Date = new Date('2026-04-29')): Order[] {
  return [...orders].sort((a, b) => {
    const scoreA = getOrderSortScore(a, today);
    const scoreB = getOrderSortScore(b, today);

    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }

    // Tie-breaker: sort by due date (earliest first)
    if (a.dueDate && b.dueDate) {
      const dateA = parseISO(a.dueDate).getTime();
      const dateB = parseISO(b.dueDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
    }

    // Secondary tie-breaker: fallback to string comparison on ID
    return a.id.localeCompare(b.id);
  });
}
