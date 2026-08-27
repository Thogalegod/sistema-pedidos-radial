import { ContractStatus, RentalItemStatus } from './types';

const ALLOWED_CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['paused', 'closing_requested', 'cancelled'],
  paused: ['active', 'closing_requested', 'cancelled'],
  closing_requested: ['awaiting_return', 'inspection', 'closed', 'active', 'cancelled'],
  awaiting_return: ['inspection', 'closed', 'active', 'cancelled'],
  inspection: ['closed', 'active', 'cancelled'],
  closed: [],
  cancelled: [],
};

/**
 * Checks if a contract can transition from its current status to a target status.
 */
export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_CONTRACT_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Checks if a rental contract/locação is eligible to be closed.
 * It is eligible only if there are no items currently marked as 'rented'.
 * In other words, all items must be returned, replaced, lost/damaged, or suspended/exempt.
 */
export function canCloseRental(items: { status: RentalItemStatus }[]): boolean {
  if (items.length === 0) return false;
  
  return items.every(item => item.status !== 'rented');
}

/**
 * Checks if a rental item can transition from one status to another.
 * Typically items start as 'rented' and can go to any resolved state, or go back to 'rented' for correction.
 */
export function canTransitionItem(from: RentalItemStatus, to: RentalItemStatus): boolean {
  if (from === to) return true;
  
  // Standard transitions
  if (from === 'rented') {
    return ['returned', 'replaced', 'lost_damaged', 'suspended_exempt'].includes(to);
  }
  
  // Allow correcting resolved states back to 'rented'
  if (to === 'rented') {
    return true;
  }
  
  return false;
}
