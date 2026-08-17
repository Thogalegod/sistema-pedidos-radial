import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingCycle, Contract, Customer, CustomerContact, CustomerSite, Payment, RentalAsset, RentalItem } from './types';
import { createBillingSnapshot, type BillingSnapshotInput, type DashboardSnapshot } from './dashboard';
import { buildBillingStatus, calculateBillingBalance } from './dashboard';
import { alertLevel } from './dates';
import { buildReceiptSnapshot, type ReceiptSnapshot } from './receipt';
import type { BillingLine } from './types';
import {
  listAvailableRentalAssets as deriveAvailableRentalAssets,
  type RentalAssetAvailabilityContract,
  type RentalAssetAvailabilityInterval,
  type RentalAssetAvailabilityItem,
} from './rental-assets';

export interface CustomerListFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
}

export interface CustomerListItem {
  id: string;
  legal_name: string;
  trade_name: string;
  tax_id: string | null;
  active: boolean;
  site_count: number;
  contact_count: number;
  cities: string[];
  updated_at: string;
}

export interface CustomerDetail {
  customer: Customer;
  sites: CustomerSite[];
  contacts: CustomerContact[];
}

export interface ContractListFilters {
  search?: string;
  kind?: 'all' | Contract['kind'];
  status?: 'all' | Contract['status'];
}

export interface ContractListItem {
  id: string;
  internal_number: string;
  kind: Contract['kind'];
  status: Contract['status'];
  customer_name: string;
  site_name: string;
  legacy_order_number: string | null;
  start_date: string;
  recurrence_days: number;
  item_count: number;
}

export interface ContractDetail {
  contract: Contract;
  customer: Customer | null;
  site: CustomerSite | null;
  items: RentalItem[];
  billingCycles: BillingCycle[];
  payments: Payment[];
}

export interface BillingListFilters {
  search?: string;
  status?: 'all' | 'to_issue' | 'due_soon' | 'due_today' | 'overdue' | 'issued' | 'paid' | 'exempt' | 'cancelled';
}

export interface BillingListItem {
  id: string;
  contract_id: string;
  internal_number: string;
  customer_name: string;
  site_name: string;
  legacy_order_number: string | null;
  document_number: string | null;
  document_type: BillingCycle['document_type'];
  due_date: string;
  issue_date: string;
  period_start: string;
  period_end: string;
  sent_at: string | null;
  total_amount: string;
  paid_amount: string;
  balance_amount: string;
  status: BillingCycle['status'];
  alert: 'ok' | 'due_soon' | 'due_today' | 'overdue';
}

export interface RentalAssetListFilters {
  search?: string;
  status?: 'all' | RentalAsset['operational_status'];
}

export interface ContractsLocacoesReadClient {
  getCurrentOrganizationId(): Promise<string>;
  listCustomersByOrganization(
    organizationId: string,
    filters?: Pick<CustomerListFilters, 'status'>
  ): Promise<Customer[]>;
  listSitesByCustomerIds(organizationId: string, customerIds: string[]): Promise<CustomerSite[]>;
  listContactsByCustomerIds(organizationId: string, customerIds: string[]): Promise<CustomerContact[]>;
  getCustomerById(organizationId: string, customerId: string): Promise<Customer>;
  listContractsByOrganization(
    organizationId: string,
    filters?: Pick<ContractListFilters, 'kind' | 'status'>
  ): Promise<Contract[]>;
  getContractById(organizationId: string, contractId: string): Promise<Contract>;
  getBillingCycleById?(organizationId: string, billingId: string): Promise<BillingCycle>;
  listRentalItemsByContractIds(organizationId: string, contractIds: string[]): Promise<RentalItem[]>;
  listBillingCyclesByOrganization?(organizationId: string): Promise<BillingCycle[]>;
  listBillingCyclesByContractId?(organizationId: string, contractId: string): Promise<BillingCycle[]>;
  listBillingLinesByBillingCycleIds?(organizationId: string, billingCycleIds: string[]): Promise<BillingLine[]>;
  listPaymentsByBillingCycleIds?(organizationId: string, billingCycleIds: string[]): Promise<Payment[]>;
  listRentalAssetsByOrganization?(
    organizationId: string,
    filters?: { status?: RentalAsset['operational_status'] }
  ): Promise<RentalAsset[]>;
  getRentalAssetById?(organizationId: string, assetId: string): Promise<RentalAsset>;
  listRentalItemsByAssetIds?(
    organizationId: string,
    assetIds: string[]
  ): Promise<RentalAssetAvailabilityItem[]>;
  listContractsByIds?(
    organizationId: string,
    contractIds: string[]
  ): Promise<RentalAssetAvailabilityContract[]>;
}

