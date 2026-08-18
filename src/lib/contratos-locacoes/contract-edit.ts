import { z } from 'zod';
import type { ContractMutationResult } from './mutations';
import type { BillingCycle, Contract, ContractCompany, RentalItem } from './types';

export const CONTRACT_EDIT_LOCKED_MESSAGE = 'Bloqueado porque esta locação já possui cobranças emitidas.';
export const CONTRACT_EDIT_AVAILABILITY_MESSAGE = 'Um ou mais ativos selecionados não estão disponíveis para o período informado.';
export const CONTRACT_EDIT_VALIDATION_MESSAGE = 'Revise os dados da locação.';

const nullableText = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().nullable());

const editItemSchema = z.object({
  id: z.string().trim().min(1),
  asset_id: nullableText,
  description: z.string().trim().min(1, 'Descrição do item é obrigatória'),
  equipment_type: z.string().trim().min(1, 'Tipo do item é obrigatório'),
  capacity: nullableText,
  serial_number: nullableText,
  internal_code: nullableText,
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  unit_amount: z.string().trim().regex(/^\d+$/, 'Use apenas centavos inteiros'),
}).transform((value) => ({ ...value, quantity: value.asset_id ? 1 : value.quantity }));

const contractEditSchema = z.object({
  contract_company: z.enum(['fontes', 'radial']),
  customer_id: z.string().trim().min(1, 'Cliente é obrigatório'),
  site_id: z.string().trim().min(1, 'Obra/local é obrigatória'),
  legacy_order_number: nullableText,
  transport_notes: nullableText,
  start_date: z.string().trim().min(1, 'Data de início é obrigatória'),
  notes: nullableText,
  items: z.array(editItemSchema).min(1, 'Locações precisam de pelo menos um item'),
});

export type ContractEditItemInput = z.output<typeof editItemSchema>;
export type ContractEditInput = z.output<typeof contractEditSchema>;
type ParsedContractEditInput = z.output<typeof contractEditSchema>;

export function getContractEditErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return getValidationIssueMessage(error.issues);
  }

  if (error instanceof Error) {
    const serializedIssues = parseSerializedValidationIssues(error.message);
    return serializedIssues ? getValidationIssueMessage(serializedIssues) : error.message;
  }

  return 'Não foi possível salvar a locação.';
}

export interface ContractEditMutationClient {
  getCurrentOrganizationId(): Promise<string>;
  getContractById(organizationId: string, contractId: string): Promise<Contract>;
  listRentalItemsByContractId(organizationId: string, contractId: string): Promise<RentalItem[]>;
  listBillingCyclesByContractId(organizationId: string, contractId: string): Promise<BillingCycle[]>;
  updateContract(contractId: string, patch: Partial<Contract>): Promise<Contract>;
  upsertRentalItems(records: RentalItem[]): Promise<RentalItem[]>;
  deleteMissingRentalItems(contractId: string, keepIds: string[]): Promise<void>;
}

export function buildContractEditInput(contract: Contract, items: RentalItem[]): ContractEditInput {
  return {
    contract_company: contract.contract_company,
    customer_id: contract.customer_id,
    site_id: contract.site_id,
    legacy_order_number: contract.legacy_order_number,
    transport_notes: contract.transport_notes,
    start_date: contract.start_date,
    notes: contract.notes,
    items: items.map((item) => ({
      id: item.id,
      asset_id: item.asset_id,
      description: item.description,
      equipment_type: item.equipment_type,
      capacity: item.capacity || null,
      serial_number: item.serial_number || null,
      internal_code: item.internal_code || null,
      quantity: item.quantity,
      unit_amount: String(item.unit_amount),
    })),
  };
}

function getValidationIssueMessage(issues: ReadonlyArray<{ message?: unknown }>) {
  const focalMessage = issues
    .map((issue) => typeof issue.message === 'string' ? issue.message.trim() : '')
    .find((message) => message && !/^invalid input\b/i.test(message) && !/^expected\b/i.test(message));

  return focalMessage || CONTRACT_EDIT_VALIDATION_MESSAGE;
}

function parseSerializedValidationIssues(message: string): Array<{ message?: unknown }> | null {
  if (!message.trim().startsWith('[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(message) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((issue) => issue && typeof issue === 'object' && 'code' in issue)) {
      return null;
    }
    return parsed as Array<{ message?: unknown }>;
  } catch {
    return null;
  }
}

