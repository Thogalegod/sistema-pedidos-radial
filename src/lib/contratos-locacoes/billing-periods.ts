import type { BillingCycle, RentalItem } from './types';

export interface BillingPeriodDraft {
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  sequence_number: number;
}

export interface BillingPeriodRange {
  id?: string;
  period_start: string;
  period_end: string;
}

export interface BillingPeriodConflict {
  type: 'duplicate' | 'overlap';
  billing: BillingPeriodRange;
}

function parseDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Data inválida.');
  }

  return {
    year: Number.parseInt(match[1], 10),
    month: Number.parseInt(match[2], 10),
    day: Number.parseInt(match[3], 10),
  };
}

function formatDateUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: string, days: number) {
  const { year, month, day } = parseDateParts(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateUtc(result);
}

function addMonthsClamped(date: string, months: number) {
  const { year, month, day } = parseDateParts(date);
  const zeroBasedMonth = month - 1 + months;
  const targetYear = year + Math.floor(zeroBasedMonth / 12);
  const targetMonth = ((zeroBasedMonth % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth + 1));

  return formatDateUtc(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
}

export function buildMonthlyPeriodEnd(periodStart: string) {
  return addDays(addMonthsClamped(periodStart, 1), -1);
}

export function buildNextMonthlyBillingPeriod(params: {
  contractStartDate: string;
  contractEndDate?: string | null;
  existingBillingCycles: BillingCycle[];
  issueDate: string;
}): BillingPeriodDraft | null {
  const sorted = [...params.existingBillingCycles].sort((left, right) => {
    const byEnd = left.period_end.localeCompare(right.period_end);
    return byEnd !== 0 ? byEnd : left.sequence_number - right.sequence_number;
  });
  const last = sorted[sorted.length - 1];
  const periodStart = last ? addDays(last.period_end, 1) : params.contractStartDate;
  const sequenceNumber = Math.max(0, ...params.existingBillingCycles.map((billing) => billing.sequence_number)) + 1;
  const contractEndDate = params.contractEndDate ?? null;

  if (contractEndDate && periodStart > contractEndDate) {
    return null;
  }

  const normalPeriodEnd = buildMonthlyPeriodEnd(periodStart);
  const periodEnd = contractEndDate && normalPeriodEnd > contractEndDate
    ? contractEndDate
    : normalPeriodEnd;

  return {
    period_start: periodStart,
    period_end: periodEnd,
    issue_date: params.issueDate,
    due_date: periodEnd,
    sequence_number: sequenceNumber,
  };
}

export function billingPeriodsOverlap(left: BillingPeriodRange, right: BillingPeriodRange) {
  return left.period_start <= right.period_end && right.period_start <= left.period_end;
}

export function findBillingPeriodConflict(
  existingBillingCycles: BillingPeriodRange[],
  candidate: BillingPeriodRange & { ignoreBillingCycleId?: string }
): BillingPeriodConflict | null {
  const conflicting = existingBillingCycles.find((billing) => {
    if (candidate.ignoreBillingCycleId && billing.id === candidate.ignoreBillingCycleId) {
      return false;
    }

    return billingPeriodsOverlap(billing, candidate);
  });

  if (!conflicting) {
    return null;
  }

  return {
    type: conflicting.period_start === candidate.period_start && conflicting.period_end === candidate.period_end
      ? 'duplicate'
      : 'overlap',
    billing: conflicting,
  };
}

export function assertNoBillingPeriodConflict(
  existingBillingCycles: BillingPeriodRange[],
  candidate: BillingPeriodRange & { ignoreBillingCycleId?: string }
) {
  const conflict = findBillingPeriodConflict(existingBillingCycles, candidate);
  if (!conflict) {
    return;
  }

  if (conflict.type === 'duplicate') {
    throw new Error('Já existe uma cobrança com o mesmo período.');
  }

  throw new Error('O período informado se sobrepõe a uma cobrança existente.');
}

export function suggestBillingAmountFromItems(items: RentalItem[]) {
  const total = items.reduce((sum, item) => {
    const unitAmount = Number.parseInt(item.unit_amount, 10) || 0;
    return sum + item.quantity * unitAmount;
  }, 0);

  return String(total);
}
