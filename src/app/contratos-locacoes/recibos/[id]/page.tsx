'use client';

import { PDFDownloadLink } from '@react-pdf/renderer';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { RentalInvoiceDocument } from '@/lib/contratos-locacoes/pdf/RentalInvoiceDocument';
import { createSupabaseContractsLocacoesReadClient, getBillingRentalInvoice } from '@/lib/contratos-locacoes/queries';
import type { RentalInvoiceSnapshot } from '@/lib/contratos-locacoes/rental-invoice';
import { supabase } from '@/lib/supabase';

export default function BillingRentalInvoicePage() {
  const params = useParams<{ id: string }>();
  const billingId = params.id;
  const [snapshot, setSnapshot] = useState<RentalInvoiceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await getBillingRentalInvoice(readClient, billingId);

        if (!cancelled) {
          setSnapshot(data);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a fatura.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [billingId]);

  return (
    <div className="space-y-4">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
        href="/contratos-locacoes/cobrancas"
      >
        <ArrowLeft size={16} />
        Voltar para cobranças
      </Link>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Carregando fatura...
        </div>
      ) : snapshot ? (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-gray-900">Fatura {snapshot.invoiceNumber}</h1>
                <p className="text-sm text-gray-600">
                  Contrato #{snapshot.contract.internalNumber} • {snapshot.customer.name}
                </p>
                <p className="text-sm text-gray-500">
                  {snapshot.site.name} • {snapshot.period.label}
                </p>
              </div>

              <PDFDownloadLink
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                document={<RentalInvoiceDocument snapshot={snapshot} />}
                fileName={snapshot.fileName}
              >
                {({ loading: pdfLoading }) => (pdfLoading ? 'Gerando PDF...' : 'Baixar fatura em PDF')}
              </PDFDownloadLink>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Dados da fatura</h2>
              <dl className="mt-3 space-y-2 text-sm text-gray-600">
                <div>
                  <dt className="font-medium text-gray-900">Período</dt>
                  <dd>{snapshot.period.label}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Emissão</dt>
                  <dd>{snapshot.issuedAtLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Vencimento</dt>
                  <dd>{snapshot.dueAtLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Pedido/OS</dt>
                  <dd>{snapshot.contract.legacyOrderNumber ?? 'Não informado'}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Situação financeira</h2>
              <dl className="mt-3 space-y-2 text-sm text-gray-600">
                <div>
                  <dt className="font-medium text-gray-900">Total</dt>
                  <dd>{snapshot.totals.totalAmountLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Recebido</dt>
                  <dd>{snapshot.financialStatus.paidAmountLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Saldo</dt>
                  <dd>{snapshot.financialStatus.balanceAmountLabel}</dd>
                </div>
              </dl>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Fatura não encontrada.
        </div>
      )}
    </div>
  );
}
