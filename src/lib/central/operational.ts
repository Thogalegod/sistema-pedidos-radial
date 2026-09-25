import { buildNextMonthlyBillingPeriod, selectLatestBillingCoveragePeriod } from '@/lib/contratos-locacoes/billing-periods';
import { calculateBillingBalance, buildBillingStatus } from '@/lib/contratos-locacoes/dashboard';
import { resolveEffectiveBillingStatus } from '@/lib/contratos-locacoes/billing-status-presentation';
import { hasPendingPhysicalReturns } from '@/lib/contratos-locacoes/rental-closure';
import type { BillingStatus, ContractKind, ContractStatus } from '@/lib/contratos-locacoes/types';
import { buildTaskHref } from '@/lib/pedidos-tarefas/navigation';
import { getTaskDueStatus } from '@/lib/pedidos-tarefas/task-due';
import { resolveTaskStatus } from '@/lib/pedidos-tarefas/mappers';
import type { Capabilities } from '@/lib/pedidos-tarefas/types';

export interface CentralTaskRow {
  id: string;
  pedido_id: string;
  descricao: string;
  vencimento: string | null;
  concluido: boolean;
  status?: string | null;
}

export interface CentralOrderRow {
  id: string;
  numero_pedido: string;
  projeto: string;
  cliente: string;
}

export interface CentralContractRow {
  id: string;
  internal_number: string;
  customer_id: string;
  start_date: string;
  kind: ContractKind;
  status: ContractStatus;
}

export interface CentralCustomerRow {
  id: string;
  legal_name: string;
}

export interface CentralRentalItemRow {
  id: string;
  contract_id: string;
  asset_id: string | null;
  returned_at: string | null;
}

export interface CentralBillingCycleRow {
  id: string;
  contract_id: string;
  sequence_number: number;
  period_start: string;
  period_end: string;
  due_date: string;
  total_amount: string;
  status: BillingStatus;
}

export interface CentralPaymentRow {
  id: string;
  billing_cycle_id: string;
  amount: string;
}

export interface CentralOperationalInput {
  statusMode?: Capabilities['statusMode'];
  today: string;
  tasks: CentralTaskRow[];
  orders: CentralOrderRow[];
  contracts: CentralContractRow[];
  customers: CentralCustomerRow[];
  rentalItems: CentralRentalItemRow[];
  billingCycles: CentralBillingCycleRow[];
  payments: CentralPaymentRow[];
}

export interface CentralTaskAttention {
  kind: 'task_overdue' | 'task_today';
  id: string;
  orderId: string;
  orderNumber: string;
  orderTitle: string;
  customerName: string;
  title: string;
  dueDate: string;
  href: string;
}

export interface CentralPeriodToBill {
  kind: 'period_to_bill';
  contractId: string;
  internalNumber: string;
  customerName: string;
  previousPeriodEnd: string | null;
  nextPeriodStart: string;
  href: string;
}

export interface CentralOverdueBilling {
  kind: 'overdue_billing';
  id: string;
  contractId: string;
  internalNumber: string;
  customerName: string;
  dueDate: string;
  balanceAmount: string;
  href: string;
}

export type CentralPriority = CentralTaskAttention | CentralPeriodToBill | CentralOverdueBilling;

const PERIOD_GENERATING_STATUSES = new Set<ContractStatus>([
  'active',
  'paused',
  'closing_requested',
  'awaiting_return',
  'inspection',
]);

