import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingCycle, BillingDeliveryEvent, Contract, ContractDocument, Customer, CustomerContact, CustomerSite, OrganizationMember, Payment, RentalAsset, RentalItem } from './types';
import { createBillingSnapshot, type BillingSnapshotInput, type DashboardSnapshot } from './dashboard';
import { buildBillingStatus, calculateBillingBalance } from './dashboard';
import { alertLevel, isDateInBillingMonth } from './dates';
import { resolveEffectiveBillingStatus, sortBillingsByOperationalPriority } from './billing-status-presentation';
import {
  resolveRentalBillingCoverage,
  selectLatestBillingCoveragePeriod,
  sortContractsByBillingPriority,
  suggestBillingAmountFromItems,
  type RentalBillingCoverageStatus,
} from './billing-periods';
import { buildRentalInvoiceSnapshot, type RentalInvoiceSnapshot } from './rental-invoice';
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
  customerId?: string;
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
  current_monthly_amount: string | null;
  latest_billing_period_end: string | null;
  latest_billing_due_date: string | null;
  billing_coverage_status: RentalBillingCoverageStatus | null;
  notes: string | null;
}

export interface ContractDetail {
  contract: Contract;
  customer: Customer | null;
  site: CustomerSite | null;
  items: RentalItem[];
  billingCycles: BillingCycle[];
  payments: Payment[];
  membership: OrganizationMember;
  boletoDocuments: ContractDocument[];
  billingDeliveryEvents: BillingDeliveryEvent[];
}

export interface BillingDeliveryIndicators {
  sent_at: string | null;
  needs_resend: boolean;
  has_boleto: boolean;
}

export type BillingMonthlyBaseRow = Pick<
  BillingCycle,
  'id' | 'contract_id' | 'document_number' | 'document_type' | 'due_date' |
  'issue_date' | 'period_start' | 'period_end' | 'total_amount' | 'status'
>;

export interface BillingListFilters {
  month?: string;
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
  delivery_indicators: BillingDeliveryIndicators | null;
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
  getCurrentOrganizationMembership(organizationId: string): Promise<OrganizationMember>;
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
  listBillingCyclesForMonthlyList(organizationId: string): Promise<BillingMonthlyBaseRow[]>;
  listBillingDeliveryIndicatorsByOrganization(
    organizationId: string,
    billingIds: string[]
  ): Promise<Array<Pick<BillingCycle, 'id' | 'sent_at' | 'needs_resend'>>>;
  listBoletoDocumentsByContractIds(organizationId: string, contractIds: string[]): Promise<ContractDocument[]>;
  listBillingCyclesByContractId?(organizationId: string, contractId: string): Promise<BillingCycle[]>;
  listBillingDetailIndicatorsByContractId?(
    organizationId: string,
    contractId: string
  ): Promise<Array<Pick<
    BillingCycle,
    | 'id'
    | 'sent_at'
    | 'needs_resend'
    | 'content_revision'
    | 'boleto_change_pending'
    | 'boleto_change_operation_id'
    | 'boleto_change_started_at'
  >>>;
  listBillingDeliveryEvents?(
    organizationId: string,
    billingCycleIds: string[]
  ): Promise<BillingDeliveryEvent[]>;
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

export function canManageBilling(member: OrganizationMember) {
  return member.role === 'admin' || member.can_manage_billing;
}

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

    async getCurrentOrganizationMembership(organizationId) {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) {
        throw new Error(`Não foi possível identificar o usuário atual${authError ? `: ${authError.message}` : ''}`);
      }

      const { data, error } = await client
        .from('organization_members')
        .select('organization_id, user_id, role, can_manage_billing, created_at')
        .eq('organization_id', organizationId)
        .eq('user_id', authData.user.id)
        .single();

      return ensureData(data as OrganizationMember | null, error, 'Não foi possível carregar a permissão financeira');
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

    async listBillingCyclesForMonthlyList(organizationId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('id, contract_id, document_number, document_type, due_date, issue_date, period_start, period_end, total_amount, status')
        .eq('organization_id', organizationId)
        .order('due_date', { ascending: true });

      return ensureData((data ?? []) as BillingMonthlyBaseRow[] | null, error, 'Não foi possível listar cobranças');
    },

