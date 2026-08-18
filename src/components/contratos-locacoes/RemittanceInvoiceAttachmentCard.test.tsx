'use client';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContractDocument } from '@/lib/contratos-locacoes/types';
import { RemittanceInvoiceAttachmentCard } from './RemittanceInvoiceAttachmentCard';

afterEach(() => {
  cleanup();
});

function buildDocument(overrides: Partial<ContractDocument> = {}): ContractDocument {
  return {
    id: 'doc-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    billing_cycle_id: null,
    payment_id: null,
    inspection_id: null,
    kind: 'remittance_nf',
    storage_path: 'org-1/contract-1/remittance_nf/file.pdf',
    file_name: 'nf-remessa.pdf',
    content_type: 'application/pdf',
    created_by: 'user-1',
    created_at: '2026-07-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('RemittanceInvoiceAttachmentCard', () => {
  it('shows the attach action when there is no uploaded NF yet', () => {
    render(
      <RemittanceInvoiceAttachmentCard
        document={null}
        onOpen={() => Promise.resolve()}
        onUpload={() => Promise.resolve()}
      />
    );

    expect(screen.getByText(/anexo da nf de remessa/i)).toBeInTheDocument();
    expect(screen.getByText('Pendente de anexo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anexar NF de remessa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abrir\/baixar/i })).not.toBeInTheDocument();
  });

  it('shows the uploaded file and download action when a document exists', () => {
    render(
      <RemittanceInvoiceAttachmentCard
        document={buildDocument()}
        onOpen={() => Promise.resolve()}
        onUpload={() => Promise.resolve()}
      />
    );

    expect(screen.getByText('nf-remessa.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir\/baixar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /substituir nf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /anexar nf/i })).not.toBeInTheDocument();
    expect(screen.getByText(/substituição\/remoção de nf será tratada em etapa futura/i)).toBeInTheDocument();
  });

  it('forwards the selected file to the upload handler', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);

    render(
      <RemittanceInvoiceAttachmentCard
        document={null}
        onOpen={() => Promise.resolve()}
        onUpload={onUpload}
      />
    );

    const input = screen.getByLabelText(/arquivo da nf de remessa/i);
    const file = new File(['pdf'], 'nf.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it('uses a synchronous lock to ignore a second upload before rerender', async () => {
    let releaseUpload: (() => void) | undefined;
    const pendingUpload = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    const onUpload = vi.fn(() => pendingUpload);

    render(
      <RemittanceInvoiceAttachmentCard
        document={null}
        onOpen={() => Promise.resolve()}
        onUpload={onUpload}
      />
    );

    const input = screen.getByLabelText(/arquivo da nf de remessa/i);
    const firstFile = new File(['first'], 'primeira.pdf', { type: 'application/pdf' });
    const secondFile = new File(['second'], 'segunda.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [firstFile] } });
    fireEvent.change(input, { target: { files: [secondFile] } });

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledWith(firstFile);

    releaseUpload?.();
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
  });
});
