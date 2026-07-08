import type { SupabaseClient } from '@supabase/supabase-js';
import {
  billingDraftSchema,
  contractDraftSchema,
  customerDraftSchema,
  pauseContractSchema,
  paymentDraftSchema,
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
} from './schemas';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerContact, CustomerSite, Payment, RentalItem } from './types';
import { calculateBilling } from './money';
import { buildBillingStatus, calculateBillingBalance } from './dashboard';
import { receiptNumberFromInternalNumber } from './numbering';

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

export interface PaymentMutationResult {
  billing: BillingCycle;
  payment: Payment;
  payments: Payment[];
  balance: ReturnType<typeof calculateBillingBalance>;
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
  insertBillingCycle?(record: Omit<BillingCycle, 'id' | 'created_at' | 'updated_at'>): Promise<BillingCycle>;
  getBillingCycleById?(organizationId: string, billingCycleId: string): Promise<BillingCycle>;
  updateBillingCycle?(billingCycleId: string, patch: Partial<BillingCycle>): Promise<BillingCycle>;
  upsertBillingLines?(records: BillingLine[]): Promise<BillingLine[]>;
  deleteMissingBillingLines?(billingCycleId: string, keepIds: string[]): Promise<void>;
  insertPayment?(record: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment>;
  listPaymentsByBillingCycleId?(organizationId: string, billingCycleId: string): Promise<Payment[]>;
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

function buildContractRecord(
  organizationId: string,
  payload: ContractDraftInput
): Omit<Contract, 'id' | 'created_at' | 'updated_at'> {
  return {
    organization_id: organizationId,
    internal_number: '0',
    kind: payload.kind,
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
    description: item.description,
    equipment_type: item.equipment_type,
    capacity: item.capacity,
    serial_number: item.serial_number ?? '',
    internal_code: item.internal_code ?? '',
    quantity: item.quantity,
    unit_amount: item.unit_amount,
    status: item.status,
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

async function persistRentalItems(
  client: ContractsLocacoesMutationClient,
  organizationId: string,
  contractId: string,
  payload: ContractDraftInput
) {
  const itemRecords = payload.kind === 'rental'
    ? buildRentalItemRecords(
      organizationId,
      contractId,
      resolveRentalItemIds(payload.items)
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

  return client.updateContract(contractId, {
    organization_id: organizationId,
    status: 'active',
    pause_started_at: null,
    pause_reason: null,
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
    notes: payload.notes,
  };
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
  const upsertBillingLines = requireBillingMethod(client.upsertBillingLines?.bind(client), 'upsertBillingLines');
  const deleteMissingBillingLines = requireBillingMethod(client.deleteMissingBillingLines?.bind(client), 'deleteMissingBillingLines');
  const contract = await getContractById(organizationId, payload.contract_id);

  const billing = await insertBillingCycle(buildBillingCycleRecord(organizationId, payload, contract));
  const lines = await upsertBillingLines(buildBillingLineRecords(organizationId, billing.id, payload.items));
  await deleteMissingBillingLines(billing.id, lines.map((line) => line.id));

  return {
    billing,
    lines,
  };
}

export async function recordBillingPayment(
  client: ContractsLocacoesMutationClient,
  billingCycleId: string,
  rawPayload: PaymentDraftInput
): Promise<PaymentMutationResult> {
  const payload = paymentDraftSchema.parse(rawPayload);
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
