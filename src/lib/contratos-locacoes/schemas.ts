import { z } from 'zod';
import { getContractCompanyLabel } from './company';

const emptyToNull = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const normalizeTaxId = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().nullable());
const optionalTextField = z
  .preprocess(emptyToNull, z.string().trim().nullable().optional())
  .transform((value) => value ?? null);

const emailField = z.preprocess((value) => {
  const normalized = emptyToNull(value);
  return typeof normalized === 'string' ? normalized.toLowerCase() : normalized;
}, z.email().nullable());

const customerRecordBaseSchema = z.object({
  legal_name: z.string().trim().min(1, 'Razão social é obrigatória'),
  trade_name: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  tax_id: z.preprocess(normalizeTaxId, z.string().regex(/^\d{11}$|^\d{14}$/).nullable()),
  state_registration: optionalText,
  municipal_registration: optionalText,
  notes: optionalText,
  active: z.boolean().default(true),
});

export const customerRecordSchema = customerRecordBaseSchema.transform((value) => ({
  ...value,
  trade_name: value.trade_name?.trim() || value.legal_name,
}));

export const customerSiteSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Nome da obra/local é obrigatório'),
  address_line: z.string().trim().min(1, 'Endereço é obrigatório'),
  number: z.string().trim().min(1, 'Número é obrigatório'),
  complement: optionalText,
  district: z.string().trim().min(1, 'Bairro é obrigatório'),
  city: z.string().trim().min(1, 'Cidade é obrigatória'),
  state: z.string().trim().length(2, 'UF deve ter 2 letras').transform((value) => value.toUpperCase()),
  postal_code: z.string().trim().min(1, 'CEP é obrigatório'),
  notes: optionalText,
  active: z.boolean().default(true),
});

export const customerContactSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, 'Nome do contato é obrigatório'),
  job_title: optionalText,
  department: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: emailField,
  site_id: z.preprocess(emptyToNull, z.string().trim().nullable()).default(null),
  is_primary: z.boolean().default(false),
  receives_billing: z.boolean().default(false),
  receives_technical: z.boolean().default(false),
  notes: optionalText,
});

export const customerDraftSchema = customerRecordBaseSchema.extend({
  sites: z.array(customerSiteSchema).min(1, 'Cadastre pelo menos uma obra/local'),
  contacts: z.array(customerContactSchema).min(1, 'Cadastre pelo menos um contato'),
}).transform((value) => ({
  ...value,
  trade_name: value.trade_name?.trim() || value.legal_name,
})).superRefine((value, ctx) => {
  const siteIds = new Set(value.sites.map((site) => site.id));

  value.contacts.forEach((contact, index) => {
    if (contact.site_id && !siteIds.has(contact.site_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contacts', index, 'site_id'],
        message: 'O contato está vinculado a uma obra inexistente',
      });
    }
  });
});

const moneyStringField = z.preprocess((value) => {
  if (typeof value === 'number') {
    return String(Math.trunc(value));
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? '0' : trimmed;
}, z.string().regex(/^\d+$/, 'Use apenas centavos inteiros'));

const optionalNumericString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().regex(/^\d+(\.\d+)?$/).nullable());

const optionalDateField = z.preprocess(emptyToNull, z.string().trim().nullable());
const optionalDateFieldCompat = z
  .preprocess(emptyToNull, z.string().trim().nullable().optional())
  .transform((value) => value ?? null);

