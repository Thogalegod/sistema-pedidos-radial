export type TermografiaPhotoKind = 'digital' | 'termica';

export const TERMOGRAFIA_DOCUMENT_BUCKET = 'termografia-docs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} inválido para o path da Termografia`);
  }
}

function assertFileName(fileName: string) {
  if (!fileName || fileName === '.' || fileName === '..' || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('Nome de arquivo inválido para a Termografia');
  }
}

export function buildTermografiaReportFolder(organizationId: string, reportId: string) {
  assertUuid(organizationId, 'Organização');
  assertUuid(reportId, 'Relatório');

  return `${organizationId}/${reportId}`;
}

export function buildTermografiaPhotoPath(input: {
  organizationId: string;
  reportId: string;
  pointId: string;
  fileName: string;
}) {
  assertUuid(input.pointId, 'Ponto');
  assertFileName(input.fileName);

  return `${buildTermografiaReportFolder(input.organizationId, input.reportId)}/${input.pointId}/${input.fileName}`;
}
