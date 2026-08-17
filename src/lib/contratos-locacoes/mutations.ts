import type { SupabaseClient } from '@supabase/supabase-js';
import {
  billingDraftSchema,
  contractDraftSchema,
  customerDraftSchema,
  pauseContractSchema,
  paymentDraftSchema,
  rentalAssetDraftSchema,
  reactivateContractSchema,
  type BillingDraftInput,
  type BillingLineDraftInput,
  type ContractDraftInput,
  type CustomerDraftInput,
  type CustomerContactInput,
  type PaymentDraftInput,
  type PauseContractInput,
  type ReactivateContractInput,
  type RentalItemDraftInput,
  type CustomerSiteInput,
  type RentalAssetDraftInput,
} from './schemas';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerContact, CustomerSite, Payment, RentalAsset, RentalItem } from './types';
import { calculateBilling } from './money';
import { buildBillingStatus, calculateBillingBalance } from './dashboard';
import { receiptNumberFromInternalNumber } from './numbering';
import { getContractCompanyLabel } from './company';
import { assertNoBillingPeriodConflict } from './billing-periods';
import {
  assertCanCloseContract,
  assertValidReturnDate,
  hasPendingPhysicalReturns,
} from './rental-closure';

export interface CustomerMutationResult {
  customer: Customer;
  sites: CustomerSite[];
  contacts: CustomerContact[];
}

export interface ContractMutationResult {
  contract: Contract;
  items: RentalItem[];
}

export interface BillingMutationResult {
  billing: BillingCycle;
  lines: BillingLine[];
}

export interface BillingCycleEditInput {
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  amount: string;
  notes: string | null;
}

export interface PaymentMutationResult {
  billing: BillingCycle;
  payment: Payment;
  payments: Payment[];
  balance: ReturnType<typeof calculateBillingBalance>;
}

export interface RentalAssetMutationResult {
  asset: RentalAsset;
}

export interface ContractsLocacoesMutationClient {
  getCurrentOrganizationId(): Promise<string>;
  insertCustomer(record: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<Customer>;
  updateCustomer(customerId: string, patch: Partial<Customer>): Promise<Customer>;
  upsertCustomerSites(records: CustomerSite[]): Promise<CustomerSite[]>;
  upsertCustomerContacts(records: CustomerContact[]): Promise<CustomerContact[]>;
  deleteMissingCustomerSites(customerId: string, keepIds: string[]): Promise<void>;
  deleteMissingCustomerContacts(customerId: string, keepIds: string[]): Promise<void>;
  insertContract(record: Omit<Contract, 'id' | 'created_at' | 'updated_at'>): Promise<Contract>;
  getContractById?(organizationId: string, contractId: string): Promise<Contract>;
  updateContract(contractId: string, patch: Partial<Contract>): Promise<Contract>;
  upsertRentalItems(records: RentalItem[]): Promise<RentalItem[]>;
  deleteMissingRentalItems(contractId: string, keepIds: string[]): Promise<void>;
  listRentalItemsByContractId?(organizationId: string, contractId: string): Promise<RentalItem[]>;
  getRentalItemById?(organizationId: string, itemId: string): Promise<RentalItem>;
  updateRentalItem?(itemId: string, patch: Partial<RentalItem>): Promise<RentalItem>;
  insertBillingCycle?(record: Omit<BillingCycle, 'id' | 'created_at' | 'updated_at'>): Promise<BillingCycle>;
  getBillingCycleById?(organizationId: string, billingCycleId: string): Promise<BillingCycle>;
  listBillingCyclesByContractId?(organizationId: string, contractId: string): Promise<BillingCycle[]>;
  updateBillingCycle?(billingCycleId: string, patch: Partial<BillingCycle>): Promise<BillingCycle>;
  upsertBillingLines?(records: BillingLine[]): Promise<BillingLine[]>;
  deleteMissingBillingLines?(billingCycleId: string, keepIds: string[]): Promise<void>;
  insertPayment?(record: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment>;
  listPaymentsByBillingCycleId?(organizationId: string, billingCycleId: string): Promise<Payment[]>;
  insertRentalAsset?(record: Omit<RentalAsset, 'id' | 'created_at' | 'updated_at'>): Promise<RentalAsset>;
  updateRentalAsset?(assetId: string, patch: Partial<RentalAsset>): Promise<RentalAsset>;
}

const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ensureData<T>(data: T | null, error: { message: string } | null, message: string) {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }

  if (data == null) {
    throw new Error(message);
  }

  return data;
}

function isUuidLike(value: string) {
  return UUID_LIKE_REGEX.test(value);
}

function generateUuid() {
  const uuid = globalThis.crypto?.randomUUID?.();

  if (!uuid) {
    throw new Error('Não foi possível gerar identificadores locais válidos para salvar os dados informados.');
  }

  return uuid;
}

function resolvePersistedId(id: string, idMap: Map<string, string>) {
  if (isUuidLike(id)) {
    idMap.set(id, id);
    return id;
  }

  const existingId = idMap.get(id);
  if (existingId) {
    return existingId;
  }

  const generatedId = generateUuid();
  idMap.set(id, generatedId);
  return generatedId;
}

export function createSupabaseContractsLocacoesMutationClient(
  client: SupabaseClient
): ContractsLocacoesMutationClient {
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

    async insertCustomer(record) {
      const { data, error } = await client
        .from('customers')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as Customer | null, error, 'Não foi possível criar o cliente');
    },

