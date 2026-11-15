import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentOrganizationId } from '@/lib/pedidos-tarefas/organization';
import {
  buildCentralOperationalSnapshot,
  type CentralBillingCycleRow,
  type CentralContractRow,
  type CentralCustomerRow,
  type CentralOrderRow,
  type CentralPaymentRow,
  type CentralRentalItemRow,
  type CentralTaskRow,
} from './operational';

const PERIOD_GENERATING_STATUSES = [
  'active',
  'paused',
  'closing_requested',
  'awaiting_return',
  'inspection',
] as const;

const OVERDUE_BILLING_CANDIDATE_STATUSES = ['issued', 'paid', 'overdue'] as const;

export interface CentralOperationalReadClient {
  getCurrentOrganizationId(): Promise<string>;
  listDueTasks(organizationId: string, today: string): Promise<CentralTaskRow[]>;
  listRelevantRentalContracts(organizationId: string): Promise<CentralContractRow[]>;
  listOverdueBillingCandidates(organizationId: string, today: string): Promise<CentralBillingCycleRow[]>;
  listOrdersByIds(organizationId: string, orderIds: string[]): Promise<CentralOrderRow[]>;
  listRentalItemsByContractIds(organizationId: string, contractIds: string[]): Promise<CentralRentalItemRow[]>;
  listBillingCyclesByContractIds(organizationId: string, contractIds: string[]): Promise<CentralBillingCycleRow[]>;
  listPaymentsByBillingIds(organizationId: string, billingIds: string[]): Promise<CentralPaymentRow[]>;
  listContractsByIds(organizationId: string, contractIds: string[]): Promise<CentralContractRow[]>;
  listCustomersByIds(organizationId: string, customerIds: string[]): Promise<CentralCustomerRow[]>;
}

export async function loadCentralOperationalSnapshot(
  client: CentralOperationalReadClient,
  today: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  const [tasks, periodContracts, overdueCandidates] = await Promise.all([
    client.listDueTasks(organizationId, today),
    client.listRelevantRentalContracts(organizationId),
    client.listOverdueBillingCandidates(organizationId, today),
  ]);

  const orderIds = unique(tasks.map((task) => task.pedido_id)
    .filter((orderId): orderId is string => orderId !== null));
  const periodContractIds = unique(periodContracts.map((contract) => contract.id));
  const overdueBillingIds = unique(overdueCandidates.map((billing) => billing.id));
  const knownContractIds = new Set(periodContractIds);
  const missingContractIds = unique(
    overdueCandidates
      .map((billing) => billing.contract_id)
      .filter((contractId) => !knownContractIds.has(contractId))
  );

  const [orders, rentalItems, periodBillingCycles, payments, additionalContracts] = await Promise.all([
    orderIds.length ? client.listOrdersByIds(organizationId, orderIds) : [],
    periodContractIds.length ? client.listRentalItemsByContractIds(organizationId, periodContractIds) : [],
    periodContractIds.length ? client.listBillingCyclesByContractIds(organizationId, periodContractIds) : [],
    overdueBillingIds.length ? client.listPaymentsByBillingIds(organizationId, overdueBillingIds) : [],
    missingContractIds.length ? client.listContractsByIds(organizationId, missingContractIds) : [],
  ]);

  const contracts = dedupeById([...periodContracts, ...additionalContracts]);
  const customerIds = unique(contracts.map((contract) => contract.customer_id));
  const customers = customerIds.length
    ? await client.listCustomersByIds(organizationId, customerIds)
    : [];

  return buildCentralOperationalSnapshot({
    today,
    tasks,
    orders,
    contracts,
    customers,
    rentalItems,
    billingCycles: dedupeById([...periodBillingCycles, ...overdueCandidates]),
    payments,
  });
}

export function createSupabaseCentralOperationalReadClient(
  client: SupabaseClient
): CentralOperationalReadClient {
  return {
    getCurrentOrganizationId: () => getCurrentOrganizationId(client),

    async listDueTasks(organizationId, today) {
      const { data, error } = await client
        .from('tarefas')
        .select('id, pedido_id, descricao, vencimento, concluido')
        .eq('organization_id', organizationId)
        .eq('concluido', false)
        .lte('vencimento', today)
        .order('vencimento', { ascending: true });
      return rowsOrThrow(data, error, 'Não foi possível carregar as tarefas da Central');
    },

    async listRelevantRentalContracts(organizationId) {
      const { data, error } = await client
        .from('contracts')
        .select('id, internal_number, customer_id, start_date, kind, status')
        .eq('organization_id', organizationId)
        .eq('kind', 'rental')
        .in('status', [...PERIOD_GENERATING_STATUSES]);
      return rowsOrThrow(data, error, 'Não foi possível carregar os contratos ativos da Central');
    },

    async listOverdueBillingCandidates(organizationId, today) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('id, contract_id, sequence_number, period_start, period_end, due_date, total_amount, status')
        .eq('organization_id', organizationId)
        .in('status', [...OVERDUE_BILLING_CANDIDATE_STATUSES])
        .lt('due_date', today)
        .order('due_date', { ascending: true });
      return rowsOrThrow(data, error, 'Não foi possível carregar as cobranças vencidas da Central');
    },

    async listOrdersByIds(organizationId, orderIds) {
      const { data, error } = await client
        .from('pedidos')
        .select('id, numero_pedido, projeto, cliente')
        .eq('organization_id', organizationId)
        .in('id', orderIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar os pedidos das tarefas');
    },

    async listRentalItemsByContractIds(organizationId, contractIds) {
      const { data, error } = await client
        .from('rental_items')
        .select('id, contract_id, asset_id, returned_at')
        .eq('organization_id', organizationId)
        .in('contract_id', contractIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar os equipamentos locados');
    },

    async listBillingCyclesByContractIds(organizationId, contractIds) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('id, contract_id, sequence_number, period_start, period_end, due_date, total_amount, status')
        .eq('organization_id', organizationId)
        .in('contract_id', contractIds)
        .order('sequence_number', { ascending: true });
      return rowsOrThrow(data, error, 'Não foi possível carregar os períodos faturados');
    },

    async listPaymentsByBillingIds(organizationId, billingIds) {
      const { data, error } = await client
        .from('payments')
        .select('id, billing_cycle_id, amount')
        .eq('organization_id', organizationId)
        .in('billing_cycle_id', billingIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar os pagamentos das cobranças');
    },

    async listContractsByIds(organizationId, contractIds) {
      const { data, error } = await client
        .from('contracts')
        .select('id, internal_number, customer_id, start_date, kind, status')
        .eq('organization_id', organizationId)
        .in('id', contractIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar os contratos das cobranças');
    },

    async listCustomersByIds(organizationId, customerIds) {
      const { data, error } = await client
        .from('customers')
        .select('id, legal_name')
        .eq('organization_id', organizationId)
        .in('id', customerIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar os clientes da Central');
    },
  };
}

function rowsOrThrow<T>(
  data: unknown[] | null,
  error: { message: string } | null,
  message: string
) {
  if (error) throw new Error(`${message}: ${error.message}`);
  return (data ?? []) as T[];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
