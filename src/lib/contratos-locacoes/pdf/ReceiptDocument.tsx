import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ReceiptSnapshot } from '../receipt';

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#4b5563',
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoColumn: {
    flexGrow: 1,
    width: '50%',
  },
  line: {
    marginBottom: 3,
  },
  table: {
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  colDescription: {
    width: '52%',
    paddingRight: 8,
  },
  colQty: {
    width: '12%',
  },
  colUnit: {
    width: '18%',
  },
  colTotal: {
    width: '18%',
  },
  totalsBox: {
    alignSelf: 'flex-end',
    width: 220,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 10,
    gap: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalStrong: {
    fontWeight: 700,
  },
});

interface ReceiptDocumentProps {
  snapshot: ReceiptSnapshot;
}

export function ReceiptDocument({ snapshot }: ReceiptDocumentProps) {
  return (
    <Document
      author="Radial Energia"
      creator="Sistema Pedidos Radial"
      subject={`Recibo ${snapshot.receiptNumber}`}
      title={`Recibo ${snapshot.receiptNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Recibo de Locação</Text>
          <Text style={styles.subtitle}>
            Documento financeiro: {snapshot.receiptNumber} • Período {snapshot.period.sequenceNumber.toString().padStart(3, '0')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identificação</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoColumn}>
              <Text style={styles.line}>Cliente: {snapshot.customer.name}</Text>
              <Text style={styles.line}>Nome fantasia: {snapshot.customer.tradeName}</Text>
              <Text style={styles.line}>Documento: {snapshot.customer.taxId ?? 'Não informado'}</Text>
              <Text style={styles.line}>Contrato/locação: #{snapshot.contract.internalNumber}</Text>
              <Text style={styles.line}>Pedido/OS: {snapshot.contract.legacyOrderNumber ?? 'Não informado'}</Text>
            </View>
            <View style={styles.infoColumn}>
              <Text style={styles.line}>Obra/local: {snapshot.site.name}</Text>
              <Text style={styles.line}>Endereço: {snapshot.site.addressLabel}</Text>
              <Text style={styles.line}>Emissão: {snapshot.issuedAtLabel}</Text>
              <Text style={styles.line}>Vencimento: {snapshot.dueAtLabel}</Text>
              <Text style={styles.line}>Período: {snapshot.period.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itens da locação</Text>
          {snapshot.items.length === 0 ? (
            <Text>Nenhum item manual vinculado a esta locação.</Text>
          ) : (
            snapshot.items.map((item) => (
              <Text key={item.id} style={styles.line}>
                {item.description} • {item.equipmentLabel} • Qtd {item.quantity} • {item.unitAmountLabel}
              </Text>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Linhas de cobrança</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colDescription}>Descrição</Text>
              <Text style={styles.colQty}>Qtd</Text>
              <Text style={styles.colUnit}>Unitário</Text>
              <Text style={styles.colTotal}>Total</Text>
            </View>
            {snapshot.lines.map((line) => (
              <View key={line.id} style={styles.row}>
                <Text style={styles.colDescription}>{line.description}</Text>
                <Text style={styles.colQty}>{line.quantity}</Text>
                <Text style={styles.colUnit}>{line.unitAmountLabel}</Text>
                <Text style={styles.colTotal}>{line.totalAmountLabel}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text>Total do recibo</Text>
              <Text>{snapshot.totals.totalAmountLabel}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Pago</Text>
              <Text>{snapshot.totals.paidAmountLabel}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalStrong}>Saldo em aberto</Text>
              <Text style={styles.totalStrong}>{snapshot.totals.balanceAmountLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <Text>{snapshot.notes ?? 'Sem observações adicionais.'}</Text>
        </View>

        <Text style={styles.subtitle}>Gerado em {snapshot.generatedAtLabel}</Text>
      </Page>
    </Document>
  );
}
