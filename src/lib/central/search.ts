import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentOrganizationId } from '@/lib/pedidos-tarefas/organization';
import { buildOrderHref, buildTaskHref } from '@/lib/pedidos-tarefas/navigation';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';

export interface CentralSearchOrderRow {
  id: string;
  numero_pedido: string;
  projeto: string;
  cliente: string;
}

export interface CentralSearchCustomerRow {
  id: string;
  legal_name: string;
  trade_name: string;
}

export interface CentralSearchContractRow {
  id: string;
  internal_number: string;
  customer_id: string;
}

export interface CentralSearchBillingRow {
  id: string;
  contract_id: string;
  document_number: string | null;
  period_start: string;
  period_end: string;
  total_amount: string;
}

export interface CentralSearchTaskRow {
  id: string;
  pedido_id: string | null;
  descricao: string;
}

export interface CentralSearchReadClient {
  getCurrentOrganizationId(): Promise<string>;
  searchOrders(organizationId: string, query: string, limit: number): Promise<CentralSearchOrderRow[]>;
  searchTasks(organizationId: string, query: string, limit: number): Promise<CentralSearchTaskRow[]>;
  searchCustomers(organizationId: string, query: string, limit: number): Promise<CentralSearchCustomerRow[]>;
  searchContracts(organizationId: string, query: string, customerIds: string[], limit: number): Promise<CentralSearchContractRow[]>;
  searchBillings(organizationId: string, query: string, contractIds: string[], limit: number): Promise<CentralSearchBillingRow[]>;
  listContractsByIds(organizationId: string, contractIds: string[]): Promise<CentralSearchContractRow[]>;
  listCustomersByIds(organizationId: string, customerIds: string[]): Promise<CentralSearchCustomerRow[]>;
}

export interface CentralSearchResultItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  documentNumber?: string | null;
}

export interface CentralSearchResults {
  tasks: CentralSearchResultItem[];
  orders: CentralSearchResultItem[];
  customers: CentralSearchResultItem[];
  contracts: CentralSearchResultItem[];
  billings: CentralSearchResultItem[];
}

const EMPTY_RESULTS: CentralSearchResults = { tasks: [], orders: [], customers: [], contracts: [], billings: [] };

export async function searchCentral(
  client: CentralSearchReadClient,
  rawQuery: string,
  limit = 5
): Promise<CentralSearchResults> {
  const query = rawQuery.trim();
  if (query.length < 2) return EMPTY_RESULTS;

  const organizationId = await client.getCurrentOrganizationId();
  const [tasks, orders, matchedCustomers] = await Promise.all([
    client.searchTasks(organizationId, query, limit),
    client.searchOrders(organizationId, query, limit),
    client.searchCustomers(organizationId, query, limit),
  ]);
  const contracts = await client.searchContracts(
    organizationId,
    query,
    matchedCustomers.map((customer) => customer.id),
    limit
  );
  const billings = await client.searchBillings(
    organizationId,
    query,
    contracts.map((contract) => contract.id),
    limit
  );

  const knownContractIds = new Set(contracts.map((contract) => contract.id));
  const missingContractIds = unique(billings.map((billing) => billing.contract_id).filter((id) => !knownContractIds.has(id)));
  const relatedContracts = missingContractIds.length
    ? await client.listContractsByIds(organizationId, missingContractIds)
    : [];
  const allContracts = dedupeById([...contracts, ...relatedContracts]);

  const knownCustomerIds = new Set(matchedCustomers.map((customer) => customer.id));
  const missingCustomerIds = unique(allContracts.map((contract) => contract.customer_id).filter((id) => !knownCustomerIds.has(id)));
  const relatedCustomers = missingCustomerIds.length
    ? await client.listCustomersByIds(organizationId, missingCustomerIds)
    : [];
  const customersById = new Map([...matchedCustomers, ...relatedCustomers].map((customer) => [customer.id, customer]));
  const contractsById = new Map(allContracts.map((contract) => [contract.id, contract]));

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.descricao,
      detail: task.pedido_id ? 'Tarefa de Pedido' : 'Tarefa avulsa',
      href: buildTaskHref(task.id, task.pedido_id),
    })),
    orders: orders.map((order) => ({
      id: order.id,
      title: `Pedido #${order.numero_pedido}`,
      detail: `${order.cliente} · ${order.projeto}`,
      href: buildOrderHref(order.id),
    })),
    customers: matchedCustomers.map((customer) => ({
      id: customer.id,
      title: customer.legal_name,
      detail: customer.trade_name || 'Cliente',
      href: `/contratos-locacoes/clientes/${customer.id}`,
    })),
    contracts: contracts.map((contract) => ({
      id: contract.id,
      title: `Contrato #${contract.internal_number}`,
      detail: customersById.get(contract.customer_id)?.legal_name ?? 'Cliente não identificado',
      href: `/contratos-locacoes/contratos/${contract.id}`,
    })),
    billings: billings.map((billing) => {
      const contract = contractsById.get(billing.contract_id);
      const customer = contract ? customersById.get(contract.customer_id) : null;
      return {
        id: billing.id,
        title: billing.document_number ? `Fatura ${billing.document_number}` : `Cobrança do contrato #${contract?.internal_number ?? billing.contract_id}`,
        detail: `${customer?.legal_name ?? 'Cliente não identificado'} · ${formatPeriod(billing.period_start, billing.period_end)} · ${formatBRL(billing.total_amount)}`,
        href: `/contratos-locacoes/contratos/${billing.contract_id}`,
        documentNumber: billing.document_number,
      };
    }),
  };
}