export function assertSafeContractEdit(
  currentContract: Contract,
  currentItems: RentalItem[],
  hasBilling: boolean,
  rawNext: ContractEditInput
): ParsedContractEditInput {
  if (hasBilling) {
    const currentById = new Map(currentItems.map((item) => [item.id, item]));
    const itemSetOrQuantityChanged = rawNext.items.length !== currentItems.length
      || rawNext.items.some((item) => currentById.get(item.id)?.quantity !== item.quantity);

    if (itemSetOrQuantityChanged) {
      throw new Error(CONTRACT_EDIT_LOCKED_MESSAGE);
    }
  }

  const next = contractEditSchema.parse(rawNext);

  if (!hasBilling) {
    return next;
  }

  const lockedContractChanged =
    next.contract_company !== currentContract.contract_company
    || next.customer_id !== currentContract.customer_id
    || next.site_id !== currentContract.site_id
    || next.start_date !== currentContract.start_date
    || (currentContract.legacy_order_number !== null
      && next.legacy_order_number !== currentContract.legacy_order_number);

  if (lockedContractChanged || billedItemStructureChanged(currentItems, next.items)) {
    throw new Error(CONTRACT_EDIT_LOCKED_MESSAGE);
  }

  return next;
}

function billedItemStructureChanged(currentItems: RentalItem[], nextItems: ParsedContractEditInput['items']) {
  if (currentItems.length !== nextItems.length) {
    return true;
  }

  const nextById = new Map(nextItems.map((item) => [item.id, item]));

  return currentItems.some((current) => {
    const next = nextById.get(current.id);
    if (!next) return true;

    return next.asset_id !== current.asset_id
      || next.description !== current.description
      || next.equipment_type !== current.equipment_type
      || normalizeText(next.capacity) !== normalizeText(current.capacity)
      || normalizeText(next.serial_number) !== normalizeText(current.serial_number)
      || normalizeText(next.internal_code) !== normalizeText(current.internal_code)
      || next.quantity !== current.quantity;
  });
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? '';
}

export async function updateContractSafely(
  client: ContractEditMutationClient,
  contractId: string,
  rawNext: ContractEditInput
): Promise<ContractMutationResult> {
  const organizationId = await client.getCurrentOrganizationId();
  const [currentContract, currentItems, billingCycles] = await Promise.all([
    client.getContractById(organizationId, contractId),
    client.listRentalItemsByContractId(organizationId, contractId),
    client.listBillingCyclesByContractId(organizationId, contractId),
  ]);
  const next = assertSafeContractEdit(currentContract, currentItems, billingCycles.length > 0, rawNext);
  const baseAmount = String(next.items.reduce(
    (total, item) => total + item.quantity * Number.parseInt(item.unit_amount, 10),
    0
  ));
  const items = buildPersistedItems(organizationId, contractId, currentItems, next.items);

  try {
    const contract = await client.updateContract(contractId, {
      organization_id: organizationId,
      contract_company: next.contract_company as ContractCompany,
      customer_id: next.customer_id,
      site_id: next.site_id,
      legacy_order_number: next.legacy_order_number,
      transport_notes: next.transport_notes,
      start_date: next.start_date,
      notes: next.notes,
      base_amount: baseAmount,
    });
    const persistedItems = await client.upsertRentalItems(items);
    await client.deleteMissingRentalItems(contractId, items.map((item) => item.id));

    return { contract, items: persistedItems };
  } catch (error) {
    if (isAvailabilityConflict(error)) {
      throw new Error(CONTRACT_EDIT_AVAILABILITY_MESSAGE);
    }
    throw error;
  }
}

function buildPersistedItems(
  organizationId: string,
  contractId: string,
  currentItems: RentalItem[],
  nextItems: ParsedContractEditInput['items']
) {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const now = new Date().toISOString();

  return nextItems.map((item) => {
    const current = currentById.get(item.id);
    return {
      id: current?.id ?? resolveNewItemId(item.id),
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
      status: current?.status ?? 'rented',
      returned_at: current?.returned_at ?? null,
      future_inventory_item_id: current?.future_inventory_item_id ?? null,
      created_at: current?.created_at ?? now,
      updated_at: now,
    } satisfies RentalItem;
  });
}

function resolveNewItemId(value: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return globalThis.crypto.randomUUID();
}

function isAvailabilityConflict(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ['dispon', 'availability', 'overlap', 'ocupad', 'conflit', 'rental_asset']
    .some((part) => message.includes(part));
}