type SupabaseRow = Record<string, unknown>;

function ensureData<T>(data: T | null, error: { message: string } | null, message: string) {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }

  if (data == null) {
    throw new Error(message);
  }

  return data;
}

export function createSupabaseContractsLocacoesReadClient(
  client: SupabaseClient
): ContractsLocacoesReadClient {
  return {
    async getCurrentOrganizationId() {
      const { data, error } = await client
        .from('organization_members')
        .select('organization_id')
        .limit(1)
        .single();

      const membership = ensureData(
        data as { organization_id: string } | null,
        error,
        'Não foi possível identificar a organização atual'
      );

      return membership.organization_id;
    },

    async listCustomersByOrganization(organizationId, filters = {}) {
      let query = client
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId);

      if (filters.status === 'active') {
        query = query.eq('active', true);
      }

      if (filters.status === 'inactive') {
        query = query.eq('active', false);
      }

      const { data, error } = await query.order('legal_name', { ascending: true });

      return ensureData(
        (data ?? []) as Customer[] | null,
        error,
        'Não foi possível listar clientes'
      );
    },

    async listSitesByCustomerIds(organizationId, customerIds) {
      if (customerIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('customer_sites')
        .select('*')
        .eq('organization_id', organizationId)
        .in('customer_id', customerIds)
        .order('name', { ascending: true });

      return ensureData(
        (data ?? []) as CustomerSite[] | null,
        error,
        'Não foi possível listar obras/locais'
      );
    },

    async listContactsByCustomerIds(organizationId, customerIds) {
      if (customerIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('customer_contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .in('customer_id', customerIds)
        .order('name', { ascending: true });

      return ensureData(
        (data ?? []) as CustomerContact[] | null,
        error,
        'Não foi possível listar contatos'
      );
    },

    async getCustomerById(organizationId, customerId) {
      const { data, error } = await client
        .from('customers')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', customerId)
        .single();

      return ensureData(
        data as Customer | null,
        error,
        'Não foi possível carregar o cliente'
      );
    },

    async listContractsByOrganization(organizationId, filters = {}) {
      let query = client
        .from('contracts')
        .select('*')
        .eq('organization_id', organizationId);

      if (filters.kind && filters.kind !== 'all') {
        query = query.eq('kind', filters.kind);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query.order('updated_at', { ascending: false });

      return ensureData((data ?? []) as Contract[] | null, error, 'Não foi possível listar contratos');
    },

    async getContractById(organizationId, contractId) {
      const { data, error } = await client
        .from('contracts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', contractId)
        .single();

      return ensureData(data as Contract | null, error, 'Não foi possível carregar o contrato');
    },

    async listRentalItemsByContractIds(organizationId, contractIds) {
      if (contractIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('rental_items')
        .select('*')
        .eq('organization_id', organizationId)
        .in('contract_id', contractIds)
        .order('created_at', { ascending: true });

      return ensureData((data ?? []) as RentalItem[] | null, error, 'Não foi possível listar itens');
    },

    async listBillingCyclesByOrganization(organizationId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('*')
        .eq('organization_id', organizationId)
        .order('due_date', { ascending: true });

      return ensureData((data ?? []) as BillingCycle[] | null, error, 'Não foi possível listar cobranças');
    },

    async listBillingCyclesByContractId(organizationId, contractId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contract_id', contractId)
        .order('due_date', { ascending: true });

      return ensureData((data ?? []) as BillingCycle[] | null, error, 'Não foi possível listar cobranças do contrato');
    },

    async getBillingCycleById(organizationId, billingId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', billingId)
        .single();

      return ensureData(data as BillingCycle | null, error, 'Não foi possível carregar a cobrança');
    },

    async listBillingLinesByBillingCycleIds(organizationId, billingCycleIds) {
      if (billingCycleIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('billing_lines')
        .select('*')
        .eq('organization_id', organizationId)
        .in('billing_cycle_id', billingCycleIds)
        .order('created_at', { ascending: true });

      return ensureData((data ?? []) as BillingLine[] | null, error, 'Não foi possível listar as linhas da cobrança');
    },

    async listPaymentsByBillingCycleIds(organizationId, billingCycleIds) {
      if (billingCycleIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('billing_cycle_id', billingCycleIds)
        .order('paid_at', { ascending: true });

      return ensureData((data ?? []) as Payment[] | null, error, 'Não foi possível listar pagamentos');
    },

    async listRentalAssetsByOrganization(organizationId, filters = {}) {
      let query = client
        .from('rental_assets')
        .select('*')
        .eq('organization_id', organizationId);

      if (filters.status) {
        query = query.eq('operational_status', filters.status);
      }

      const { data, error } = await query.order('description', { ascending: true });

      return ensureData((data ?? []) as RentalAsset[] | null, error, 'Não foi possível listar ativos');
    },

    async getRentalAssetById(organizationId, assetId) {
      const { data, error } = await client
        .from('rental_assets')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', assetId)
        .single();

      return ensureData(data as RentalAsset | null, error, 'Não foi possível carregar o ativo');
    },

    async listRentalItemsByAssetIds(organizationId, assetIds) {
      if (assetIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('rental_items')
        .select('id, organization_id, contract_id, asset_id, status, returned_at')
        .eq('organization_id', organizationId)
        .in('asset_id', assetIds);

      return ensureData(
        (data ?? []) as RentalAssetAvailabilityItem[] | null,
        error,
        'Não foi possível listar vínculos de ativos'
      );
    },

    async listContractsByIds(organizationId, contractIds) {
      if (contractIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('contracts')
        .select('id, organization_id, kind, start_date, end_date, status')
        .eq('organization_id', organizationId)
        .eq('kind', 'rental')
        .in('id', contractIds);

      return ensureData(
        (data ?? []) as RentalAssetAvailabilityContract[] | null,
        error,
        'Não foi possível listar contratos dos ativos'
      );
    },
  };
}

function normalizeSearchText(value: string | number | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function requireReadMethod<T>(method: T | undefined, name: string): T {
  if (!method) {
    throw new Error(`Cliente de leitura sem suporte para ${name}`);
  }

  return method;
}

export async function listCustomers(
  client: ContractsLocacoesReadClient,
  filters: CustomerListFilters = {}
): Promise<CustomerListItem[]> {
  const organizationId = await client.getCurrentOrganizationId();
  const status = filters.status ?? 'active';
  const customers = await client.listCustomersByOrganization(organizationId, { status });
  const customerIds = customers.map((customer) => customer.id);
  const [sites, contacts] = await Promise.all([
    client.listSitesByCustomerIds(organizationId, customerIds),
    client.listContactsByCustomerIds(organizationId, customerIds),
  ]);

  const sitesByCustomer = new Map<string, CustomerSite[]>();
  const contactsByCustomer = new Map<string, CustomerContact[]>();

  sites.forEach((site) => {
    const bucket = sitesByCustomer.get(site.customer_id) ?? [];
    bucket.push(site);
    sitesByCustomer.set(site.customer_id, bucket);
  });

  contacts.forEach((contact) => {
    const bucket = contactsByCustomer.get(contact.customer_id) ?? [];
    bucket.push(contact);
    contactsByCustomer.set(contact.customer_id, bucket);
  });

  const mapped = customers.map((customer) => {
    const customerSites = sitesByCustomer.get(customer.id) ?? [];
    const customerContacts = contactsByCustomer.get(customer.id) ?? [];

    return {
      id: customer.id,
      legal_name: customer.legal_name,
      trade_name: customer.trade_name,
      tax_id: customer.tax_id,
      active: customer.active,
      site_count: customerSites.length,
      contact_count: customerContacts.length,
      cities: [...new Set(customerSites.map((site) => site.city))],
      updated_at: customer.updated_at,
    };
  });

  const normalizedSearch = normalizeSearchText(filters.search);
  return mapped.filter((item) => {
    if (status === 'active' && !item.active) {
      return false;
    }

    if (status === 'inactive' && item.active) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      item.legal_name,
      item.trade_name,
      item.tax_id ?? '',
      item.cities.join(' '),
    ]
      .map(normalizeSearchText)
      .join(' ');

    return haystack.includes(normalizedSearch);
  });
}

export async function getCustomer(
  client: ContractsLocacoesReadClient,
  customerId: string
): Promise<CustomerDetail> {
  const organizationId = await client.getCurrentOrganizationId();
  const customer = await client.getCustomerById(organizationId, customerId);
  const [sites, contacts] = await Promise.all([
    client.listSitesByCustomerIds(organizationId, [customerId]),
    client.listContactsByCustomerIds(organizationId, [customerId]),
  ]);

  return {
    customer,
    sites,
    contacts,
  };
}

export async function listRentalAssets(
  client: ContractsLocacoesReadClient,
  filters: RentalAssetListFilters = {}
): Promise<RentalAsset[]> {
  const organizationId = await client.getCurrentOrganizationId();
  const listRentalAssetsByOrganization = requireReadMethod(
    client.listRentalAssetsByOrganization?.bind(client),
    'listRentalAssetsByOrganization'
  );
  const assets = await listRentalAssetsByOrganization(organizationId, {
    status: filters.status && filters.status !== 'all' ? filters.status : undefined,
  });
  const normalizedSearch = normalizeSearchText(filters.search);

  return assets.filter((asset) => {
    if (filters.status && filters.status !== 'all' && asset.operational_status !== filters.status) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      asset.description,
      asset.equipment_type ?? '',
      asset.capacity ?? '',
      asset.serial_number ?? '',
      asset.internal_code ?? '',
    ].map(normalizeSearchText).join(' ');

    return haystack.includes(normalizedSearch);
  });
}

export async function getRentalAsset(
  client: ContractsLocacoesReadClient,
  assetId: string
): Promise<RentalAsset> {
  const organizationId = await client.getCurrentOrganizationId();
  const getRentalAssetById = requireReadMethod(
    client.getRentalAssetById?.bind(client),
    'getRentalAssetById'
  );

  return getRentalAssetById(organizationId, assetId);
}

export function listAvailableRentalAssets(
  client: ContractsLocacoesReadClient,
  interval: RentalAssetAvailabilityInterval
) {
  return deriveAvailableRentalAssets({
    getCurrentOrganizationId: client.getCurrentOrganizationId.bind(client),
    listRentalAssetsByOrganization: requireReadMethod(
      client.listRentalAssetsByOrganization?.bind(client),
      'listRentalAssetsByOrganization'
    ),
    listRentalItemsByAssetIds: requireReadMethod(
      client.listRentalItemsByAssetIds?.bind(client),
      'listRentalItemsByAssetIds'
    ),
    listContractsByIds: requireReadMethod(
      client.listContractsByIds?.bind(client),
      'listContractsByIds'
    ),
  }, interval);
}

export async function listContracts(
  client: ContractsLocacoesReadClient,
  filters: ContractListFilters = {}
): Promise<ContractListItem[]> {
  const organizationId = await client.getCurrentOrganizationId();
  const contracts = await client.listContractsByOrganization(organizationId, {
    kind: filters.kind,
    status: filters.status,
  });
  const customerIds = [...new Set(contracts.map((contract) => contract.customer_id))];
  const contractIds = contracts.map((contract) => contract.id);
  const [customers, sites, items] = await Promise.all([
    client.listCustomersByOrganization(organizationId),
    client.listSitesByCustomerIds(organizationId, customerIds),
    client.listRentalItemsByContractIds(organizationId, contractIds),
  ]);

  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const itemCountByContract = new Map<string, number>();

  items.forEach((item) => {
    itemCountByContract.set(item.contract_id, (itemCountByContract.get(item.contract_id) ?? 0) + 1);
  });

  const normalizedSearch = normalizeSearchText(filters.search);

  return contracts
    .map((contract) => ({
      id: contract.id,
      internal_number: contract.internal_number,
      kind: contract.kind,
      status: contract.status,
      customer_name: customersById.get(contract.customer_id)?.legal_name ?? 'Cliente removido',
      site_name: sitesById.get(contract.site_id)?.name ?? 'Local removido',
      legacy_order_number: contract.legacy_order_number,
      start_date: contract.start_date,
      recurrence_days: contract.recurrence_days,
      item_count: itemCountByContract.get(contract.id) ?? 0,
    }))
    .filter((contract) => {
      if (filters.kind && filters.kind !== 'all' && contract.kind !== filters.kind) {
        return false;
      }

      if (filters.status && filters.status !== 'all' && contract.status !== filters.status) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        contract.internal_number,
        contract.customer_name,
        contract.site_name,
        contract.legacy_order_number ?? '',
      ]
        .map(normalizeSearchText)
        .join(' ');

      return haystack.includes(normalizedSearch);
    });
}

export async function getContract(
  client: ContractsLocacoesReadClient,
  contractId: string
): Promise<ContractDetail> {
  const organizationId = await client.getCurrentOrganizationId();
  const contract = await client.getContractById(organizationId, contractId);
  const listBillingCyclesByContractId = client.listBillingCyclesByContractId;
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;
  const [customer, sites, items, billingCycles] = await Promise.all([
    client.getCustomerById(organizationId, contract.customer_id),
    client.listSitesByCustomerIds(organizationId, [contract.customer_id]),
    client.listRentalItemsByContractIds(organizationId, [contractId]),
    listBillingCyclesByContractId
      ? listBillingCyclesByContractId(organizationId, contractId)
      : Promise.resolve([]),
  ]);
  const billingIds = billingCycles.map((billing) => billing.id);
  const payments = listPaymentsByBillingCycleIds && billingIds.length > 0
    ? await listPaymentsByBillingCycleIds(organizationId, billingIds)
    : [];

  return {
    contract,
    customer,
    site: sites.find((site) => site.id === contract.site_id) ?? null,
    items,
    billingCycles,
    payments,
  };
}

export async function listBillings(
  client: ContractsLocacoesReadClient,
  today: string,
  filters: BillingListFilters = {}
): Promise<BillingListItem[]> {
  const organizationId = await client.getCurrentOrganizationId();
  const listBillingCyclesByOrganization = client.listBillingCyclesByOrganization;
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;

  if (!listBillingCyclesByOrganization || !listPaymentsByBillingCycleIds) {
    throw new Error('Cliente de leitura sem suporte para cobranças');
  }

  const billings = await listBillingCyclesByOrganization(organizationId);
  const contractIds = [...new Set(billings.map((billing) => billing.contract_id))];
  const billingIds = billings.map((billing) => billing.id);
  const [contracts, customers, payments] = await Promise.all([
    client.listContractsByOrganization(organizationId),
    client.listCustomersByOrganization(organizationId),
    listPaymentsByBillingCycleIds(organizationId, billingIds),
  ]);

  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const sites = await client.listSitesByCustomerIds(
    organizationId,
    [...new Set(contracts.map((contract) => contract.customer_id))]
  );
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const paymentsByBillingId = new Map<string, Payment[]>();

  payments.forEach((payment) => {
    const bucket = paymentsByBillingId.get(payment.billing_cycle_id) ?? [];
    bucket.push(payment);
    paymentsByBillingId.set(payment.billing_cycle_id, bucket);
  });

  const normalizedSearch = normalizeSearchText(filters.search);

  return billings
    .map((billing) => {
      const contract = contractsById.get(billing.contract_id);
      const customer = contract ? customersById.get(contract.customer_id) : null;
      const site = contract ? sitesById.get(contract.site_id) : null;
      const paidAmounts = (paymentsByBillingId.get(billing.id) ?? []).map((payment) => payment.amount);
      const balance = calculateBillingBalance(billing.total_amount, paidAmounts);
      const status = buildBillingStatus(billing.total_amount, paidAmounts, today, billing.due_date);
      const computedAlert = status === 'paid' ? 'ok' : alertLevel(today, billing.due_date);

      return {
        id: billing.id,
        contract_id: billing.contract_id,
        internal_number: contract?.internal_number ?? '-',
        customer_name: customer?.legal_name ?? 'Cliente removido',
        site_name: site?.name ?? 'Local removido',
        legacy_order_number: contract?.legacy_order_number ?? null,
        document_number: billing.document_number,
        document_type: billing.document_type,
        due_date: billing.due_date,
        issue_date: billing.issue_date,
        period_start: billing.period_start,
        period_end: billing.period_end,
        sent_at: billing.sent_at,
        total_amount: billing.total_amount,
        paid_amount: balance.paid_amount,
        balance_amount: balance.balance_amount,
        status,
        alert: computedAlert,
      } satisfies BillingListItem;
    })
    .filter((billing) => {
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'to_issue' && billing.status !== 'draft') {
          return false;
        }
        if (['issued', 'paid', 'exempt', 'cancelled', 'overdue'].includes(filters.status) && billing.status !== filters.status) {
          return false;
        }
        if (filters.status === 'due_soon' && billing.alert !== 'due_soon') {
          return false;
        }
        if (filters.status === 'due_today' && billing.alert !== 'due_today') {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        billing.internal_number,
        billing.customer_name,
        billing.site_name,
        billing.legacy_order_number ?? '',
        billing.document_number ?? '',
      ]
        .map(normalizeSearchText)
        .join(' ');

      return haystack.includes(normalizedSearch);
    });
}

export async function getDashboardSnapshot(
  client: ContractsLocacoesReadClient,
  today: string
): Promise<DashboardSnapshot> {
  const organizationId = await client.getCurrentOrganizationId();
  const listBillingCyclesByOrganization = client.listBillingCyclesByOrganization;
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;

  if (!listBillingCyclesByOrganization || !listPaymentsByBillingCycleIds) {
    throw new Error('Cliente de leitura sem suporte para painel');
  }

  const [contracts, billings] = await Promise.all([
    client.listContractsByOrganization(organizationId),
    listBillingCyclesByOrganization(organizationId),
  ]);
  const billingIds = billings.map((billing) => billing.id);
  const payments = await listPaymentsByBillingCycleIds(organizationId, billingIds);
  const customers = await client.listCustomersByOrganization(organizationId);
  const sites = await client.listSitesByCustomerIds(organizationId, [...new Set(contracts.map((contract) => contract.customer_id))]);
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const paymentsByBillingId = new Map<string, Payment[]>();

  payments.forEach((payment) => {
    const bucket = paymentsByBillingId.get(payment.billing_cycle_id) ?? [];
    bucket.push(payment);
    paymentsByBillingId.set(payment.billing_cycle_id, bucket);
  });

  const snapshotRows: BillingSnapshotInput[] = billings.map((billing) => {
    const contract = contractsById.get(billing.contract_id);
    const customer = contract ? customersById.get(contract.customer_id) : null;
    const site = contract ? sitesById.get(contract.site_id) : null;

    return {
      id: billing.id,
      contract_id: billing.contract_id,
      internal_number: contract?.internal_number ?? '-',
      customer_name: customer?.legal_name ?? 'Cliente removido',
      site_name: site?.name ?? 'Local removido',
      legacy_order_number: contract?.legacy_order_number ?? null,
      document_number: billing.document_number,
      document_type: billing.document_type,
      total_amount: billing.total_amount,
      due_date: billing.due_date,
      issue_date: billing.issue_date,
      notes: billing.notes,
      status: billing.status,
      payments: (paymentsByBillingId.get(billing.id) ?? []).map((payment) => payment.amount),
    };
  });

  return createBillingSnapshot(today, snapshotRows, {
    active_contracts: contracts.filter((contract) => contract.status === 'active').length,
    paused_contracts: contracts.filter((contract) => contract.status === 'paused').length,
  });
}

export async function getBillingReceipt(
  client: ContractsLocacoesReadClient,
  billingId: string
): Promise<ReceiptSnapshot> {
  const organizationId = await client.getCurrentOrganizationId();
  const getBillingCycleById = client.getBillingCycleById;
  const listBillingLinesByBillingCycleIds = client.listBillingLinesByBillingCycleIds;
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;

  if (!getBillingCycleById || !listBillingLinesByBillingCycleIds || !listPaymentsByBillingCycleIds) {
    throw new Error('Cliente de leitura sem suporte para recibos');
  }

  const billing = await getBillingCycleById(organizationId, billingId);
  const contract = await client.getContractById(organizationId, billing.contract_id);
  const [customers, sites, rentalItems, billingLines, payments] = await Promise.all([
    client.listCustomersByOrganization(organizationId),
    client.listSitesByCustomerIds(organizationId, [contract.customer_id]),
    client.listRentalItemsByContractIds(organizationId, [billing.contract_id]),
    listBillingLinesByBillingCycleIds(organizationId, [billingId]),
    listPaymentsByBillingCycleIds(organizationId, [billingId]),
  ]);

  const customer = customers.find((entry) => entry.id === contract.customer_id);

  if (!customer) {
    throw new Error('Cliente da cobrança não encontrado');
  }

  const site = sites.find((entry) => entry.id === contract.site_id) ?? null;

  return buildReceiptSnapshot({
    billing,
    contract,
    customer,
    site,
    rentalItems,
    billingLines,
    payments,
  });
}
