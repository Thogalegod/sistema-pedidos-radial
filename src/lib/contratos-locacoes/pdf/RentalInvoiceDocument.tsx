import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { RentalInvoiceSnapshot } from '../rental-invoice';

export interface RentalInvoiceDocumentContent {
  title: string;
  number: string;
  issuerName: string;
  issuerLines: string[];
  recipientLines: string[];
  invoiceDataRows: Array<{ label: string; value: string }>;
  description: string;
  tableHeaders: string[];
  tableRows: Array<{
    id: string;
    quantity: string;
    description: string;
    unitAmount: string;
    totalAmount: string;
  }>;
  adjustmentRows: Array<{ label: string; value: string }>;
  totalLabel: string;
  totalInWords: string;
  notes: string | null;
  fiscalNotice: string;
}

export function buildRentalInvoiceDocumentContent(
  snapshot: RentalInvoiceSnapshot
): RentalInvoiceDocumentContent {
  const company = snapshot.company;
  const fiscalLine = [
    'CNPJ: ' + company.taxId,
    'IE: ' + company.stateRegistration,
  ].filter((line): line is string => Boolean(line)).join(' · ');
  const issuerLines = [
    company.address.join(' · '),
    fiscalLine,
    ...company.contacts,
  ].filter((line): line is string => Boolean(line));
  const recipientFiscalLine = [
    snapshot.customer.taxId ? 'CNPJ/CPF: ' + snapshot.customer.taxId : null,
    snapshot.customer.stateRegistration ? 'IE: ' + snapshot.customer.stateRegistration : null,
  ].filter((line): line is string => Boolean(line)).join(' · ');
  const recipientLines = [
    snapshot.customer.name,
    shouldShowTradeName(snapshot)
      ? 'Nome fantasia: ' + snapshot.customer.tradeName
      : null,
    recipientFiscalLine || null,
    'Obra/local: ' + snapshot.site.name,
    snapshot.site.addressLabel,
  ].filter((line): line is string => Boolean(line));
  const invoiceDataRows = [
    { label: 'Nº da Fatura', value: snapshot.invoiceNumber },
    { label: 'Pedido', value: snapshot.contract.legacyOrderNumber ?? 'Não informado' },
    { label: 'Data de emissão', value: snapshot.issuedAtLabel },
    { label: 'Vencimento', value: snapshot.dueAtLabel },
    { label: 'Período', value: snapshot.period.label },
    { label: 'Obra/local', value: snapshot.site.name },
  ];

  if (snapshot.remittanceInvoice) {
    const dateSuffix = snapshot.remittanceInvoice.issueDateLabel
      ? ' • Data: ' + snapshot.remittanceInvoice.issueDateLabel
      : '';
    invoiceDataRows.push({
      label: 'NF de remessa',
      value: snapshot.remittanceInvoice.number + dateSuffix,
    });
  }

  return {
    title: 'FATURA DE LOCAÇÃO',
    number: snapshot.invoiceNumber,
    issuerName: company.legalName,
    issuerLines,
    recipientLines,
    invoiceDataRows,
    description: 'Referente à locação dos equipamentos abaixo discriminados.',
    tableHeaders: ['QUANTIDADE', 'DESCRIÇÃO', 'VALOR UNITÁRIO', 'VALOR TOTAL'],
    tableRows: snapshot.lines.map((line) => ({
      id: line.id,
      quantity: String(line.quantity),
      description: line.description,
      unitAmount: line.unitAmountLabel,
      totalAmount: line.totalAmountLabel,
    })),
    adjustmentRows: buildAdjustmentRows(snapshot),
    totalLabel: snapshot.totals.totalAmountLabel,
    totalInWords: snapshot.totals.totalAmountInWords,
    notes: snapshot.notes?.trim() || null,
    fiscalNotice: 'OPERAÇÃO NÃO SUJEITA A NOTA FISCAL DE SERVIÇOS NOS TERMOS DA LEI COMPLEMENTAR 116/2003 DE 01/08/2021',
  };
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingHorizontal: 34,
    paddingBottom: 64,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#20242b',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingBottom: 13,
    borderBottomWidth: 1.2,
    borderBottomColor: '#333b45',
  },
  issuer: {
    width: '68%',
  },
  issuerName: {
    marginBottom: 5,
    fontSize: 11,
    fontWeight: 700,
    color: '#111827',
  },
  issuerLine: {
    marginBottom: 1.2,
    fontSize: 8,
    lineHeight: 1.12,
    color: '#4b5563',
  },
  documentIdentity: {
    width: '32%',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
    textAlign: 'right',
  },
  number: {
    marginTop: 7,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#9ca3af',
    fontSize: 11,
    fontWeight: 700,
  },
  section: {
    marginTop: 13,
  },
  sectionTitle: {
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.7,
    borderBottomColor: '#c5cad1',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: '#374151',
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 18,
  },
  column: {
    width: '50%',
  },
  line: {
    marginBottom: 3,
    lineHeight: 1.25,
  },
  recipientSection: {
    marginTop: 9,
  },
  recipientLine: {
    marginBottom: 1.2,
    lineHeight: 1.1,
  },
  recipientName: {
    fontWeight: 700,
    color: '#111827',
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  dataLabel: {
    width: 82,
    fontWeight: 700,
    color: '#4b5563',
  },
  dataValue: {
    flexGrow: 1,
  },
  description: {
    marginTop: 11,
    marginBottom: 7,
    color: '#374151',
  },
  table: {
    borderWidth: 0.8,
    borderColor: '#aeb4bc',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#eef0f2',
    borderBottomWidth: 0.8,
    borderBottomColor: '#aeb4bc',
    fontSize: 8,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#d5d9de',
  },
  quantityColumn: {
    width: '14%',
    textAlign: 'center',
  },
  descriptionColumn: {
    width: '46%',
    paddingHorizontal: 5,
  },
  amountColumn: {
    width: '20%',
    textAlign: 'right',
  },
  summaryArea: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 18,
  },
  wordsBox: {
    width: '58%',
    padding: 9,
    borderWidth: 0.7,
    borderColor: '#c5cad1',
    backgroundColor: '#fafafa',
  },
  wordsLabel: {
    marginBottom: 4,
    fontSize: 8,
    fontWeight: 700,
    color: '#6b7280',
  },
  summaryBox: {
    width: '42%',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  grandTotal: {
    marginTop: 3,
    paddingTop: 6,
    borderTopWidth: 1.2,
    borderTopColor: '#333b45',
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 11,
    fontWeight: 700,
  },
  fiscalFooter: {
    position: 'absolute',
    left: 34,
    right: 34,
    bottom: 24,
    paddingTop: 7,
    borderTopWidth: 0.8,
    borderTopColor: '#6b7280',
    fontSize: 7.5,
    fontWeight: 700,
    textAlign: 'center',
    color: '#374151',
  },
});

