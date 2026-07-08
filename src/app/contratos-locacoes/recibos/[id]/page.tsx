'use client';

import { PDFDownloadLink } from '@react-pdf/renderer';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { ReceiptDocument } from '@/lib/contratos-locacoes/pdf/ReceiptDocument';
import { createSupabaseContractsLocacoesReadClient, getBillingReceipt } from '@/lib/contratos-locacoes/queries';
import type { ReceiptSnapshot } from '@/lib/contratos-locacoes/receipt';
import { supabase } from '@/lib/supabase';

export default function BillingReceiptPage() {
  const params = useParams<{ id: string }>();
  const billingId = params.id;
  const [snapshot, setSnapshot] = useState<ReceiptSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const readClient = createSupabaseContractsLocacoesReadClient(supabase);
        const data = await getBillingReceipt(readClient, billingId);

        if (!cancelled) {
          setSnapshot(data);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o recibo.');
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
          Carregando recibo...
        </div>
      ) : snapshot ? (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <h1 className="text-xl font-semibold text-gray-900">Recibo {snapshot.receiptNumber}</h1>
                <p className="text-sm text-gray-600">
                  Contrato #{snapshot.contract.internalNumber} • {snapshot.customer.name}
                </p>
                <p className="text-sm text-gray-500">
                  {snapshot.site.name} • {snapshot.period.label}
                </p>
              </div>

              <PDFDownloadLink
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                document={<ReceiptDocument snapshot={snapshot} />}
                fileName={snapshot.fileName}
              >
                {({ loading: pdfLoading }) => (pdfLoading ? 'Gerando PDF...' : 'Baixar recibo em PDF')}
              </PDFDownloadLink>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Dados do recibo</h2>
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
              <h2 className="text-lg font-semibold text-gray-900">Financeiro</h2>
              <dl className="mt-3 space-y-2 text-sm text-gray-600">
                <div>
                  <dt className="font-medium text-gray-900">Total</dt>
                  <dd>{snapshot.totals.totalAmountLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Pago</dt>
                  <dd>{snapshot.totals.paidAmountLabel}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Saldo</dt>
                  <dd>{snapshot.totals.balanceAmountLabel}</dd>
                </div>
              </dl>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Recibo não encontrado.
        </div>
      )}
    </div>
  );
}
