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

function readImageBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Não foi possível conferir o conteúdo da foto.'));
    reader.readAsArrayBuffer(blob);
  });
}

// The file ID belongs to this save attempt and must be reused on retry.
// The database swaps metadata atomically; old bytes survive every failed step.
export async function saveTermografiaPhoto(client: SupabaseLike, input: {
  organizationId: string; reportId: string; pointId: string; fileId: string;
  kind: TermografiaPhotoKind; file: File;
  previous?: Pick<TermografiaFileRow, 'id' | 'storage_path'>;
}) {
  assertImageFile(input.file);
  let fileName = buildSafeTermografiaFileName({ kind: input.kind, originalName: input.file.name, uniqueToken: input.fileId });
  let storagePath = buildTermografiaPhotoPath({ ...input, fileName });
  const bucket = client.storage.from(TERMOGRAFIA_DOCUMENT_BUCKET);
  const { error } = await bucket.upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
  if (error) {
    const duplicate = [error.statusCode, error.status, error.code, error.error]
      .some(value => ['409', 'Duplicate', 'ResourceAlreadyExists'].includes(String(value)));
    if (!duplicate) throw error;
    const registered = await client.from('termografia_arquivos').select('*')
      .eq('organization_id', input.organizationId).eq('report_id', input.reportId)
      .eq('point_id', input.pointId).eq('id', input.fileId).maybeSingle();
    if (registered.error) throw registered.error;
    if (!registered.data) {
      // Unregistered objects cannot be read by policy. Upload a fresh copy;
      // preserve the uncertain object for later cleanup, never overwrite it.
      fileName = buildSafeTermografiaFileName({ kind: input.kind, originalName: input.file.name, uniqueToken: `${input.fileId}-${crypto.randomUUID()}` });
      storagePath = buildTermografiaPhotoPath({ ...input, fileName });
      const retry = await bucket.upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
      if (retry.error) throw retry.error;
    } else {
      fileName = registered.data.file_name;
      storagePath = registered.data.storage_path;
      const existing = await bucket.download(storagePath);
      if (existing.error) throw existing.error;
      if (!existing.data) throw new Error('Não foi possível conferir a foto já enviada.');
      const [original, stored] = await Promise.all([readImageBytes(input.file), readImageBytes(existing.data)]);
      const bytes = new Uint8Array(original);
      const storedBytes = new Uint8Array(stored);
      if (bytes.length !== storedBytes.length || bytes.some((byte, index) => byte !== storedBytes[index])) {
        throw new Error('O conteúdo da foto já enviada é diferente. Reabra o relatório para conferir.');
      }
    }
  }
  const result = await client.rpc('save_termografia_photo', {
    p_organization_id: input.organizationId, p_report_id: input.reportId,
    p_point_id: input.pointId, p_file_id: input.fileId, p_tipo: input.kind,
    p_file_name: fileName, p_content_type: input.file.type, p_tamanho_bytes: input.file.size,
    p_previous_file_id: input.previous?.id ?? null,
  }).single();
  if (result.error) throw result.error;
  if (!result.data || result.data.id !== input.fileId) throw new Error('O salvamento da foto não foi confirmado. Tente novamente.');
  if (input.previous && input.previous.storage_path !== storagePath) {
    // Cleanup is optional: failure must not undo a confirmed replacement.
    try { await removeStorageObjectOrThrow(client, input.previous.storage_path); } catch { /* retained for later cleanup */ }
  }
  return result.data as TermografiaFileRow;
}

export async function removeRegisteredTermografiaFile(client: SupabaseLike, file: Pick<TermografiaFileRow, 'id' | 'storage_path'>) {
  await removeStorageObjectOrThrow(client, file.storage_path);

  const { error } = await client
    .from('termografia_arquivos')
    .delete()
    .eq('id', file.id);

  if (error) throw error;
}