interface RentalInvoiceDocumentProps {
  snapshot: RentalInvoiceSnapshot;
}

export function RentalInvoiceDocument({ snapshot }: RentalInvoiceDocumentProps) {
  const content = buildRentalInvoiceDocumentContent(snapshot);

  return (
    <Document
      author={content.issuerName}
      creator="Sistema Pedidos Radial"
      subject={'Fatura de Locação ' + content.number}
      title={'Fatura de Locação ' + content.number}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.issuer}>
            <Text style={styles.issuerName}>{content.issuerName}</Text>
            {content.issuerLines.map((line) => (
              <Text key={line} style={styles.issuerLine} wrap={false}>{line}</Text>
            ))}
          </View>
          <View style={styles.documentIdentity}>
            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.number}>Nº {content.number}</Text>
          </View>
        </View>

        <View style={styles.twoColumns}>
          <View style={[styles.section, styles.column, styles.recipientSection]}>
            <Text style={styles.sectionTitle}>DESTINATÁRIO</Text>
            {content.recipientLines.map((line, index) => (
              <Text
                key={line}
                style={index === 0 ? [styles.recipientLine, styles.recipientName] : styles.recipientLine}
              >
                {line}
              </Text>
            ))}
          </View>
          <View style={[styles.section, styles.column]}>
            <Text style={styles.sectionTitle}>DADOS DA FATURA / LOCAÇÃO</Text>
            {content.invoiceDataRows.map((row) => (
              <View key={row.label} style={styles.dataRow}>
                <Text style={styles.dataLabel}>{row.label}:</Text>
                <Text style={styles.dataValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.description}>{content.description}</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.quantityColumn}>{content.tableHeaders[0]}</Text>
            <Text style={styles.descriptionColumn}>{content.tableHeaders[1]}</Text>
            <Text style={styles.amountColumn}>{content.tableHeaders[2]}</Text>
            <Text style={styles.amountColumn}>{content.tableHeaders[3]}</Text>
          </View>
          {content.tableRows.length > 0 ? content.tableRows.map((row) => (
            <View key={row.id} style={styles.tableRow} wrap={false}>
              <Text style={styles.quantityColumn}>{row.quantity}</Text>
              <Text style={styles.descriptionColumn}>{row.description}</Text>
              <Text style={styles.amountColumn}>{row.unitAmount}</Text>
              <Text style={styles.amountColumn}>{row.totalAmount}</Text>
            </View>
          )) : (
            <View style={styles.tableRow}>
              <Text style={styles.descriptionColumn}>Nenhuma linha de cobrança informada.</Text>
            </View>
          )}
        </View>

        <View style={styles.summaryArea} wrap={false}>
          <View style={styles.wordsBox}>
            <Text style={styles.wordsLabel}>VALOR POR EXTENSO</Text>
            <Text>{content.totalInWords}.</Text>
          </View>
          <View style={styles.summaryBox}>
            {content.adjustmentRows.map((row) => (
              <View key={row.label} style={styles.summaryRow}>
                <Text>{row.label}</Text>
                <Text>{row.value}</Text>
              </View>
            ))}
            <View style={styles.grandTotal}>
              <Text>VALOR TOTAL</Text>
              <Text>{content.totalLabel}</Text>
            </View>
          </View>
        </View>

        {content.notes ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>OBSERVAÇÕES</Text>
            <Text style={styles.line}>{content.notes}</Text>
          </View>
        ) : null}

        <Text fixed style={styles.fiscalFooter}>{content.fiscalNotice}</Text>
      </Page>
    </Document>
  );
}

