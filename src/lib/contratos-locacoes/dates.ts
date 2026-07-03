import { addDays, parseISO, format, differenceInCalendarDays } from 'date-fns';

export interface Period {
  start: string;
  end: string;
  due: string;
}

export function nextPeriod(start: string, recurrenceDays: number): Period {
  const startDate = parseISO(start);
  const endDate = addDays(startDate, recurrenceDays - 1);
  const dueDate = addDays(endDate, 1);

  return {
    start: format(startDate, 'yyyy-MM-dd'),
    end: format(endDate, 'yyyy-MM-dd'),
    due: format(dueDate, 'yyyy-MM-dd'),
  };
}

export type AlertLevel = 'ok' | 'due_soon' | 'due_today' | 'overdue';

export function alertLevel(today: string, due: string): AlertLevel {
  const todayDate = parseISO(today);
  const dueDate = parseISO(due);
  const diffDays = differenceInCalendarDays(dueDate, todayDate);

  if (diffDays < 0) {
    return 'overdue';
  } else if (diffDays === 0) {
    return 'due_today';
  } else if (diffDays <= 7) {
    return 'due_soon';
  } else {
    return 'ok';
  }
}
