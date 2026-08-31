import { describe, expect, it, vi } from 'vitest';
import {
  cancelCabineReportFromUi,
  deleteCabineReportFromUi,
} from './report-actions';

const report = {
  id: 'f819482f-f473-44b9-bc00-90a6e0717f11',
  number: 'RC-202607-001',
};

describe('Cabine report cancellation UI workflow', () => {
  it('asks for confirmation, updates the status, and shows success', async () => {
    const events: string[] = [];

    await expect(
      cancelCabineReportFromUi({
        ...report,
        confirmAction: (message) => {
          events.push(`confirm:${message}`);
          return true;
        },
        cancelReport: async () => events.push('cancel-report'),
        onCanceled: () => events.push('status:cancelado'),
        showSuccess: (message) => events.push(`success:${message}`),
        showError: (message) => events.push(`error:${message}`),
      })
    ).resolves.toBe(true);

    expect(events).toEqual([
      'confirm:Cancelar o relatório RC-202607-001? A ART será preservada.',
      'cancel-report',
      'status:cancelado',
      'success:Relatório RC-202607-001 cancelado com sucesso.',
    ]);
  });

  it('does not cancel when confirmation is refused', async () => {
    const cancelReport = vi.fn();

    await expect(
      cancelCabineReportFromUi({
        ...report,
        confirmAction: () => false,
        cancelReport,
        onCanceled: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn(),
      })
    ).resolves.toBe(false);

    expect(cancelReport).not.toHaveBeenCalled();
  });

  it('shows the cancellation failure and does not update the interface', async () => {
    const onCanceled = vi.fn();
    const showError = vi.fn();

    await expect(
      cancelCabineReportFromUi({
        ...report,
        confirmAction: () => true,
        cancelReport: async () => {
          throw new Error('registro não encontrado na organização');
        },
        onCanceled,
        showSuccess: vi.fn(),
        showError,
      })
    ).resolves.toBe(false);

    expect(onCanceled).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      'Não foi possível cancelar RC-202607-001: registro não encontrado na organização'
    );
  });
});

describe('Cabine report deletion UI workflow', () => {
  it('requires explicit confirmation before deleting', async () => {
    const deleteReport = vi.fn();

    await expect(
      deleteCabineReportFromUi({
        ...report,
        confirmAction: () => false,
        deleteReport,
        onDeleted: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn(),
      })
    ).resolves.toBe(false);

    expect(deleteReport).not.toHaveBeenCalled();
  });

  it('removes the item only after report and Storage deletion succeed', async () => {
    const events: string[] = [];

    await expect(
      deleteCabineReportFromUi({
        ...report,
        confirmAction: (message) => {
          events.push(`confirm:${message}`);
          return true;
        },
        deleteReport: async () => {
          events.push('delete-report-then-storage');
          return { reportDeleted: true, storageDeleted: true };
        },
        onDeleted: () => events.push('remove-from-interface'),
        showSuccess: (message) => events.push(`success:${message}`),
        showError: (message) => events.push(`error:${message}`),
      })
    ).resolves.toBe(true);

    expect(events).toEqual([
      'confirm:Excluir definitivamente o relatório RC-202607-001 e sua ART? Esta ação não pode ser desfeita.',
      'delete-report-then-storage',
      'remove-from-interface',
      'success:Relatório RC-202607-001 e sua ART foram excluídos.',
    ]);
  });

  it('keeps the item when database deletion fails', async () => {
    const onDeleted = vi.fn();
    const showError = vi.fn();

    await expect(
      deleteCabineReportFromUi({
        ...report,
        confirmAction: () => true,
        deleteReport: async () => {
          throw new Error('Falha ao excluir o relatório');
        },
        onDeleted,
        showSuccess: vi.fn(),
        showError,
      })
    ).resolves.toBe(false);

    expect(onDeleted).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(
      'Não foi possível excluir RC-202607-001: Falha ao excluir o relatório'
    );
  });

  it('removes the deleted record and warns about a possible orphan when Storage fails', async () => {
    const onDeleted = vi.fn();
    const showError = vi.fn();

    await expect(
      deleteCabineReportFromUi({
        ...report,
        confirmAction: () => true,
        deleteReport: async () => ({
          reportDeleted: true,
          storageDeleted: false,
          error: 'Relatório excluído, mas pode ter restado um objeto órfão no Storage: timeout',
        }),
        onDeleted,
        showSuccess: vi.fn(),
        showError,
      })
    ).resolves.toBe(false);

    expect(onDeleted).toHaveBeenCalledOnce();
    expect(showError).toHaveBeenCalledWith(
      'Relatório excluído, mas pode ter restado um objeto órfão no Storage: timeout'
    );
  });
});