function shouldShowTradeName(snapshot: RentalInvoiceSnapshot) {
  const tradeName = snapshot.customer.tradeName.trim();
  return Boolean(tradeName)
    && tradeName.localeCompare(snapshot.customer.name, 'pt-BR', { sensitivity: 'base' }) !== 0;
}

function buildAdjustmentRows(snapshot: RentalInvoiceSnapshot) {
  const hasAdjustments = [
    snapshot.totals.discountAmount,
    snapshot.totals.surchargeAmount,
    snapshot.totals.exemptionAmount,
  ].some(isNonZero);

  if (!hasAdjustments) {
    return [];
  }

  return [
    { label: 'Subtotal', value: snapshot.totals.baseAmountLabel },
    isNonZero(snapshot.totals.discountAmount)
      ? { label: 'Desconto', value: snapshot.totals.discountAmountLabel }
      : null,
    isNonZero(snapshot.totals.surchargeAmount)
      ? { label: 'Acréscimo', value: snapshot.totals.surchargeAmountLabel }
      : null,
    isNonZero(snapshot.totals.exemptionAmount)
      ? { label: 'Isenção', value: snapshot.totals.exemptionAmountLabel }
      : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));
}

function isNonZero(value: string) {
  return Number.parseInt(value, 10) !== 0;
}