const optionalMoneyStringField = z.preprocess((value) => {
  if (typeof value === 'number') {
    return String(Math.trunc(value));
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}, z.string().regex(/^\d+$/, 'Use apenas centavos inteiros').nullable().optional()).transform((value) => value ?? null);

export const rentalItemDraftSchema = z.object({
  id: z.string().trim().min(1),
  asset_id: z.preprocess(emptyToNull, z.string().trim().nullable().optional()).transform((value) => value ?? null),
  description: z.string().trim().min(1, 'Descrição do item é obrigatória'),
  equipment_type: z.string().trim().min(1, 'Tipo do item é obrigatório'),
  capacity: optionalTextField,
  serial_number: optionalTextField,
  internal_code: optionalTextField,
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  unit_amount: moneyStringField,
  status: z.enum(['rented', 'returned', 'replaced', 'lost_damaged', 'suspended_exempt']).default('rented'),
  notes: optionalTextField,
}).transform((value) => ({
  ...value,
  capacity: value.capacity ?? null,
  serial_number: value.serial_number ?? null,
  internal_code: value.internal_code ?? null,
  quantity: value.asset_id ? 1 : value.quantity,
  notes: value.notes ?? null,
}));

export const rentalAssetDraftSchema = z.object({
  description: z.string().trim().min(1, 'Descrição do ativo é obrigatória'),
  equipment_type: optionalTextField,
  capacity: optionalTextField,
  serial_number: optionalTextField,
  internal_code: optionalTextField,
  operational_status: z.enum(['active', 'maintenance', 'inactive', 'retired']).default('active'),
  notes: optionalTextField,
});

const contractDraftBaseSchema = z.object({
  kind: z.enum(['rental', 'energy_management', 'recurring_service', 'other']),
  contract_company: z.enum(['fontes', 'radial']).default('fontes'),
  customer_id: z.string().trim().min(1, 'Cliente é obrigatório'),
  site_id: z.string().trim().min(1, 'Obra/local é obrigatória'),
  legacy_order_number: optionalText,
  transport_notes: optionalTextField,
  has_remittance_invoice: z.boolean().default(false),
  remittance_invoice_number: optionalTextField,
  remittance_invoice_issuer: optionalTextField,
  remittance_invoice_amount: optionalMoneyStringField,
  remittance_invoice_issue_date: optionalDateFieldCompat,
  start_date: z.string().trim().min(1, 'Data de início é obrigatória'),
  end_date: optionalDateField,
  recurrence_days: z.number().int().positive('Recorrência deve ser maior que zero'),
  pricing_model: z.enum(['fixed', 'variable', 'percentage', 'fixed_plus_variable']),
  base_amount: moneyStringField,
  percentage_rate: optionalNumericString,
  status: z.enum(['draft', 'active', 'paused', 'closing_requested', 'awaiting_return', 'inspection', 'closed', 'cancelled']).default('draft'),
  notes: optionalText,
  items: z.array(rentalItemDraftSchema),
});

export const contractDraftSchema = contractDraftBaseSchema.superRefine((value, ctx) => {
  if (value.end_date && value.end_date < value.start_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'A data final não pode ser anterior ao início',
    });
  }

  if (value.kind === 'rental' && value.items.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'Locações precisam de pelo menos um item manual',
    });
  }
  const seenAssetIds = new Set<string>();

  value.items.forEach((item, index) => {
    if (!item.asset_id) {
      return;
    }

    if (seenAssetIds.has(item.asset_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'asset_id'],
        message: 'O mesmo ativo físico não pode aparecer duas vezes na mesma locação',
      });
      return;
    }

    seenAssetIds.add(item.asset_id);
  });

  if (value.has_remittance_invoice) {
    if (!value.remittance_invoice_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remittance_invoice_number'],
        message: 'Preencha os dados da nota fiscal de remessa',
      });
    }

    if (!value.remittance_invoice_amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remittance_invoice_amount'],
        message: 'Preencha os dados da nota fiscal de remessa',
      });
    }

    if (!value.remittance_invoice_issue_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remittance_invoice_issue_date'],
        message: 'Preencha os dados da nota fiscal de remessa',
      });
    }
  }
}).transform((value) => {
  if (value.has_remittance_invoice) {
    return {
      ...value,
      remittance_invoice_issuer: getContractCompanyLabel(value.contract_company),
    };
  }

  return {
    ...value,
    remittance_invoice_number: null,
    remittance_invoice_issuer: null,
    remittance_invoice_amount: null,
    remittance_invoice_issue_date: null,
  };
});

