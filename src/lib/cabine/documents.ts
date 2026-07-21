export const CABINE_DOCUMENT_SIGNED_URL_TTL_SECONDS = 3600;
export const CABINE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CABINE_DOCUMENT_BUCKET = 'documentos-cabine';

type PathOperation = (path: string) => Promise<unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildCabineDocumentPath(
  organizationId: string,
  reportId: string,
  fileName: string
) {
  if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(reportId)) {
    throw new Error('Organização ou relatório inválido para o path da ART');
  }

  if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Nome de arquivo inválido para a ART');
  }

  if (!fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error('Somente arquivos PDF podem ser anexados à ART');
  }

  return `${organizationId}/${reportId}/${fileName}`;
}

export async function getCabineDocumentSignedUrl(
  storagePath: string,
  createSignedUrl: (
    path: string,
    expiresInSeconds: number
  ) => Promise<{ signedUrl?: string | null }>
) {
  const result = await createSignedUrl(storagePath, CABINE_DOCUMENT_SIGNED_URL_TTL_SECONDS);

  if (!result.signedUrl) {
    throw new Error('Não foi possível criar a URL assinada da ART');
  }

  return result.signedUrl;
}

export async function uploadAndAttachCabineArt(input: {
  organizationId: string;
  reportId: string;
  fileName: string;
  uploadDocument: PathOperation;
  attachDocument: PathOperation;
  removeDocument: PathOperation;
}) {
  const storagePath = buildCabineDocumentPath(
    input.organizationId,
    input.reportId,
    input.fileName
  );

  await input.uploadDocument(storagePath);

  try {
    await input.attachDocument(storagePath);
  } catch (attachError) {
    try {
      await input.removeDocument(storagePath);
    } catch (cleanupError) {
      const attachMessage = attachError instanceof Error ? attachError.message : 'erro desconhecido';
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'erro desconhecido';
      throw new Error(
        `Relatório criado sem ART porque a vinculação falhou (${attachMessage}); ` +
          `a limpeza também falhou (${cleanupMessage}) e pode ter restado um objeto órfão no Storage.`
      );
    }

    const attachMessage = attachError instanceof Error ? attachError.message : 'erro desconhecido';
    throw new Error(
      `Relatório criado sem ART; o upload recém-enviado foi removido após falha na vinculação (${attachMessage}).`
    );
  }

  return storagePath;
}

export async function deleteCabineReportThenDocument(input: {
  artStoragePath: string | null;
  deleteReport: () => Promise<unknown>;
  removeDocument: PathOperation;
}) {
  const preservedStoragePath = input.artStoragePath;

  await input.deleteReport();

  if (!preservedStoragePath) return;

  try {
    await input.removeDocument(preservedStoragePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    throw new Error(
      `Relatório excluído, mas pode ter restado um objeto órfão no Storage: ${message}`
    );
  }
}