export function buildCentralOperationalSnapshot(input: CentralOperationalInput) {
  const ordersById = new Map(input.orders.map((order) => [order.id, order]));
  const contractsById = new Map(input.contracts.map((contract) => [contract.id, contract]));
  const customersById = new Map(input.customers.map((customer) => [customer.id, customer]));
  const itemsByContract = groupBy(input.rentalItems, (item) => item.contract_id);
  const billingsByContract = groupBy(input.billingCycles, (billing) => billing.contract_id);
  const paymentsByBilling = groupBy(input.payments, (payment) => payment.billing_cycle_id);

  const tasks = input.tasks.flatMap<CentralTaskAttention>((task) => {
    const completed = resolveTaskStatus(task, input.statusMode ?? 'legacy') === 'Concluída';
    const dueStatus = getTaskDueStatus({ completed, dueDate: task.vencimento }, input.today);
    if ((dueStatus !== 'overdue' && dueStatus !== 'today') || !task.vencimento) return [];
    const order = ordersById.get(task.pedido_id);
    return [{
      kind: dueStatus === 'overdue' ? 'task_overdue' : 'task_today',
      id: task.id,
      orderId: task.pedido_id,
      orderNumber: order?.numero_pedido ?? task.pedido_id,
      orderTitle: order?.projeto ?? 'Pedido',
      customerName: order?.cliente ?? 'Cliente não identificado',
      title: task.descricao,
      dueDate: task.vencimento,
      href: buildTaskHref(task.id, task.pedido_id),
    }];
  });

  const periodsToBill = input.contracts.flatMap<CentralPeriodToBill>((contract) => {
    if (contract.kind !== 'rental' || !PERIOD_GENERATING_STATUSES.has(contract.status)) return [];
    const items = itemsByContract.get(contract.id) ?? [];
    if (!hasPendingPhysicalReturns(items) && !(contract.status === 'active' && items.some((item) => !item.asset_id))) return [];

    const validCycles = (billingsByContract.get(contract.id) ?? [])
      .filter((billing) => billing.status !== 'draft' && billing.status !== 'cancelled');
    const latest = selectLatestBillingCoveragePeriod(validCycles);
    const nextPeriod = buildNextMonthlyBillingPeriod({
      contractStartDate: contract.start_date,
      existingBillingCycles: validCycles,
      issueDate: input.today,
    });

    if (!nextPeriod || nextPeriod.period_start > input.today) return [];
    return [{
      kind: 'period_to_bill',
      contractId: contract.id,
      internalNumber: contract.internal_number,
      customerName: customersById.get(contract.customer_id)?.legal_name ?? 'Cliente não identificado',
      previousPeriodEnd: latest?.period_end ?? null,
      nextPeriodStart: nextPeriod.period_start,
      href: `/contratos-locacoes/contratos/${contract.id}`,
    }];
  });

  const overdueBillings = input.billingCycles.flatMap<CentralOverdueBilling>((billing) => {
    if (billing.due_date >= input.today) return [];
    const paidAmounts = (paymentsByBilling.get(billing.id) ?? []).map((payment) => payment.amount);
    const balance = calculateBillingBalance(billing.total_amount, paidAmounts);
    const effectiveStatus = resolveEffectiveBillingStatus(
      billing.status,
      buildBillingStatus(billing.total_amount, paidAmounts, input.today, billing.due_date)
    );
    if (effectiveStatus !== 'overdue' || !Number.parseInt(balance.balance_amount, 10)) return [];
    const contract = contractsById.get(billing.contract_id);
    return [{
      kind: 'overdue_billing',
      id: billing.id,
      contractId: billing.contract_id,
      internalNumber: contract?.internal_number ?? billing.contract_id,
      customerName: contract
        ? customersById.get(contract.customer_id)?.legal_name ?? 'Cliente não identificado'
        : 'Cliente não identificado',
      dueDate: billing.due_date,
      balanceAmount: balance.balance_amount,
      href: `/contratos-locacoes/contratos/${billing.contract_id}`,
    }];
  });

  const priorities: CentralPriority[] = [...tasks, ...periodsToBill, ...overdueBillings]
    .sort((left, right) => {
      const leftDate = priorityDate(left);
      const rightDate = priorityDate(right);
      const byDate = leftDate.localeCompare(rightDate);
      if (byDate !== 0) return byDate;
      return Number(left.kind === 'task_today') - Number(right.kind === 'task_today');
    });

  return {
    summary: {
      overdueTasks: tasks.filter((task) => task.kind === 'task_overdue').length,
      tasksToday: tasks.filter((task) => task.kind === 'task_today').length,
      periodsToBill: periodsToBill.length,
      overdueBillings: overdueBillings.length,
    },
    priorities,
    tasks,
    periodsToBill,
    overdueBillings,
  };
}

export type CentralOperationalSnapshot = ReturnType<typeof buildCentralOperationalSnapshot>;

function priorityDate(priority: CentralPriority) {
  if (priority.kind === 'period_to_bill') return priority.previousPeriodEnd ?? priority.nextPeriodStart;
  return priority.dueDate;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const value = key(item);
    grouped.set(value, [...(grouped.get(value) ?? []), item]);
  });
  return grouped;
}