export const pauseContractSchema = z.object({
  pause_started_at: z.string().trim().min(1, 'Data da pausa é obrigatória'),
  pause_reason: z.string().trim().min(1, 'Motivo da pausa é obrigatório'),
});

export const reactivateContractSchema = z.object({
  reactivated_at: z.string().trim().min(1, 'Data de reativação é obrigatória'),
});

export const billingLineDraftSchema = z.object({
  id: z.string().trim().min(1),
  rental_item_id: z.preprocess(emptyToNull, z.string().trim().nullable()).default(null),
  description: z.string().trim().min(1, 'Descrição da linha é obrigatória'),
  quantity: z.number().int().positive('Quantidade deve ser maior que zero'),
  unit_amount: moneyStringField,
  kind: z.enum(['recurring', 'damage', 'discount', 'surcharge']).default('recurring'),
});

export const billingDraftSchema = z.object({
  contract_id: z.string().trim().min(1, 'Contrato é obrigatório'),
  period_start: z.string().trim().min(1, 'Início do período é obrigatório'),
  period_end: z.string().trim().min(1, 'Fim do período é obrigatório'),
  issue_date: z.string().trim().min(1, 'Data de emissão é obrigatória'),
  due_date: z.string().trim().min(1, 'Vencimento é obrigatório'),
  document_type: z.enum(['receipt', 'nfe', 'legacy', 'other']),
  document_number: z.preprocess(emptyToNull, z.string().trim().nullable()),
  sequence_number: z.number().int().min(1).max(999),
  discount_amount: moneyStringField,
  surcharge_amount: moneyStringField,
  exemption_amount: moneyStringField,
  notes: optionalText,
  items: z.array(billingLineDraftSchema).min(1, 'Adicione pelo menos uma linha de cobrança'),
}).superRefine((value, ctx) => {
  if (value.period_end < value.period_start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['period_end'],
      message: 'O período final não pode ser anterior ao inicial',
    });
  }

  if (value.due_date < value.issue_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['due_date'],
      message: 'O vencimento não pode ser anterior à emissão',
    });
  }

  if (value.document_type === 'receipt' && value.document_number && !/^R\d{9}$/.test(value.document_number)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document_number'],
      message: 'Número curto de recibo deve seguir o formato RDDMMAASSS',
    });
  }
});

export const paymentDraftSchema = z.object({
  billing_cycle_id: z.string().trim().min(1, 'Cobrança é obrigatória'),
  paid_at: z.string().trim().min(1, 'Data do pagamento é obrigatória'),
  amount: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return '0';
    }

    return value;
  }, z.string().regex(/^[1-9]\d*$/, 'Valor do pagamento deve ser maior que zero')),
  notes: optionalText,
});

export type CustomerRecordInput = z.input<typeof customerRecordSchema>;
export type CustomerRecord = z.output<typeof customerRecordSchema>;
export type CustomerSiteInput = z.output<typeof customerSiteSchema>;
export type CustomerContactInput = z.output<typeof customerContactSchema>;
export type CustomerDraftInput = z.output<typeof customerDraftSchema>;
export type RentalItemDraftInput = z.output<typeof rentalItemDraftSchema>;
export type RentalAssetDraftInput = z.output<typeof rentalAssetDraftSchema>;
export type ContractDraftInput = z.output<typeof contractDraftSchema>;
export type PauseContractInput = z.output<typeof pauseContractSchema>;
export type ReactivateContractInput = z.output<typeof reactivateContractSchema>;
export type BillingLineDraftInput = z.output<typeof billingLineDraftSchema>;
export type BillingDraftInput = z.output<typeof billingDraftSchema>;
export type PaymentDraftInput = z.output<typeof paymentDraftSchema>;
