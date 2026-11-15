import type { BillingListItem, ContractListItem } from './queries';
import type { ContractStatus } from './types';

export type RentalQuickFilter = 'active' | 'all' | 'completed' | 'periods_to_issue' | 'overdue' | 'due_today' | 'awaiting_return' | 'paused';

const quickFilters: RentalQuickFilter[] = ['active', 'all', 'completed', 'periods_to_issue', 'overdue', 'due_today', 'awaiting_return', 'paused'];
const operationalStatuses = new Set<ContractStatus>([
  'active',
  'paused',
  'closing_requested',
  'awaiting_return',
  'inspection',
]);

export function normalizeRentalQuickFilter(value: string | null): RentalQuickFilter {
  return quickFilters.find((filter) => filter === value) ?? 'active';
}

export function isPeriodToIssue(contract: ContractListItem) {
  return contract.kind === 'rental' && (
    contract.billing_coverage_status === 'first_period_required'
    || contract.billing_coverage_status === 'new_period_required'
  );
}

function isOpenBilling(billing: BillingListItem) {
  return !['draft', 'paid', 'cancelled', 'exempt'].includes(billing.status)
    && Number(billing.balance_amount) > 0;
}

export function selectOperationalBilling(contractId: string, billings: BillingListItem[]) {
  return billings.find((billing) => billing.contract_id === contractId && isOpenBilling(billing)) ?? null;
}

export function filterContractsByQuickFilter(
  contracts: ContractListItem[],
  billings: BillingListItem[],
  filter: RentalQuickFilter
) {
  if (filter === 'all') return contracts;
  return contracts.filter((contract) => {
    if (filter === 'active') return operationalStatuses.has(contract.status);
    if (filter === 'completed') return contract.status === 'closed';
    if (filter === 'periods_to_issue') return isPeriodToIssue(contract);
    if (filter === 'awaiting_return' || filter === 'paused') return contract.status === filter;
    return billings.some((billing) => billing.contract_id === contract.id
      && isOpenBilling(billing)
      && billing.alert === filter);
  });
}
