import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getBillingCompanyProfile, type BillingCompanyProfile } from './company';
import { calculateBillingBalance } from './dashboard';
import { formatBRL, formatBRLInWords } from './money';
import { receiptNumberFromInternalNumber } from './numbering';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerSite, Payment, RentalItem } from './types';

export interface RentalInvoiceSnapshot {
  invoiceNumber: string;
  fileName: string;
  issuedAtLabel: string;
  dueAtLabel: string;
  period: {
    start: string;
    end: string;
    label: string;
    sequenceNumber: number;
  };
  company: BillingCompanyProfile;
  contract: {
    id: string;
    internalNumber: string;
    legacyOrderNumber: string | null;
    kind: Contract['kind'];
    notes: string | null;
  };
  customer: {
    name: string;
    tradeName: string;
    taxId: string | null;
    stateRegistration: string | null;
  };
  site: {
    name: string;
    addressLabel: string;
  };
  remittanceInvoice: {
    number: string;
    issueDateLabel: string | null;
  } | null;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    kind: BillingLine['kind'];
    unitAmountLabel: string;
    totalAmountLabel: string;
  }>;
  totals: {
    baseAmount: string;
    discountAmount: string;
    surchargeAmount: string;
    exemptionAmount: string;
    totalAmount: string;
    baseAmountLabel: string;
    discountAmountLabel: string;
    surchargeAmountLabel: string;
    exemptionAmountLabel: string;
    totalAmountLabel: string;
    totalAmountInWords: string;
  };
  financialStatus: {
    paidAmount: string;
    balanceAmount: string;
    paidAmountLabel: string;
    balanceAmountLabel: string;
  };
  notes: string | null;
}

export interface BuildRentalInvoiceSnapshotInput {
  billing: BillingCycle;
  contract: Contract;
  customer: Customer;
  site: CustomerSite | null;
  rentalItems?: RentalItem[];
  billingLines: BillingLine[];
  payments: Payment[];
}

export function buildRentalInvoiceSnapshot({
  billing,
  contract,
  customer,
  site,
  billingLines,
  payments,
}: BuildRentalInvoiceSnapshotInput): RentalInvoiceSnapshot {
  const invoiceNumber = billing.document_number
    ?? receiptNumberFromInternalNumber(contract.internal_number, billing.sequence_number);
  const balance = calculateBillingBalance(
    billing.total_amount,
    payments.map((payment) => payment.amount)
  );

  return {
    invoiceNumber,
    fileName: 'fatura-' + invoiceNumber + '.pdf',
    issuedAtLabel: formatDateLabel(billing.issue_date),
    dueAtLabel: formatDateLabel(billing.due_date),
    period: {
      start: billing.period_start,
      end: billing.period_end,
      label: formatDateLabel(billing.period_start) + ' a ' + formatDateLabel(billing.period_end),
      sequenceNumber: billing.sequence_number,
    },
    company: getBillingCompanyProfile(contract.contract_company),
    contract: {
      id: contract.id,
      internalNumber: String(contract.internal_number),
      legacyOrderNumber: contract.legacy_order_number,
      kind: contract.kind,
      notes: contract.notes,
    },
    customer: {
      name: customer.legal_name,
      tradeName: customer.trade_name,
      taxId: customer.tax_id,
      stateRegistration: customer.state_registration,
    },
    site: {
      name: site?.name ?? 'Local não informado',
      addressLabel: formatSiteAddress(site),
    },
    remittanceInvoice: buildRemittanceInvoice(contract),
    lines: billingLines
      .filter((line) => line.kind === 'recurring' || line.kind === 'damage')
      .map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        kind: line.kind,
        unitAmountLabel: formatBRL(line.unit_amount),
        totalAmountLabel: formatBRL(line.total_amount),
      })),
    totals: {
      baseAmount: billing.base_amount,
      discountAmount: billing.discount_amount,
      surchargeAmount: billing.surcharge_amount,
      exemptionAmount: billing.exemption_amount,
      totalAmount: billing.total_amount,
      baseAmountLabel: formatBRL(billing.base_amount),
      discountAmountLabel: formatBRL(billing.discount_amount),
      surchargeAmountLabel: formatBRL(billing.surcharge_amount),
      exemptionAmountLabel: formatBRL(billing.exemption_amount),
      totalAmountLabel: formatBRL(billing.total_amount),
      totalAmountInWords: formatBRLInWords(billing.total_amount),
    },
    financialStatus: {
      paidAmount: balance.paid_amount,
      balanceAmount: balance.balance_amount,
      paidAmountLabel: formatBRL(balance.paid_amount),
      balanceAmountLabel: formatBRL(balance.balance_amount),
    },
    notes: billing.notes?.trim() || contract.notes?.trim() || null,
  };
}

function buildRemittanceInvoice(contract: Contract) {
  const number = contract.remittance_invoice_number?.trim();

  if (!contract.has_remittance_invoice || !number) {
    return null;
  }

  return {
    number,
    issueDateLabel: contract.remittance_invoice_issue_date
      ? formatDateLabel(contract.remittance_invoice_issue_date)
      : null,
  };
}

function formatDateLabel(date: string) {
  return format(new Date(date + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });
}

function formatSiteAddress(site: CustomerSite | null) {
  if (!site) {
    return 'Endereço não informado';
  }

  return [
    site.address_line,
    site.number,
    site.complement,
    site.district,
    site.city + '/' + site.state,
    site.postal_code,
  ].filter(Boolean).join(' • ');
}
