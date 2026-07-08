import { formatBRL } from '@/lib/contratos-locacoes/money';
import { getContractCompanyLabel } from '@/lib/contratos-locacoes/company';
import type { ContractDetail } from '@/lib/contratos-locacoes/queries';

type ContractSummaryProps = {
  detail: ContractDetail;
};

export function ContractSummary({ detail }: ContractSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Resumo</h3>
        <dl className="mt-3 space-y-2 text-sm text-gray-600">
          <div>
            <dt className="font-medium text-gray-900">Contrato</dt>
            <dd>#{detail.contract.internal_number}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Tipo</dt>
            <dd>{detail.contract.kind}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Empresa</dt>
            <dd>{getContractCompanyLabel(detail.contract.contract_company)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Status</dt>
            <dd>{detail.contract.status}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Cliente</dt>
            <dd>{detail.customer?.legal_name ?? 'Cliente indisponível'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Obra/local</dt>
            <dd>{detail.site?.name ?? 'Local indisponível'}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Condições</h3>
        <dl className="mt-3 space-y-2 text-sm text-gray-600">
          <div>
            <dt className="font-medium text-gray-900">Início</dt>
            <dd>{detail.contract.start_date}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Fim</dt>
            <dd>{detail.contract.end_date ?? 'Sem término definido'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Recorrência</dt>
            <dd>{detail.contract.recurrence_days} dias</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Valor base</dt>
            <dd>{formatBRL(detail.contract.base_amount)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Pedido/OS</dt>
            <dd>{detail.contract.legacy_order_number ?? 'Sem referência'}</dd>
          </div>
        </dl>
      </div>

      {detail.contract.kind === 'rental' ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900">Logística e documentação</h3>
          <dl className="mt-3 space-y-2 text-sm text-gray-600">
            <div>
              <dt className="font-medium text-gray-900">Transporte</dt>
              <dd>{detail.contract.transport_notes ?? 'Não informado'}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Nota fiscal de remessa</dt>
              <dd>{detail.contract.has_remittance_invoice ? 'Sim' : 'Não'}</dd>
            </div>
            {detail.contract.has_remittance_invoice ? (
              <>
                <div>
                  <dt className="font-medium text-gray-900">Número da NF</dt>
                  <dd>{detail.contract.remittance_invoice_number}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Empresa emissora</dt>
                  <dd>{detail.contract.remittance_invoice_issuer ?? getContractCompanyLabel(detail.contract.contract_company)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Valor da NF</dt>
                  <dd>{formatBRL(detail.contract.remittance_invoice_amount)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-900">Data de emissão da NF</dt>
                  <dd>{detail.contract.remittance_invoice_issue_date}</dd>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-600">Sem NF de remessa informada</div>
            )}
          </dl>
          <p className="mt-4 text-xs text-gray-500">Anexo da NF será tratado em etapa futura.</p>
        </div>
      ) : null}
    </div>
  );
}
