import type { BillingCycle, ContractStatus, RentalItem } from './types';

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

export interface RentalItemBillingLineDraft {
  id: string;
  rental_item_id: string;
  description: string;
  quantity: number;
  unit_amount: string;
  kind: 'recurring';
}

export type RentalBillingCoverageStatus =
  | 'first_period_required'
  | 'current'
  | 'new_period_required';

interface ContractBillingPriorityItem {
  billing_coverage_status: RentalBillingCoverageStatus | null;
  start_date: string;
  latest_billing_period_end: string | null;
}

export function sortContractsByBillingPriority<T extends ContractBillingPriorityItem>(contracts: T[]) {
  const priority = (contract: T) => {
    if (contract.billing_coverage_status === 'new_period_required') return 0;
    if (contract.billing_coverage_status === 'first_period_required') return 1;
    if (contract.billing_coverage_status === 'current') return 2;
    return 3;
  };

  return contracts
    .map((contract, index) => ({ contract, index }))
    .sort((left, right) => {
      const leftPriority = priority(left.contract);
      const rightPriority = priority(right.contract);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      if (leftPriority === 3) return left.index - right.index;

      const leftDate = leftPriority === 1
        ? left.contract.start_date
        : left.contract.latest_billing_period_end ?? '';
      const rightDate = rightPriority === 1
        ? right.contract.start_date
        : right.contract.latest_billing_period_end ?? '';
      const byDate = leftDate.localeCompare(rightDate);
      return byDate !== 0 ? byDate : left.index - right.index;
    })
    .map(({ contract }) => contract);
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

export function selectLatestBillingCoveragePeriod(billingCycles: BillingCycle[]) {
  return billingCycles
    .filter((billing) => billing.status !== 'draft' && billing.status !== 'cancelled')
    .reduce<BillingCycle | null>((latest, billing) => (
      !latest || billing.period_end > latest.period_end ? billing : latest
    ), null);
}

export function resolveRentalBillingCoverage(params: {
  contractStatus: ContractStatus;
  today: string;
  latestPeriodEnd: string | null;
}): RentalBillingCoverageStatus | null {
  if (params.contractStatus !== 'active') {
    return null;
  }

  if (!params.latestPeriodEnd) {
    return 'first_period_required';
  }

  return params.today <= params.latestPeriodEnd ? 'current' : 'new_period_required';
}

function normalizeDescriptionPart(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function containsDescriptionPart(description: string, part: string) {
  return description.toLocaleLowerCase('pt-BR').includes(part.toLocaleLowerCase('pt-BR'));
}

export function buildRentalItemBillingLines(
  items: RentalItem[],
  createId: () => string
): RentalItemBillingLineDraft[] {
  return items.map((item) => {
    let description = normalizeDescriptionPart(item.description);

    for (const part of [item.equipment_type, item.capacity]) {
      const normalizedPart = normalizeDescriptionPart(part);
      if (normalizedPart && !containsDescriptionPart(description, normalizedPart)) {
        description = [description, normalizedPart].filter(Boolean).join(' ');
      }
    }

    const serialNumber = normalizeDescriptionPart(item.serial_number);
    if (serialNumber && !containsDescriptionPart(description, serialNumber)) {
      description = description
        ? `${description} - Série ${serialNumber}`
        : `Série ${serialNumber}`;
    }

    return {
      id: createId(),
      rental_item_id: item.id,
      description,
      quantity: item.quantity,
      unit_amount: item.unit_amount,
      kind: 'recurring',
    };
  });
}
