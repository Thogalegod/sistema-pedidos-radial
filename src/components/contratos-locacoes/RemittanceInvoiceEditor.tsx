'use client';

import { useState } from 'react';
import { getContractCompanyLabel } from '@/lib/contratos-locacoes/company';
import type { RemittanceInvoiceUpdateInput } from '@/lib/contratos-locacoes/remittance-invoice-update';
import type { Contract } from '@/lib/contratos-locacoes/types';
import { CurrencyInput } from './CurrencyInput';

interface RemittanceInvoiceEditorProps {
  contract: Contract;
  hasAttachedDocument: boolean;
  onSave: (value: RemittanceInvoiceUpdateInput) => Promise<void> | void;
}

function toEditorValue(contract: Contract): RemittanceInvoiceUpdateInput {
  return {
    has_remittance_invoice: contract.has_remittance_invoice,
    remittance_invoice_number: contract.remittance_invoice_number,
    remittance_invoice_amount: contract.remittance_invoice_amount == null
      ? null
      : String(contract.remittance_invoice_amount),
    remittance_invoice_issue_date: contract.remittance_invoice_issue_date,
  };
}

export function RemittanceInvoiceEditor({
  contract,
  hasAttachedDocument,
  onSave,
}: RemittanceInvoiceEditorProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<RemittanceInvoiceUpdateInput>(() => toEditorValue(contract));
  const inputClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm';

  const openEditor = () => {
    setValue(toEditorValue(contract));
    setError(null);
    setEditing(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await onSave(
        value.has_remittance_invoice
          ? value
          : {
              has_remittance_invoice: false,
              remittance_invoice_number: null,
              remittance_invoice_amount: null,
              remittance_invoice_issue_date: null,
            }
      );
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar os dados da NF de remessa.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        className="rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        onClick={openEditor}
        type="button"
      >
        Editar dados da NF de remessa
      </button>
    );
  }

  return (
    <form className="rounded-xl border border-blue-200 bg-blue-50/60 p-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-gray-700">
          Possui NF de remessa
          <select
            className={inputClass}
            value={value.has_remittance_invoice ? 'yes' : 'no'}
            onChange={(event) => {
              const hasInvoice = event.target.value === 'yes';
              setValue((current) => ({
                ...current,
                has_remittance_invoice: hasInvoice,
                remittance_invoice_number: hasInvoice ? current.remittance_invoice_number : null,
                remittance_invoice_amount: hasInvoice ? current.remittance_invoice_amount : null,
                remittance_invoice_issue_date: hasInvoice ? current.remittance_invoice_issue_date : null,
              }));
            }}
          >
            <option disabled={hasAttachedDocument} value="no">Não</option>
            <option value="yes">Sim</option>
          </select>
        </label>

        {hasAttachedDocument ? (
          <p className="self-end text-sm text-amber-800 md:pb-2">
            Existe um arquivo de NF de remessa anexado. Os dados podem ser corrigidos, mas a locação não pode ser marcada como sem NF enquanto o anexo existir.
          </p>
        ) : null}

        {value.has_remittance_invoice ? (
          <>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Número da NF
              <input
                className={inputClass}
                required
                value={value.remittance_invoice_number ?? ''}
                onChange={(event) => setValue((current) => ({
                  ...current,
                  remittance_invoice_number: event.target.value,
                }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Empresa emissora
              <input
                className={inputClass}
                readOnly
                value={getContractCompanyLabel(contract.contract_company)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Valor da NF
              <CurrencyInput
                className={inputClass}
                value={value.remittance_invoice_amount}
                onValueChange={(amount) => setValue((current) => ({
                  ...current,
                  remittance_invoice_amount: amount,
                }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Data de emissão da NF
              <input
                className={inputClass}
                required
                type="date"
                value={value.remittance_invoice_issue_date ?? ''}
                onChange={(event) => setValue((current) => ({
                  ...current,
                  remittance_invoice_issue_date: event.target.value,
                }))}
              />
            </label>
          </>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
          disabled={saving}
          onClick={() => setEditing(false)}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Salvando...' : 'Salvar dados da NF de remessa'}
        </button>
      </div>
    </form>
  );
}