export function createSupabaseCentralSearchReadClient(client: SupabaseClient): CentralSearchReadClient {
  return {
    getCurrentOrganizationId: () => getCurrentOrganizationId(client),

    async searchTasks(organizationId, query, limit) {
      const term = normalizeFilterTerm(query);
      const { data, error } = await client.from('tarefas')
        .select('id, pedido_id, descricao')
        .eq('organization_id', organizationId)
        .ilike('descricao', `%${term}%`)
        .limit(limit);
      return rowsOrThrow(data, error, 'Não foi possível buscar tarefas');
    },

    async searchOrders(organizationId, query, limit) {
      const term = normalizeFilterTerm(query);
      const { data, error } = await client.from('pedidos')
        .select('id, numero_pedido, projeto, cliente')
        .eq('organization_id', organizationId)
        .or(`numero_pedido.ilike.%${term}%,projeto.ilike.%${term}%,cliente.ilike.%${term}%`)
        .limit(limit);
      return rowsOrThrow(data, error, 'Não foi possível buscar pedidos');
    },

    async searchCustomers(organizationId, query, limit) {
      const term = normalizeFilterTerm(query);
      const { data, error } = await client.from('customers')
        .select('id, legal_name, trade_name')
        .eq('organization_id', organizationId)
        .or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%`)
        .limit(limit);
      return rowsOrThrow(data, error, 'Não foi possível buscar clientes');
    },

    async searchContracts(organizationId, query, customerIds, limit) {
      const searches: Array<PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>> = [];
      if (/^\d+$/.test(query)) {
        searches.push(client.from('contracts')
          .select('id, internal_number, customer_id')
          .eq('organization_id', organizationId)
          .eq('internal_number', query)
          .limit(limit));
      }
      if (customerIds.length) {
        searches.push(client.from('contracts')
          .select('id, internal_number, customer_id')
          .eq('organization_id', organizationId)
          .in('customer_id', customerIds)
          .limit(limit));
      }
      const responses = await Promise.all(searches);
      return dedupeById(responses.flatMap(({ data, error }) => rowsOrThrow<CentralSearchContractRow>(data, error, 'Não foi possível buscar contratos'))).slice(0, limit);
    },

    async searchBillings(organizationId, query, contractIds, limit) {
      const searches: Array<PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>> = [
        client.from('billing_cycles')
          .select('id, contract_id, document_number, period_start, period_end, total_amount')
          .eq('organization_id', organizationId)
          .ilike('document_number', `%${query}%`)
          .limit(limit),
      ];
      if (contractIds.length) {
        searches.push(client.from('billing_cycles')
          .select('id, contract_id, document_number, period_start, period_end, total_amount')
          .eq('organization_id', organizationId)
          .in('contract_id', contractIds)
          .limit(limit));
      }
      const responses = await Promise.all(searches);
      return dedupeById(responses.flatMap(({ data, error }) => rowsOrThrow<CentralSearchBillingRow>(data, error, 'Não foi possível buscar cobranças'))).slice(0, limit);
    },

    async listContractsByIds(organizationId, contractIds) {
      const { data, error } = await client.from('contracts')
        .select('id, internal_number, customer_id')
        .eq('organization_id', organizationId)
        .in('id', contractIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar contratos relacionados');
    },

    async listCustomersByIds(organizationId, customerIds) {
      const { data, error } = await client.from('customers')
        .select('id, legal_name, trade_name')
        .eq('organization_id', organizationId)
        .in('id', customerIds);
      return rowsOrThrow(data, error, 'Não foi possível carregar clientes relacionados');
    },
  };
}

function normalizeFilterTerm(value: string) {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatPeriod(start: string, end: string) {
  return `${formatDateLabel(start)} a ${formatDateLabel(end)}`;
}

function rowsOrThrow<T>(data: unknown[] | null, error: { message: string } | null, message: string) {
  if (error) throw new Error(`${message}: ${error.message}`);
  return (data ?? []) as T[];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
