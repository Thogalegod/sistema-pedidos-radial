import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateBillingBalance } from './dashboard';
import { formatBRL } from './money';
import { receiptNumberFromInternalNumber } from './numbering';
import type { BillingCycle, BillingLine, Contract, Customer, CustomerSite, Payment, RentalItem } from './types';

export interface ReceiptSnapshot {
  receiptNumber: string;
  fileName: string;
  issuedAtLabel: string;
  dueAtLabel: string;
  generatedAtLabel: string;
  period: {
    start: string;
    end: string;
    label: string;
    sequenceNumber: number;
  };
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
  };
  site: {
    name: string;
    addressLabel: string;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    equipmentLabel: string;
    unitAmountLabel: string;
    status: RentalItem['status'];
  }>;
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
    paidAmount: string;
    balanceAmount: string;
    totalAmountLabel: string;
    paidAmountLabel: string;
    balanceAmountLabel: string;
  };
  notes: string | null;
}

interface BuildReceiptSnapshotInput {
  billing: BillingCycle;
  contract: Contract;
  customer: Customer;
  site: CustomerSite | null;
  rentalItems: RentalItem[];
  billingLines: BillingLine[];
  payments: Payment[];
  generatedAt?: Date;
}

export function buildReceiptSnapshot({
  billing,
  contract,
  customer,
  site,
  rentalItems,
  billingLines,
  payments,
  generatedAt = new Date(),
}: BuildReceiptSnapshotInput): ReceiptSnapshot {
  const receiptNumber = billing.document_number
    ?? receiptNumberFromInternalNumber(contract.internal_number, billing.sequence_number);
  const balance = calculateBillingBalance(
    billing.total_amount,
    payments.map((payment) => payment.amount)
  );

  return {
    receiptNumber,
    fileName: `recibo-${receiptNumber}.pdf`,
    issuedAtLabel: formatDateLabel(billing.issue_date),
    dueAtLabel: formatDateLabel(billing.due_date),
    generatedAtLabel: format(generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
    period: {
      start: billing.period_start,
      end: billing.period_end,
      label: `${formatDateLabel(billing.period_start)} a ${formatDateLabel(billing.period_end)}`,
      sequenceNumber: billing.sequence_number,
    },
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
    },
    site: {
      name: site?.name ?? 'Local não informado',
      addressLabel: formatSiteAddress(site),
    },
    items: rentalItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      equipmentLabel: `${item.equipment_type} • ${item.capacity}`,
      unitAmountLabel: formatBRL(Number.parseInt(item.unit_amount, 10)),
      status: item.status,
    })),
    lines: billingLines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      kind: line.kind,
      unitAmountLabel: formatBRL(Number.parseInt(line.unit_amount, 10)),
      totalAmountLabel: formatBRL(Number.parseInt(line.total_amount, 10)),
    })),
    totals: {
      baseAmount: billing.base_amount,
      discountAmount: billing.discount_amount,
      surchargeAmount: billing.surcharge_amount,
      exemptionAmount: billing.exemption_amount,
      totalAmount: billing.total_amount,
      paidAmount: balance.paid_amount,
      balanceAmount: balance.balance_amount,
      totalAmountLabel: formatBRL(Number.parseInt(billing.total_amount, 10)),
      paidAmountLabel: formatBRL(Number.parseInt(balance.paid_amount, 10)),
      balanceAmountLabel: formatBRL(Number.parseInt(balance.balance_amount, 10)),
    },
    notes: billing.notes ?? contract.notes,
  };
}

function formatDateLabel(date: string) {
  return format(new Date(`${date}T00:00:00`), 'dd/MM/yyyy', { locale: ptBR });
}

function formatSiteAddress(site: CustomerSite | null) {
  if (!site) {
    return 'Endereço não informado';
  }

  const parts = [
    site.address_line,
    site.number,
    site.complement,
    site.district,
    `${site.city}/${site.state}`,
    site.postal_code,
  ].filter(Boolean);

  return parts.join(' • ');
}
