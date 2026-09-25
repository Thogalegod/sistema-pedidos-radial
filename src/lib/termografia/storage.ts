import { buildTermografiaPhotoPath, TERMOGRAFIA_DOCUMENT_BUCKET, TermografiaPhotoKind } from './paths';
import { TermografiaFileRow } from './types';

type SupabaseLike = any;
type FileLike = {
  name: string;
  type: string;
  size: number;
};

export const TERMOGRAFIA_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function assertImageFile(file: FileLike) {
  if (!file.type?.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem para a Termografia.');
  }

  if (file.size > TERMOGRAFIA_MAX_FILE_SIZE_BYTES) {
    throw new Error('A imagem da Termografia deve ter no máximo 10 MB.');
  }
}

function normalizeBaseName(originalName: string) {
  const withoutFolders = originalName.split(/[\\/]/).pop() ?? 'imagem';
  const dotIndex = withoutFolders.lastIndexOf('.');
  const rawBase = dotIndex > 0 ? withoutFolders.slice(0, dotIndex) : withoutFolders;
  const rawExt = dotIndex > 0 ? withoutFolders.slice(dotIndex + 1) : 'jpg';
  const base = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'imagem';
  const ext = rawExt
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    || 'jpg';

  return { base, ext };
}

function defaultUniqueToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSafeTermografiaFileName(input: {
  kind: TermografiaPhotoKind;
  originalName: string;
  uniqueToken?: string;
}) {
  const { base, ext } = normalizeBaseName(input.originalName);
  return `${input.kind}-${input.uniqueToken ?? defaultUniqueToken()}-${base}.${ext}`;
}

export function isConfirmedStorageRemoval(data: unknown, storagePath: string) {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const row = item as { name?: string; path?: string };
    return row.name === storagePath || row.path === storagePath;
  });
}

async function removeStorageObjectOrThrow(client: SupabaseLike, storagePath: string) {
  const { data, error } = await client.storage
    .from(TERMOGRAFIA_DOCUMENT_BUCKET)
    .remove([storagePath]);

  if (error) throw error;
  if (!isConfirmedStorageRemoval(data, storagePath)) {
    throw new Error('Storage não confirmou a remoção do arquivo de Termografia.');
  }
}

export async function registerUploadedTermografiaFile(client: SupabaseLike, input: {
  organizationId: string;
  reportId: string;
  pointId: string;
  kind: TermografiaPhotoKind;
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
}) {
  const canonicalPath = buildTermografiaPhotoPath({
    organizationId: input.organizationId,
    reportId: input.reportId,
    pointId: input.pointId,
    fileName: input.fileName,
  });

  if (input.storagePath !== canonicalPath) {
    throw new Error('Arquivo de Termografia fora do path canônico.');
  }

  const { data, error } = await client
    .from('termografia_arquivos')
    .insert({
      organization_id: input.organizationId,
      report_id: input.reportId,
      point_id: input.pointId,
      tipo: input.kind,
      storage_path: input.storagePath,
      file_name: input.fileName,
      content_type: input.contentType,
      tamanho_bytes: input.size,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as TermografiaFileRow;
}

export async function uploadTermografiaPhoto(client: SupabaseLike, input: {
  organizationId: string;
  reportId: string;
  pointId: string;
  kind: TermografiaPhotoKind;
  file: FileLike;
  uniqueToken?: string;
}) {
  assertImageFile(input.file);

  const fileName = buildSafeTermografiaFileName({
    kind: input.kind,
    originalName: input.file.name,
    uniqueToken: input.uniqueToken,
  });
  const storagePath = buildTermografiaPhotoPath({
    organizationId: input.organizationId,
    reportId: input.reportId,
    pointId: input.pointId,
    fileName,
  });

  const { error: uploadError } = await client.storage
    .from(TERMOGRAFIA_DOCUMENT_BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  try {
    return await registerUploadedTermografiaFile(client, {
      organizationId: input.organizationId,
      reportId: input.reportId,
      pointId: input.pointId,
      kind: input.kind,
      storagePath,
      fileName,
      contentType: input.file.type,
      size: input.file.size,
    });
  } catch (error) {
    await removeStorageObjectOrThrow(client, storagePath);
    throw error;
  }
}

export async function createTermografiaSignedUrl(client: SupabaseLike, storagePath: string, expiresIn = 3600) {
  const { data, error } = await client.storage
    .from(TERMOGRAFIA_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function removeRegisteredTermografiaFile(client: SupabaseLike, file: Pick<TermografiaFileRow, 'id' | 'storage_path'>) {
  await removeStorageObjectOrThrow(client, file.storage_path);

  const { error } = await client
    .from('termografia_arquivos')
    .delete()
    .eq('id', file.id);

  if (error) throw error;
}