    async updateCustomer(customerId, patch) {
      const { data, error } = await client
        .from('customers')
        .update(patch)
        .eq('id', customerId)
        .eq('organization_id', patch.organization_id ?? '')
        .select('*')
        .single();

      return ensureData(data as Customer | null, error, 'Não foi possível atualizar o cliente');
    },

    async upsertCustomerSites(records) {
      if (records.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('customer_sites')
        .upsert(records, { onConflict: 'id' })
        .select('*');

      return ensureData(
        (data ?? []) as CustomerSite[] | null,
        error,
        'Não foi possível salvar as obras/locais'
      );
    },

    async upsertCustomerContacts(records) {
      if (records.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('customer_contacts')
        .upsert(records, { onConflict: 'id' })
        .select('*');

      return ensureData(
        (data ?? []) as CustomerContact[] | null,
        error,
        'Não foi possível salvar os contatos'
      );
    },

    async deleteMissingCustomerSites(customerId, keepIds) {
      const query = client
        .from('customer_sites')
        .delete()
        .eq('customer_id', customerId);

      const filteredQuery =
        keepIds.length > 0
          ? query.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
          : query;

      const { error } = await filteredQuery;

      if (error) {
        throw new Error(`Não foi possível remover obras/locais excluídos: ${error.message}`);
      }
    },

    async deleteMissingCustomerContacts(customerId, keepIds) {
      const query = client
        .from('customer_contacts')
        .delete()
        .eq('customer_id', customerId);

      const filteredQuery =
        keepIds.length > 0
          ? query.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
          : query;

      const { error } = await filteredQuery;

      if (error) {
        throw new Error(`Não foi possível remover contatos excluídos: ${error.message}`);
      }
    },

    async insertContract(record) {
      const { data, error } = await client
        .from('contracts')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as Contract | null, error, 'Não foi possível criar o contrato');
    },

    async updateContract(contractId, patch) {
      const { data, error } = await client
        .from('contracts')
        .update(patch)
        .eq('id', contractId)
        .eq('organization_id', patch.organization_id ?? '')
        .select('*')
        .single();

      return ensureData(data as Contract | null, error, 'Não foi possível atualizar o contrato');
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

    async upsertRentalItems(records) {
      if (records.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('rental_items')
        .upsert(records, { onConflict: 'id' })
        .select('*');

      return ensureData((data ?? []) as RentalItem[] | null, error, 'Não foi possível salvar os itens da locação');
    },

    async deleteMissingRentalItems(contractId, keepIds) {
      const query = client
        .from('rental_items')
        .delete()
        .eq('contract_id', contractId);

      const filteredQuery =
        keepIds.length > 0
          ? query.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
          : query;

      const { error } = await filteredQuery;

      if (error) {
        throw new Error(`Não foi possível remover itens excluídos: ${error.message}`);
      }
    },

    async listRentalItemsByContractId(organizationId, contractId) {
      const { data, error } = await client
        .from('rental_items')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contract_id', contractId)
        .order('created_at', { ascending: true });

      return ensureData((data ?? []) as RentalItem[] | null, error, 'Não foi possível listar itens da locação');
    },

    async getRentalItemById(organizationId, itemId) {
      const { data, error } = await client
        .from('rental_items')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', itemId)
        .single();

      return ensureData(data as RentalItem | null, error, 'Não foi possível carregar o item da locação');
    },

    async updateRentalItem(itemId, patch) {
      const { data, error } = await client
        .from('rental_items')
        .update(patch)
        .eq('id', itemId)
        .eq('organization_id', patch.organization_id ?? '')
        .select('*')
        .single();

      return ensureData(data as RentalItem | null, error, 'Não foi possível atualizar o item da locação');
    },

    async insertBillingCycle(record) {
      const { data, error } = await client
        .from('billing_cycles')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as BillingCycle | null, error, 'Não foi possível criar a cobrança');
    },

    async updateBillingCycle(billingCycleId, patch) {
      const { data, error } = await client
        .from('billing_cycles')
        .update(patch)
        .eq('id', billingCycleId)
        .eq('organization_id', patch.organization_id ?? '')
        .select('*')
        .single();

      return ensureData(data as BillingCycle | null, error, 'Não foi possível atualizar a cobrança');
    },

    async getBillingCycleById(organizationId, billingCycleId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', billingCycleId)
        .single();

      return ensureData(data as BillingCycle | null, error, 'Não foi possível carregar a cobrança');
    },

    async listBillingCyclesByContractId(organizationId, contractId) {
      const { data, error } = await client
        .from('billing_cycles')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contract_id', contractId)
        .order('period_start', { ascending: true });

      return ensureData((data ?? []) as BillingCycle[] | null, error, 'Não foi possível listar cobranças da locação');
    },

    async upsertBillingLines(records) {
      if (records.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from('billing_lines')
        .upsert(records, { onConflict: 'id' })
        .select('*');

      return ensureData((data ?? []) as BillingLine[] | null, error, 'Não foi possível salvar as linhas da cobrança');
    },

    async deleteMissingBillingLines(billingCycleId, keepIds) {
      const query = client
        .from('billing_lines')
        .delete()
        .eq('billing_cycle_id', billingCycleId);

      const filteredQuery =
        keepIds.length > 0
          ? query.not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`)
          : query;

      const { error } = await filteredQuery;

      if (error) {
        throw new Error(`Não foi possível remover linhas excluídas: ${error.message}`);
      }
    },

    async insertPayment(record) {
      const { data, error } = await client
        .from('payments')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as Payment | null, error, 'Não foi possível registrar o pagamento');
    },

    async listPaymentsByBillingCycleId(organizationId, billingCycleId) {
      const { data, error } = await client
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('billing_cycle_id', billingCycleId)
        .order('paid_at', { ascending: true });

      return ensureData((data ?? []) as Payment[] | null, error, 'Não foi possível listar pagamentos');
    },

    async insertRentalAsset(record) {
      const { data, error } = await client
        .from('rental_assets')
        .insert(record)
        .select('*')
        .single();

      return ensureData(data as RentalAsset | null, error, 'Não foi possível criar o ativo');
    },

    async updateRentalAsset(assetId, patch) {
      const { data, error } = await client
        .from('rental_assets')
        .update(patch)
        .eq('id', assetId)
        .eq('organization_id', patch.organization_id ?? '')
        .select('*')
        .single();

      return ensureData(data as RentalAsset | null, error, 'Não foi possível atualizar o ativo');
    },
  };
}

function requireBillingMethod<T>(
  method: T | undefined,
  name: string
): T {
  if (!method) {
    throw new Error(`Cliente de mutação sem suporte para ${name}`);
  }

  return method;
}

function buildCustomerRecord(
  organizationId: string,
  payload: CustomerDraftInput
): Omit<Customer, 'id' | 'created_at' | 'updated_at'> {
  return {
    organization_id: organizationId,
    legal_name: payload.legal_name,
    trade_name: payload.trade_name,
    tax_id: payload.tax_id,
    state_registration: payload.state_registration,
    municipal_registration: payload.municipal_registration,
    notes: payload.notes,
    active: payload.active,
  };
}

function resolveCustomerRelationIds(payload: CustomerDraftInput) {
  const siteIdMap = new Map<string, string>();
  const contactIdMap = new Map<string, string>();

  const sites = payload.sites.map((site) => ({
    ...site,
    id: resolvePersistedId(site.id, siteIdMap),
  }));

  const contacts = payload.contacts.map((contact) => ({
    ...contact,
    id: resolvePersistedId(contact.id, contactIdMap),
    site_id: contact.site_id ? (siteIdMap.get(contact.site_id) ?? contact.site_id) : null,
  }));

  return { sites, contacts };
}

function buildSiteRecords(
  organizationId: string,
  customerId: string,
  sites: CustomerSiteInput[]
): CustomerSite[] {
  const now = new Date().toISOString();

  return sites.map((site) => ({
    id: site.id,
    organization_id: organizationId,
    customer_id: customerId,
    name: site.name,
    address_line: site.address_line,
    number: site.number,
    complement: site.complement,
    district: site.district,
    city: site.city,
    state: site.state,
    postal_code: site.postal_code,
    notes: site.notes,
    active: site.active,
    created_at: now,
    updated_at: now,
  }));
}

function buildContactRecords(
  organizationId: string,
  customerId: string,
  contacts: CustomerContactInput[]
): CustomerContact[] {
  const now = new Date().toISOString();

  return contacts.map((contact) => ({
    id: contact.id,
    organization_id: organizationId,
    customer_id: customerId,
    site_id: contact.site_id,
    name: contact.name,
    job_title: contact.job_title,
    department: contact.department,
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    email: contact.email,
    is_primary: contact.is_primary,
    receives_billing: contact.receives_billing,
    receives_technical: contact.receives_technical,
    notes: contact.notes,
    created_at: now,
    updated_at: now,
  }));
}

async function persistRelations(
  client: ContractsLocacoesMutationClient,
  organizationId: string,
  customerId: string,
  payload: CustomerDraftInput
) {
  const resolvedRelations = resolveCustomerRelationIds(payload);
  const siteRecords = buildSiteRecords(organizationId, customerId, resolvedRelations.sites);
  const contactRecords = buildContactRecords(organizationId, customerId, resolvedRelations.contacts);

  const sites = await client.upsertCustomerSites(siteRecords);
  const contacts = await client.upsertCustomerContacts(contactRecords);

  await client.deleteMissingCustomerSites(customerId, siteRecords.map((site) => site.id));
  await client.deleteMissingCustomerContacts(customerId, contactRecords.map((contact) => contact.id));

  return { sites, contacts };
}

async function cleanupFailedCustomerCreate(
  client: ContractsLocacoesMutationClient,
  customerId: string
) {
  const cleanupErrors: string[] = [];

  try {
    await client.deleteMissingCustomerContacts(customerId, []);
  } catch (error) {
    cleanupErrors.push(
      error instanceof Error ? error.message : 'Não foi possível limpar contatos temporários.'
    );
  }

  try {
    await client.deleteMissingCustomerSites(customerId, []);
  } catch (error) {
    cleanupErrors.push(
      error instanceof Error ? error.message : 'Não foi possível limpar obras/locais temporários.'
    );
  }

  return cleanupErrors;
}

export async function createCustomer(
  client: ContractsLocacoesMutationClient,
  rawPayload: CustomerDraftInput
): Promise<CustomerMutationResult> {
  const payload = customerDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const customer = await client.insertCustomer(buildCustomerRecord(organizationId, payload));

  try {
    const relations = await persistRelations(client, organizationId, customer.id, payload);

    return {
      customer,
      ...relations,
    };
  } catch (error) {
    const cleanupErrors = await cleanupFailedCustomerCreate(client, customer.id);
    const detail = error instanceof Error ? error.message : 'Erro desconhecido ao salvar relações do cliente.';
    const cleanupDetail = cleanupErrors.length > 0
      ? ` Limpeza compensatória incompleta: ${cleanupErrors.join(' | ')}.`
      : '';

    throw new Error(
      `Não foi possível concluir o cadastro completo do cliente. ` +
      `As obras/locais e contatos desta tentativa foram revertidos quando possível, ` +
      `mas o cliente base pode precisar de revisão manual. ` +
      `Detalhe: ${detail}.${cleanupDetail}`
    );
  }

}

export async function updateCustomer(
  client: ContractsLocacoesMutationClient,
  customerId: string,
  rawPayload: CustomerDraftInput
): Promise<CustomerMutationResult> {
  const payload = customerDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const customer = await client.updateCustomer(customerId, {
    ...buildCustomerRecord(organizationId, payload),
    organization_id: organizationId,
  });
  const relations = await persistRelations(client, organizationId, customerId, payload);

  return {
    customer,
    ...relations,
  };
}

function buildRentalAssetRecord(
  organizationId: string,
  payload: RentalAssetDraftInput
): Omit<RentalAsset, 'id' | 'created_at' | 'updated_at'> {
  return {
    organization_id: organizationId,
    description: payload.description,
    equipment_type: payload.equipment_type,
    capacity: payload.capacity,
    serial_number: payload.serial_number,
    internal_code: payload.internal_code,
    operational_status: payload.operational_status,
    notes: payload.notes,
  };
}

export async function createRentalAsset(
  client: ContractsLocacoesMutationClient,
  rawPayload: RentalAssetDraftInput
): Promise<RentalAssetMutationResult> {
  const payload = rentalAssetDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const insertRentalAsset = requireBillingMethod(client.insertRentalAsset?.bind(client), 'insertRentalAsset');

  return {
    asset: await insertRentalAsset(buildRentalAssetRecord(organizationId, payload)),
  };
}

export async function updateRentalAsset(
  client: ContractsLocacoesMutationClient,
  assetId: string,
  rawPayload: RentalAssetDraftInput
): Promise<RentalAssetMutationResult> {
  const payload = rentalAssetDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const updateRentalAssetRecord = requireBillingMethod(client.updateRentalAsset?.bind(client), 'updateRentalAsset');

  return {
    asset: await updateRentalAssetRecord(assetId, {
      ...buildRentalAssetRecord(organizationId, payload),
      organization_id: organizationId,
    }),
  };
}

function buildContractRecord(
  organizationId: string,
  payload: ContractDraftInput
): Omit<Contract, 'id' | 'created_at' | 'updated_at'> {
  const baseRecord = {
    organization_id: organizationId,
    internal_number: '0',
    kind: payload.kind,
    contract_company: payload.contract_company,
    customer_id: payload.customer_id,
    site_id: payload.site_id,
    legacy_order_number: payload.legacy_order_number,
    start_date: payload.start_date,
    end_date: payload.end_date,
    recurrence_days: payload.recurrence_days,
    pricing_model: payload.pricing_model,
    base_amount: payload.base_amount,
    percentage_rate: payload.percentage_rate,
    status: payload.status,
    pause_started_at: null,
    pause_reason: null,
    notes: payload.notes,
  };

  if (payload.kind !== 'rental') {
    return baseRecord as Omit<Contract, 'id' | 'created_at' | 'updated_at'>;
  }

  return {
    ...baseRecord,
    transport_notes: payload.transport_notes,
    has_remittance_invoice: payload.has_remittance_invoice,
    remittance_invoice_number: payload.remittance_invoice_number,
    remittance_invoice_issuer: payload.has_remittance_invoice
      ? getContractCompanyLabel(payload.contract_company)
      : null,
    remittance_invoice_amount: payload.has_remittance_invoice ? payload.remittance_invoice_amount : null,
    remittance_invoice_issue_date: payload.has_remittance_invoice ? payload.remittance_invoice_issue_date : null,
  } as Omit<Contract, 'id' | 'created_at' | 'updated_at'>;
}

function buildRentalItemRecords(
  organizationId: string,
  contractId: string,
  items: RentalItemDraftInput[]
): RentalItem[] {
  const now = new Date().toISOString();

  return items.map((item) => ({
    id: item.id,
    organization_id: organizationId,
    contract_id: contractId,
    asset_id: item.asset_id,
    description: item.description,
    equipment_type: item.equipment_type,
    capacity: item.capacity ?? '',
    serial_number: item.serial_number ?? '',
    internal_code: item.internal_code ?? '',
    quantity: item.asset_id ? 1 : item.quantity,
    unit_amount: item.unit_amount,
    status: item.status,
    returned_at: null,
    future_inventory_item_id: null,
    created_at: now,
    updated_at: now,
  }));
}

function resolveRentalItemIds(items: RentalItemDraftInput[]) {
  const itemIdMap = new Map<string, string>();

  return items.map((item) => ({
    ...item,
    id: resolvePersistedId(item.id, itemIdMap),
  }));
}

function sortRentalItemRecordsForPersistence(records: RentalItem[]) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const leftAssetId = left.record.asset_id;
      const rightAssetId = right.record.asset_id;
      const leftHasAsset = leftAssetId != null;
      const rightHasAsset = rightAssetId != null;

      if (leftAssetId != null && rightAssetId != null) {
        const assetOrder = leftAssetId.localeCompare(rightAssetId);

        if (assetOrder !== 0) {
          return assetOrder;
        }

        const idOrder = left.record.id.localeCompare(right.record.id);

        if (idOrder !== 0) {
          return idOrder;
        }
      }

      if (leftHasAsset !== rightHasAsset) {
        return leftHasAsset ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map(({ record }) => record);
}

async function persistRentalItems(
  client: ContractsLocacoesMutationClient,
  organizationId: string,
  contractId: string,
  payload: ContractDraftInput
) {
  const itemRecords = payload.kind === 'rental'
    ? sortRentalItemRecordsForPersistence(
      buildRentalItemRecords(
        organizationId,
        contractId,
        resolveRentalItemIds(payload.items)
      )
    )
    : [];

  const items = await client.upsertRentalItems(itemRecords);
  await client.deleteMissingRentalItems(contractId, itemRecords.map((item) => item.id));

  return items;
}

async function cleanupFailedContractCreate(
  client: ContractsLocacoesMutationClient,
  contractId: string
) {
  const cleanupErrors: string[] = [];

  try {
    await client.deleteMissingRentalItems(contractId, []);
  } catch (error) {
    cleanupErrors.push(
      error instanceof Error ? error.message : 'Não foi possível limpar itens temporários da locação.'
    );
  }

  return cleanupErrors;
}

export async function createContract(
  client: ContractsLocacoesMutationClient,
  rawPayload: ContractDraftInput
): Promise<ContractMutationResult> {
  const payload = contractDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const contract = await client.insertContract(buildContractRecord(organizationId, payload));

  try {
    const items = await persistRentalItems(client, organizationId, contract.id, payload);

    return {
      contract,
      items,
    };
  } catch (error) {
    const cleanupErrors = await cleanupFailedContractCreate(client, contract.id);
    const detail = error instanceof Error ? error.message : 'Erro desconhecido ao salvar os itens da locação.';
    const cleanupDetail = cleanupErrors.length > 0
      ? ` Limpeza compensatória incompleta: ${cleanupErrors.join(' | ')}.`
      : '';

    throw new Error(
      `Não foi possível concluir o cadastro completo do contrato. ` +
      `Os itens desta tentativa foram revertidos quando possível, ` +
      `mas o contrato base pode precisar de revisão manual. ` +
      `Detalhe: ${detail}.${cleanupDetail}`
    );
  }

}

export async function pauseContract(
  client: ContractsLocacoesMutationClient,
  contractId: string,
  rawPayload: PauseContractInput
) {
  const payload = pauseContractSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const getContractById = requireClosureMethod(client.getContractById?.bind(client), 'getContractById');
  const contract = await getContractById(organizationId, contractId);

  if (contract.status === 'closed' || contract.status === 'cancelled') {
    throw new Error('Contratos encerrados ou cancelados nao podem ser pausados.');
  }

  return client.updateContract(contractId, {
    organization_id: organizationId,
    status: 'paused',
    pause_started_at: payload.pause_started_at,
    pause_reason: payload.pause_reason,
  });
}

export async function reactivateContract(
  client: ContractsLocacoesMutationClient,
  contractId: string,
  rawPayload: ReactivateContractInput
) {
  reactivateContractSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const getContractById = requireClosureMethod(client.getContractById?.bind(client), 'getContractById');
  const contract = await getContractById(organizationId, contractId);

  if (contract.status === 'closed' || contract.status === 'cancelled') {
    throw new Error('Contratos encerrados ou cancelados nao podem ser reativados.');
  }

  return client.updateContract(contractId, {
    organization_id: organizationId,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
  });
}

function requireClosureMethod<T>(
  method: T | undefined,
  name: string
): T {
  if (!method) {
    throw new Error(`Cliente de mutação sem suporte para ${name}`);
  }

  return method;
}

export async function startContractClosure(
  client: ContractsLocacoesMutationClient,
  contractId: string,
  rawPayload: { end_date: string }
) {
  const endDate = rawPayload.end_date?.trim();

  if (!endDate) {
    throw new Error('Data efetiva de término é obrigatória.');
  }

  const organizationId = await client.getCurrentOrganizationId();
  const getContractById = requireClosureMethod(client.getContractById?.bind(client), 'getContractById');
  const listRentalItemsByContractId = requireClosureMethod(
    client.listRentalItemsByContractId?.bind(client),
    'listRentalItemsByContractId'
  );
  const contract = await getContractById(organizationId, contractId);

  if (endDate < contract.start_date) {
    throw new Error('A data final não pode ser anterior ao início.');
  }

  const items = await listRentalItemsByContractId(organizationId, contractId);
  const status = hasPendingPhysicalReturns(items) ? 'awaiting_return' : 'closed';

  return client.updateContract(contractId, {
    organization_id: organizationId,
    end_date: endDate,
    status,
  });
}

export async function registerRentalItemReturn(
  client: ContractsLocacoesMutationClient,
  contractId: string,
  itemId: string,
  rawPayload: { returned_at: string }
) {
  const returnedAt = rawPayload.returned_at?.trim();

  if (!returnedAt) {
    throw new Error('Data de devolução é obrigatória.');
  }

  const organizationId = await client.getCurrentOrganizationId();
  const getContractById = requireClosureMethod(client.getContractById?.bind(client), 'getContractById');
  const getRentalItemById = requireClosureMethod(client.getRentalItemById?.bind(client), 'getRentalItemById');
  const updateRentalItem = requireClosureMethod(client.updateRentalItem?.bind(client), 'updateRentalItem');
  const [contract, item] = await Promise.all([
    getContractById(organizationId, contractId),
    getRentalItemById(organizationId, itemId),
  ]);

  if (item.contract_id !== contractId) {
    throw new Error('O item informado não pertence a esta locação.');
  }

  assertValidReturnDate(contract, item, returnedAt);

  return updateRentalItem(itemId, {
    organization_id: organizationId,
    returned_at: returnedAt,
    status: 'returned',
  });
}

export async function closeContract(
  client: ContractsLocacoesMutationClient,
  contractId: string
) {
  const organizationId = await client.getCurrentOrganizationId();
  const getContractById = requireClosureMethod(client.getContractById?.bind(client), 'getContractById');
  const listRentalItemsByContractId = requireClosureMethod(
    client.listRentalItemsByContractId?.bind(client),
    'listRentalItemsByContractId'
  );
  const [contract, items] = await Promise.all([
    getContractById(organizationId, contractId),
    listRentalItemsByContractId(organizationId, contractId),
  ]);

  assertCanCloseContract(items);

  if (!contract.end_date) {
    throw new Error('Nao e possivel encerrar a locacao sem data efetiva de termino.');
  }

  return client.updateContract(contractId, {
    organization_id: organizationId,
    end_date: contract.end_date,
    status: 'closed',
  });
}

function buildBillingCycleRecord(
  organizationId: string,
  payload: BillingDraftInput,
  contract: Contract
): Omit<BillingCycle, 'id' | 'created_at' | 'updated_at'> {
  const baseAmount = payload.items.reduce(
    (sum, item) => sum + item.quantity * Number.parseInt(item.unit_amount, 10),
    0
  );
  const totalAmount = calculateBilling({
    base: baseAmount,
    discount: Number.parseInt(payload.discount_amount, 10),
    surcharge: Number.parseInt(payload.surcharge_amount, 10),
    exemption: Number.parseInt(payload.exemption_amount, 10),
  });

  const documentNumber = payload.document_type === 'receipt'
    ? payload.document_number || receiptNumberFromInternalNumber(contract.internal_number, payload.sequence_number)
    : payload.document_number;

  return {
    organization_id: organizationId,
    contract_id: payload.contract_id,
    sequence_number: payload.sequence_number,
    period_start: payload.period_start,
    period_end: payload.period_end,
    issue_date: payload.issue_date,
    due_date: payload.due_date,
    base_amount: String(baseAmount),
    discount_amount: payload.discount_amount,
    surcharge_amount: payload.surcharge_amount,
    exemption_amount: payload.exemption_amount,
    total_amount: String(totalAmount),
    document_type: payload.document_type,
    document_number: documentNumber,
    status: 'issued',
    sent_at: null,
    notes: payload.notes,
  };
}

function normalizeNotes(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function assertBillingEditInput(payload: BillingCycleEditInput) {
  if (!payload.period_start) {
    throw new Error('Início do período é obrigatório.');
  }

  if (!payload.period_end) {
    throw new Error('Fim do período é obrigatório.');
  }

  if (payload.period_end < payload.period_start) {
    throw new Error('O período final não pode ser anterior ao inicial.');
  }

  if (!payload.issue_date) {
    throw new Error('Data de emissão é obrigatória.');
  }

  if (!payload.due_date) {
    throw new Error('Vencimento é obrigatório.');
  }

  if (payload.due_date < payload.issue_date) {
    throw new Error('O vencimento não pode ser anterior à emissão.');
  }

  if (!/^[1-9]\d*$/.test(payload.amount)) {
    throw new Error('Valor da cobrança deve ser maior que zero.');
  }
}

function assertBillingPeriodWithinContractEnd(
  contract: Contract,
  candidate: { period_start: string; period_end: string }
) {
  if (!contract.end_date) {
    return;
  }

  if (candidate.period_start > contract.end_date) {
    throw new Error('Não é possível gerar cobrança posterior ao encerramento da locação.');
  }

  if (candidate.period_end > contract.end_date) {
    throw new Error('O período de cobrança não pode ultrapassar a data de encerramento da locação.');
  }
}

function buildBillingLineRecords(
  organizationId: string,
  billingCycleId: string,
  items: BillingLineDraftInput[]
): BillingLine[] {
  const now = new Date().toISOString();

  return items.map((item) => ({
    id: item.id,
    organization_id: organizationId,
    billing_cycle_id: billingCycleId,
    rental_item_id: item.rental_item_id,
    description: item.description,
    quantity: item.quantity,
    unit_amount: item.unit_amount,
    total_amount: String(item.quantity * Number.parseInt(item.unit_amount, 10)),
    kind: item.kind,
    created_at: now,
    updated_at: now,
  }));
}

export async function createBillingCycle(
  client: ContractsLocacoesMutationClient,
  rawPayload: BillingDraftInput
): Promise<BillingMutationResult> {
  const payload = billingDraftSchema.parse(rawPayload);
  const organizationId = await client.getCurrentOrganizationId();
  const getContractById = requireBillingMethod(client.getContractById?.bind(client), 'getContractById');
  const insertBillingCycle = requireBillingMethod(client.insertBillingCycle?.bind(client), 'insertBillingCycle');
  const listBillingCyclesByContractId = requireBillingMethod(client.listBillingCyclesByContractId?.bind(client), 'listBillingCyclesByContractId');
  const upsertBillingLines = requireBillingMethod(client.upsertBillingLines?.bind(client), 'upsertBillingLines');
  const deleteMissingBillingLines = requireBillingMethod(client.deleteMissingBillingLines?.bind(client), 'deleteMissingBillingLines');
  const contract = await getContractById(organizationId, payload.contract_id);
  const existingBillingCycles = await listBillingCyclesByContractId(organizationId, payload.contract_id);

  assertBillingPeriodWithinContractEnd(contract, {
    period_start: payload.period_start,
    period_end: payload.period_end,
  });
  assertNoBillingPeriodConflict(existingBillingCycles, {
    period_start: payload.period_start,
    period_end: payload.period_end,
  });

  const billing = await insertBillingCycle(buildBillingCycleRecord(organizationId, payload, contract));
  const lines = await upsertBillingLines(buildBillingLineRecords(organizationId, billing.id, payload.items));
  await deleteMissingBillingLines(billing.id, lines.map((line) => line.id));

  return {
    billing,
    lines,
  };
}

export async function updateBillingCycleDetails(
  client: ContractsLocacoesMutationClient,
  billingCycleId: string,
  rawPayload: BillingCycleEditInput
): Promise<BillingMutationResult> {
  assertBillingEditInput(rawPayload);

  const organizationId = await client.getCurrentOrganizationId();
  const getBillingCycleById = requireBillingMethod(client.getBillingCycleById?.bind(client), 'getBillingCycleById');
  const listBillingCyclesByContractId = requireBillingMethod(client.listBillingCyclesByContractId?.bind(client), 'listBillingCyclesByContractId');
  const listPaymentsByBillingCycleId = requireBillingMethod(client.listPaymentsByBillingCycleId?.bind(client), 'listPaymentsByBillingCycleId');
  const updateBillingCycle = requireBillingMethod(client.updateBillingCycle?.bind(client), 'updateBillingCycle');
  const upsertBillingLines = requireBillingMethod(client.upsertBillingLines?.bind(client), 'upsertBillingLines');
  const deleteMissingBillingLines = requireBillingMethod(client.deleteMissingBillingLines?.bind(client), 'deleteMissingBillingLines');

  const billingCycle = await getBillingCycleById(organizationId, billingCycleId);
  const getContractById = requireBillingMethod(client.getContractById?.bind(client), 'getContractById');
  const contract = await getContractById(organizationId, billingCycle.contract_id);
  const existingBillingCycles = await listBillingCyclesByContractId(organizationId, billingCycle.contract_id);
  const payments = await listPaymentsByBillingCycleId(organizationId, billingCycleId);

  assertBillingPeriodWithinContractEnd(contract, {
    period_start: rawPayload.period_start,
    period_end: rawPayload.period_end,
  });
  assertNoBillingPeriodConflict(existingBillingCycles, {
    period_start: rawPayload.period_start,
    period_end: rawPayload.period_end,
    ignoreBillingCycleId: billingCycleId,
  });

  const hasPayments = payments.length > 0;
  const amountChanged = rawPayload.amount !== billingCycle.total_amount;

  if (hasPayments && amountChanged) {
    throw new Error('O valor não pode ser alterado porque já existe recebimento registrado.');
  }

  const patch: Partial<BillingCycle> = {
    organization_id: organizationId,
    period_start: rawPayload.period_start,
    period_end: rawPayload.period_end,
    issue_date: rawPayload.issue_date,
    due_date: rawPayload.due_date,
    notes: normalizeNotes(rawPayload.notes),
  };

  let lines: BillingLine[] = [];

  if (!hasPayments && amountChanged) {
    patch.base_amount = rawPayload.amount;
    patch.discount_amount = '0';
    patch.surcharge_amount = '0';
    patch.exemption_amount = '0';
    patch.total_amount = rawPayload.amount;
  }

  const billing = await updateBillingCycle(billingCycleId, patch);

  if (!hasPayments && amountChanged) {
    const line = buildBillingLineRecords(organizationId, billingCycleId, [
      {
        id: generateUuid(),
        rental_item_id: null,
        description: 'Locação mensal',
        quantity: 1,
        unit_amount: rawPayload.amount,
        kind: 'recurring',
      },
    ]);

    lines = await upsertBillingLines(line);
    await deleteMissingBillingLines(billingCycleId, lines.map((entry) => entry.id));
  }

  return {
    billing,
    lines,
  };
}

export async function markBillingCycleSent(
  client: ContractsLocacoesMutationClient,
  billingCycleId: string,
  now = new Date()
) {
  const organizationId = await client.getCurrentOrganizationId();
  const updateBillingCycle = requireBillingMethod(client.updateBillingCycle?.bind(client), 'updateBillingCycle');

  return updateBillingCycle(billingCycleId, {
    organization_id: organizationId,
    sent_at: now.toISOString(),
  });
}

export async function recordBillingPayment(
  client: ContractsLocacoesMutationClient,
  billingCycleId: string,
  rawPayload: PaymentDraftInput
): Promise<PaymentMutationResult> {
  const payload = paymentDraftSchema.parse(rawPayload);
  if (payload.billing_cycle_id !== billingCycleId) {
    throw new Error('Recebimento não pertence à cobrança informada.');
  }

  const organizationId = await client.getCurrentOrganizationId();
  const getBillingCycleById = requireBillingMethod(client.getBillingCycleById?.bind(client), 'getBillingCycleById');
  const insertPayment = requireBillingMethod(client.insertPayment?.bind(client), 'insertPayment');
  const listPaymentsByBillingCycleId = requireBillingMethod(client.listPaymentsByBillingCycleId?.bind(client), 'listPaymentsByBillingCycleId');
  const updateBillingCycle = requireBillingMethod(client.updateBillingCycle?.bind(client), 'updateBillingCycle');
  const billingCycle = await getBillingCycleById(organizationId, billingCycleId);

  const payment = await insertPayment({
    organization_id: organizationId,
    billing_cycle_id: payload.billing_cycle_id,
    paid_at: payload.paid_at,
    amount: payload.amount,
    notes: payload.notes,
  });

  const payments = await listPaymentsByBillingCycleId(organizationId, billingCycleId);
  const totalPaid = payments.map((entry) => entry.amount);
  const balance = calculateBillingBalance(billingCycle.total_amount, totalPaid);
  const status = buildBillingStatus(billingCycle.total_amount, totalPaid, payload.paid_at, billingCycle.due_date);
  const billing = await updateBillingCycle(billingCycleId, {
    organization_id: organizationId,
    status,
  });

  return {
    billing,
    payment,
    payments,
    balance,
  };
}