    async listBillingDeliveryIndicatorsByOrganization(organizationId, billingIds) {
      if (billingIds.length === 0) return [];
      const { data, error } = await client
        .from('billing_cycles')
        .select('id, sent_at, needs_resend')
        .eq('organization_id', organizationId)
        .in('id', billingIds);

      return ensureData(
        (data ?? []) as Array<Pick<BillingCycle, 'id' | 'sent_at' | 'needs_resend'>> | null,
        error,
        'Não foi possível carregar indicadores de envio'
      );
    },

    async listBoletoDocumentsByContractIds(organizationId, contractIds) {
      if (contractIds.length === 0) return [];
      const { data, error } = await client
        .from('contract_documents')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('kind', 'boleto')
        .in('contract_id', contractIds);

      return ensureData((data ?? []) as ContractDocument[] | null, error, 'Não foi possível carregar boletos');
    },

    async listBillingCyclesByContractId(organizationId, contractId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('id, organization_id, contract_id, sequence_number, period_start, period_end, issue_date, due_date, base_amount, discount_amount, surcharge_amount, exemption_amount, total_amount, document_type, document_number, status, notes, created_at, updated_at')
        .eq('organization_id', organizationId)
        .eq('contract_id', contractId)
        .order('due_date', { ascending: true });

      return ensureData((data ?? []) as BillingCycle[] | null, error, 'Não foi possível listar cobranças do contrato');
    },

    async listBillingDetailIndicatorsByContractId(organizationId, contractId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('id, sent_at, needs_resend, content_revision, boleto_change_pending, boleto_change_operation_id, boleto_change_started_at')
        .eq('organization_id', organizationId)
        .eq('contract_id', contractId);

      return ensureData(
        (data ?? []) as Array<Pick<
          BillingCycle,
          | 'id'
          | 'sent_at'
          | 'needs_resend'
          | 'content_revision'
          | 'boleto_change_pending'
          | 'boleto_change_operation_id'
          | 'boleto_change_started_at'
        >> | null,
        error,
        'Não foi possível carregar o estado financeiro das cobranças'
      );
    },

