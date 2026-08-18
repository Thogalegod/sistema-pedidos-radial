import { addDays, parseISO, format, differenceInCalendarDays } from 'date-fns';

export interface Period {
  start: string;
  end: string;
  due: string;
}

export function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const BILLING_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const BILLING_MONTH_LABELS = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

export function resolveBillingMonth(value: string | null | undefined, now = new Date()) {
  if (value && BILLING_MONTH_PATTERN.test(value)) {
    return value;
  }

  return toLocalDateKey(now).slice(0, 7);
}

export function shiftBillingMonth(month: string, offset: number) {
  const resolvedMonth = resolveBillingMonth(month);
  const [year, monthNumber] = resolvedMonth.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatBillingMonthLabel(month: string) {
  const resolvedMonth = resolveBillingMonth(month);
  const [year, monthNumber] = resolvedMonth.split('-').map(Number);
  return `${BILLING_MONTH_LABELS[monthNumber - 1]}/${year}`;
}

export function isDateInBillingMonth(date: string, month: string) {
  return date.startsWith(`${resolveBillingMonth(month)}-`);
}

export function buildBillingMonthHref(pathname: string, currentQuery: string, month: string) {
  const params = new URLSearchParams(currentQuery);
  params.set('month', resolveBillingMonth(month));
  return `${pathname}?${params.toString()}`;
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
