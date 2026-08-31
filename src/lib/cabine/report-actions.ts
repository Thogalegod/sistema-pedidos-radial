type MessageHandler = (message: string) => unknown;

type BaseReportActionInput = {
  id: string;
  number: string;
  confirmAction: (message: string) => boolean;
  showSuccess: MessageHandler;
  showError: MessageHandler;
};

export type CabineReportDeletionResult = {
  reportDeleted: true;
  storageDeleted: boolean;
  error?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

export function getCancelCabineReportConfirmation(number: string) {
  return `Cancelar o relatório ${number}? A ART será preservada.`;
}

export function getDeleteCabineReportConfirmation(number: string) {
  return `Excluir definitivamente o relatório ${number} e sua ART? Esta ação não pode ser desfeita.`;
}

export async function cancelCabineReportFromUi(
  input: BaseReportActionInput & {
    cancelReport: () => Promise<unknown>;
    onCanceled: () => void;
  }
) {
  if (!input.confirmAction(getCancelCabineReportConfirmation(input.number))) {
    return false;
  }

  try {
    await input.cancelReport();
    input.onCanceled();
    input.showSuccess(`Relatório ${input.number} cancelado com sucesso.`);
    return true;
  } catch (error) {
    input.showError(`Não foi possível cancelar ${input.number}: ${errorMessage(error)}`);
    return false;
  }
}

export async function deleteCabineReportFromUi(
  input: BaseReportActionInput & {
    deleteReport: () => Promise<CabineReportDeletionResult>;
    onDeleted: () => void;
  }
) {
  const confirmed = input.confirmAction(getDeleteCabineReportConfirmation(input.number));
  if (!confirmed) return false;

  try {
    const result = await input.deleteReport();
    input.onDeleted();

    if (!result.storageDeleted) {
      input.showError(
        result.error ??
          'Relatório excluído, mas pode ter restado um objeto órfão no Storage.'
      );
      return false;
    }

    input.showSuccess(`Relatório ${input.number} e sua ART foram excluídos.`);
    return true;
  } catch (error) {
    input.showError(`Não foi possível excluir ${input.number}: ${errorMessage(error)}`);
    return false;
  }
}
