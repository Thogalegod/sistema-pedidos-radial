import { alertLevel } from './dates';
import type { BillingStatus } from './types';

export interface BillingSnapshotInput {
  id: string;
  contract_id: string;
  internal_number: string;
  customer_name: string;
  site_name: string;
  legacy_order_number: string | null;
  document_number: string | null;
  document_type: 'receipt' | 'nfe' | 'legacy' | 'other';
  total_amount: string;
  due_date: string;
  issue_date: string;
  notes: string | null;
  status: BillingStatus;
  payments: string[];
}

export interface BillingAlertItem {
  id: string;
  contract_id: string;
  internal_number: string;
  customer_name: string;
  site_name: string;
  legacy_order_number: string | null;
  document_number: string | null;
  total_amount: string;
  paid_amount: string;
  balance_amount: string;
  due_date: string;
  issue_date: string;
  status: BillingStatus;
  level: 'ok' | 'due_soon' | 'due_today' | 'overdue';
}

export interface DashboardSnapshot {
  summary: {
    active_contracts: number;
    paused_contracts: number;
    billings_to_issue_count: number;
    due_soon_count: number;
    due_today_count: number;
    overdue_count: number;
    paid_count: number;
    open_total_amount: string;
    overdue_total_amount: string;
  };
  alerts: BillingAlertItem[];
  upcoming: BillingAlertItem[];
}

export interface BillingBalance {
  paid_amount: string;
  balance_amount: string;
  is_paid_in_full: boolean;
}

export function calculateBillingBalance(totalAmount: string, payments: string[]): BillingBalance {
  const total = Number.parseInt(totalAmount, 10);
  const paid = payments.reduce((sum, payment) => sum + Number.parseInt(payment, 10), 0);
  const balance = Math.max(0, total - paid);

  return {
    paid_amount: String(paid),
    balance_amount: String(balance),
    is_paid_in_full: balance === 0,
  };
}

export function buildBillingStatus(
  totalAmount: string,
  payments: string[],
  today: string,
  dueDate: string
): BillingStatus {
  const balance = calculateBillingBalance(totalAmount, payments);

  if (balance.is_paid_in_full) {
    return 'paid';
  }

  return alertLevel(today, dueDate) === 'overdue' ? 'overdue' : 'issued';
}

export function createBillingSnapshot(
  today: string,
  billings: BillingSnapshotInput[],
  contractSummary?: { active_contracts: number; paused_contracts: number }
): DashboardSnapshot {
  const alerts = billings.map((billing) => {
    const balance = calculateBillingBalance(billing.total_amount, billing.payments);
    const status = buildBillingStatus(billing.total_amount, billing.payments, today, billing.due_date);
    const level = status === 'paid' ? 'ok' : alertLevel(today, billing.due_date);

    return {
      id: billing.id,
      contract_id: billing.contract_id,
      internal_number: billing.internal_number,
      customer_name: billing.customer_name,
      site_name: billing.site_name,
      legacy_order_number: billing.legacy_order_number,
      document_number: billing.document_number,
      total_amount: billing.total_amount,
      paid_amount: balance.paid_amount,
      balance_amount: balance.balance_amount,
      due_date: billing.due_date,
      issue_date: billing.issue_date,
      status,
      level,
    } satisfies BillingAlertItem;
  });

  const openAlerts = alerts.filter((alert) => alert.status !== 'paid' && alert.status !== 'cancelled' && alert.status !== 'exempt');
  const overdueAlerts = openAlerts.filter((alert) => alert.level === 'overdue');

  return {
    summary: {
      active_contracts: contractSummary?.active_contracts ?? 0,
      paused_contracts: contractSummary?.paused_contracts ?? 0,
      billings_to_issue_count: billings.filter((billing) => billing.status === 'draft').length,
      due_soon_count: openAlerts.filter((alert) => alert.level === 'due_soon').length,
      due_today_count: openAlerts.filter((alert) => alert.level === 'due_today').length,
      overdue_count: overdueAlerts.length,
      paid_count: alerts.filter((alert) => alert.status === 'paid').length,
      open_total_amount: String(openAlerts.reduce((sum, alert) => sum + Number.parseInt(alert.balance_amount, 10), 0)),
      overdue_total_amount: String(overdueAlerts.reduce((sum, alert) => sum + Number.parseInt(alert.balance_amount, 10), 0)),
    },
    alerts: alerts
      .filter((alert) => alert.level !== 'ok')
      .sort((left, right) => left.due_date.localeCompare(right.due_date)),
    upcoming: openAlerts
      .sort((left, right) => left.due_date.localeCompare(right.due_date))
      .slice(0, 5),
  };
}