    async listBillingDeliveryEvents(organizationId, billingCycleIds) {
      if (billingCycleIds.length === 0) return [];
      const { data, error } = await client
        .from('billing_delivery_events')
        .select('*')
        .eq('organization_id', organizationId)
        .in('billing_cycle_id', billingCycleIds)
        .order('sent_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      return ensureData(
        (data ?? []) as BillingDeliveryEvent[] | null,
        error,
        'Não foi possível carregar o histórico de envios'
      );
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
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

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
  filters: ContractListFilters,
  today: string
): Promise<ContractListItem[]> {
  const organizationId = await client.getCurrentOrganizationId();
  const contracts = await client.listContractsByOrganization(organizationId, {
    kind: filters.kind,
    status: filters.status,
  });
  const customerIds = [...new Set(contracts.map((contract) => contract.customer_id))];
  const contractIds = contracts.map((contract) => contract.id);
  const listBillingCyclesByOrganization = requireReadMethod(
    client.listBillingCyclesByOrganization?.bind(client),
    'listBillingCyclesByOrganization'
  );
  const [customers, sites, items, billingCycles] = await Promise.all([
    client.listCustomersByOrganization(organizationId),
    client.listSitesByCustomerIds(organizationId, customerIds),
    client.listRentalItemsByContractIds(organizationId, contractIds),
    listBillingCyclesByOrganization(organizationId),
  ]);

  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const itemCountByContract = new Map<string, number>();
  const itemsByContract = new Map<string, RentalItem[]>();
  const billingCyclesByContract = new Map<string, BillingCycle[]>();

  items.forEach((item) => {
    itemCountByContract.set(item.contract_id, (itemCountByContract.get(item.contract_id) ?? 0) + 1);
    const contractItems = itemsByContract.get(item.contract_id) ?? [];
    contractItems.push(item);
    itemsByContract.set(item.contract_id, contractItems);
  });

  billingCycles.forEach((billing) => {
    const contractBillings = billingCyclesByContract.get(billing.contract_id) ?? [];
    contractBillings.push(billing);
    billingCyclesByContract.set(billing.contract_id, contractBillings);
  });

  const normalizedSearch = normalizeSearchText(filters.search);

  const filteredContracts = contracts
    .filter((contract) => !filters.customerId || contract.customer_id === filters.customerId)
    .map((contract) => {
      const isRental = contract.kind === 'rental';
      const contractItems = itemsByContract.get(contract.id) ?? [];
      const latestBilling = isRental
        ? selectLatestBillingCoveragePeriod(billingCyclesByContract.get(contract.id) ?? [])
        : null;

      return {
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
        current_monthly_amount: isRental ? suggestBillingAmountFromItems(contractItems) : null,
        latest_billing_period_end: latestBilling?.period_end ?? null,
        latest_billing_due_date: latestBilling?.due_date ?? null,
        billing_coverage_status: isRental
          ? resolveRentalBillingCoverage({
              contractStatus: contract.status,
              today,
              latestPeriodEnd: latestBilling?.period_end ?? null,
            })
          : null,
        notes: contract.notes,
      };
    })
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

  return sortContractsByBillingPriority(filteredContracts);
}

export async function getContract(
  client: ContractsLocacoesReadClient,
  contractId: string
): Promise<ContractDetail> {
  const organizationId = await client.getCurrentOrganizationId();
  const [contract, membership] = await Promise.all([
    client.getContractById(organizationId, contractId),
    client.getCurrentOrganizationMembership(organizationId),
  ]);
  const listBillingCyclesByContractId = client.listBillingCyclesByContractId;
  const listBillingDetailIndicatorsByContractId = client.listBillingDetailIndicatorsByContractId;
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;
  const authorized = canManageBilling(membership);
  const [customer, sites, items, baseBillingCycles, boletoDocuments, billingIndicators] = await Promise.all([
    client.getCustomerById(organizationId, contract.customer_id),
    client.listSitesByCustomerIds(organizationId, [contract.customer_id]),
    client.listRentalItemsByContractIds(organizationId, [contractId]),
    listBillingCyclesByContractId
      ? listBillingCyclesByContractId(organizationId, contractId)
      : Promise.resolve([]),
    authorized
      ? client.listBoletoDocumentsByContractIds(organizationId, [contractId])
      : Promise.resolve([]),
    authorized && listBillingDetailIndicatorsByContractId
      ? listBillingDetailIndicatorsByContractId(organizationId, contractId)
      : Promise.resolve([]),
  ]);
  const indicatorsByBillingId = new Map(billingIndicators.map((indicator) => [indicator.id, indicator]));
  const billingCycles = baseBillingCycles.map((billing) => {
    if (authorized) {
      return { ...billing, ...indicatorsByBillingId.get(billing.id) };
    }

    const visible = { ...billing } as Partial<BillingCycle>;
    delete visible.sent_at;
    delete visible.needs_resend;
    delete visible.content_revision;
    delete visible.boleto_change_pending;
    delete visible.boleto_change_operation_id;
    delete visible.boleto_change_started_at;
    return visible as BillingCycle;
  });
  const billingIds = billingCycles.map((billing) => billing.id);
  const [payments, billingDeliveryEvents] = await Promise.all([
    listPaymentsByBillingCycleIds && billingIds.length > 0
      ? listPaymentsByBillingCycleIds(organizationId, billingIds)
      : Promise.resolve([]),
    authorized && client.listBillingDeliveryEvents && billingIds.length > 0
      ? client.listBillingDeliveryEvents(organizationId, billingIds)
      : Promise.resolve([]),
  ]);

  return {
    contract,
    customer,
    site: sites.find((site) => site.id === contract.site_id) ?? null,
    items,
    billingCycles,
    payments,
    membership,
    boletoDocuments,
    billingDeliveryEvents,
  };
}

export async function listBillings(
  client: ContractsLocacoesReadClient,
  today: string,
  filters: BillingListFilters = {}
): Promise<BillingListItem[]> {
  const organizationId = await client.getCurrentOrganizationId();
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;

  if (!listPaymentsByBillingCycleIds) {
    throw new Error('Cliente de leitura sem suporte para cobranças');
  }

  const membership = await client.getCurrentOrganizationMembership(organizationId);
  const allBillings = await client.listBillingCyclesForMonthlyList(organizationId);
  const billings = filters.month
    ? allBillings.filter((billing) => isDateInBillingMonth(billing.due_date, filters.month!))
    : allBillings;
  const contractIds = [...new Set(billings.map((billing) => billing.contract_id))];
  const billingIds = billings.map((billing) => billing.id);
  const authorized = canManageBilling(membership);
  const [contracts, customers, payments, indicatorRows, boletoDocuments] = await Promise.all([
    client.listContractsByOrganization(organizationId),
    client.listCustomersByOrganization(organizationId),
    listPaymentsByBillingCycleIds(organizationId, billingIds),
    authorized
      ? client.listBillingDeliveryIndicatorsByOrganization(organizationId, billingIds)
      : Promise.resolve([]),
    authorized
      ? client.listBoletoDocumentsByContractIds(organizationId, contractIds)
      : Promise.resolve([]),
  ]);

  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const sites = await client.listSitesByCustomerIds(
    organizationId,
    [...new Set(contracts.map((contract) => contract.customer_id))]
  );
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const paymentsByBillingId = new Map<string, Payment[]>();
  const indicatorsByBillingId = new Map(indicatorRows.map((row) => [row.id, row]));
  const boletoBillingIds = new Set(
    boletoDocuments.map((document) => document.billing_cycle_id).filter((id): id is string => id !== null)
  );

  payments.forEach((payment) => {
    const bucket = paymentsByBillingId.get(payment.billing_cycle_id) ?? [];
    bucket.push(payment);
    paymentsByBillingId.set(payment.billing_cycle_id, bucket);
  });

  const normalizedSearch = normalizeSearchText(filters.search);

  const filteredBillings = billings
    .map((billing) => {
      const contract = contractsById.get(billing.contract_id);
      const customer = contract ? customersById.get(contract.customer_id) : null;
      const site = contract ? sitesById.get(contract.site_id) : null;
      const paidAmounts = (paymentsByBillingId.get(billing.id) ?? []).map((payment) => payment.amount);
      const balance = calculateBillingBalance(billing.total_amount, paidAmounts);
      const status = resolveEffectiveBillingStatus(
        billing.status,
        buildBillingStatus(billing.total_amount, paidAmounts, today, billing.due_date)
      );
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
        delivery_indicators: authorized
          ? {
              sent_at: indicatorsByBillingId.get(billing.id)?.sent_at ?? null,
              needs_resend: indicatorsByBillingId.get(billing.id)?.needs_resend ?? false,
              has_boleto: boletoBillingIds.has(billing.id),
            }
          : null,
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

  return sortBillingsByOperationalPriority(filteredBillings, today);
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

export async function getBillingRentalInvoice(
  client: ContractsLocacoesReadClient,
  billingId: string
): Promise<RentalInvoiceSnapshot> {
  const organizationId = await client.getCurrentOrganizationId();
  const getBillingCycleById = client.getBillingCycleById;
  const listBillingLinesByBillingCycleIds = client.listBillingLinesByBillingCycleIds;
  const listPaymentsByBillingCycleIds = client.listPaymentsByBillingCycleIds;

  if (!getBillingCycleById || !listBillingLinesByBillingCycleIds || !listPaymentsByBillingCycleIds) {
    throw new Error('Cliente de leitura sem suporte para faturas');
  }

  const billing = await getBillingCycleById(organizationId, billingId);
  const contract = await client.getContractById(organizationId, billing.contract_id);
  const [customers, sites, billingLines, payments] = await Promise.all([
    client.listCustomersByOrganization(organizationId),
    client.listSitesByCustomerIds(organizationId, [contract.customer_id]),
    listBillingLinesByBillingCycleIds(organizationId, [billingId]),
    listPaymentsByBillingCycleIds(organizationId, [billingId]),
  ]);

  const customer = customers.find((entry) => entry.id === contract.customer_id);

  if (!customer) {
    throw new Error('Cliente da cobrança não encontrado');
  }

  const site = sites.find((entry) => entry.id === contract.site_id) ?? null;

  return buildRentalInvoiceSnapshot({
    billing,
    contract,
    customer,
    site,
    billingLines,
    payments,
  });
}

export const getBillingReceipt = getBillingRentalInvoice;
