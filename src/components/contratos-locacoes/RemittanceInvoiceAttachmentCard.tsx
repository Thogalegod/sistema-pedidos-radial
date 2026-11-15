'use client';

import { useRef } from 'react';
import type { ContractDocument } from '@/lib/contratos-locacoes/types';

type RemittanceInvoiceAttachmentCardProps = {
  document: ContractDocument | null;
  onOpen: () => Promise<void> | void;
  onUpload: (file: File) => Promise<void> | void;
  opening?: boolean;
  uploading?: boolean;
};

export function RemittanceInvoiceAttachmentCard({
  document,
  onOpen,
  onUpload,
  opening = false,
  uploading = false,
}: RemittanceInvoiceAttachmentCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadLockRef = useRef(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';

    if (!file || uploadLockRef.current) {
      return;
    }

    uploadLockRef.current = true;
    try {
      await onUpload(file);
    } finally {
      uploadLockRef.current = false;
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">Anexo da NF de remessa</p>
          {document ? (
            <p className="truncate text-sm text-gray-600">{document.file_name}</p>
          ) : (
            <p className="text-sm font-medium text-amber-700">Pendente de anexo</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {document ? (
            <>
              <button
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={opening || uploading}
                onClick={() => void onOpen()}
                type="button"
              >
                {opening ? 'Abrindo...' : 'Abrir/Baixar'}
              </button>
              <p className="w-full text-xs text-gray-500 md:max-w-64">
                Substituição/remoção de NF será tratada em etapa futura.
              </p>
            </>
          ) : (
            <button
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={uploading || opening}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {uploading ? 'Enviando...' : 'Anexar NF de remessa'}
            </button>
          )}
        </div>
      </div>

      {document ? null : (
        <input
          accept=".pdf,.xml,image/png,image/jpeg,.jpg,.jpeg"
          aria-label="Arquivo da NF de remessa"
          className="sr-only"
          onChange={(event) => void handleFileChange(event)}
          ref={inputRef}
          type="file"
        />
      )}
    </div>
  );
}
