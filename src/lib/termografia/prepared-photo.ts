import type { FieldPhoto, OfflineScope } from './field-collection';
import { buildTermografiaPhotoPath } from './paths';
import { canonicalCrop } from './photo-crop';

export const MOBILE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export interface PreparedPhoto {
  photoId: string; original: FieldPhoto; blob: Blob; width: number; height: number;
  sha256: string; fileName: string; storagePath: string; contentType: string; size: number;
}
export interface PreparedImage { blob: Blob; width: number; height: number }
export type PreparePhoto = (original: Blob, photo: FieldPhoto) => Promise<PreparedImage>;
export async function sha256Blob(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function preparedPhotoPath(scope: OfflineScope, reportId: string, photo: FieldPhoto, contentType: string) {
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif' };
  const fileName = `${photo.kind}-${photo.id}.${extensions[contentType] ?? 'image'}`;
  return { fileName, storagePath: buildTermografiaPhotoPath({ organizationId: scope.organizationId, reportId, pointId: photo.pointId, fileName }) };
}
/** Browser decoder, with a Safari-compatible Image fallback; object URLs never persist. */
async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (!blob.type.startsWith('image/') || blob.size === 0) throw new Error('Imagem vazia ou formato incompatível. O original foi preservado; selecione uma imagem compatível.');
  try {
    if (typeof createImageBitmap === 'function') {
      const image = await createImageBitmap(blob);
      if (!image.width || !image.height) { image.close(); throw new Error('Dimensões inválidas'); }
      return { source: image, width: image.width, height: image.height, release: () => image.close() };
    }
    const url = URL.createObjectURL(blob); const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Falha na decodificação')); image.src = url; });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Dimensões inválidas');
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  } catch (cause) { throw new Error('Não foi possível abrir a imagem. O original foi preservado; use uma foto JPEG/PNG compatível.', { cause }); }
}
/** Thermal evidence is unchanged; only digital photographs may become a separate resized derivative. */
export const prepareFieldPhoto: PreparePhoto = async (original, photo) => {
  const crop = canonicalCrop(photo.crop);
  if (crop && photo.kind !== 'digital') throw new Error('Somente a foto digital pode ser recortada.');
  if (photo.kind === 'termica' && original.size > MOBILE_MAX_FILE_BYTES) throw new Error('A térmica original excede 10 MiB. Ela foi preservada; selecione uma exportação menor antes do envio.');
  const decoded = await decode(original);
  try {
    if (photo.kind === 'termica' || (!crop && original.size <= 1.5 * 1024 * 1024 && Math.max(decoded.width, decoded.height) <= 2048)) {
      if (original.size > MOBILE_MAX_FILE_BYTES) throw new Error('Imagem excede o limite de 10 MiB.');
      return { blob: original, width: decoded.width, height: decoded.height };
    }
    const x = crop ? Math.min(decoded.width - 1, Math.round(crop.x * decoded.width)) : 0;
    const y = crop ? Math.min(decoded.height - 1, Math.round(crop.y * decoded.height)) : 0;
    const width = crop ? Math.max(1, Math.min(decoded.width - x, Math.round(crop.width * decoded.width))) : decoded.width;
    const height = crop ? Math.max(1, Math.min(decoded.height - y, Math.round(crop.height * decoded.height))) : decoded.height;
    const scale = Math.min(1, 2048 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Não foi possível preparar a foto digital; original preservado.');
    if (crop) context.drawImage(decoded.source, x, y, width, height, 0, 0, canvas.width, canvas.height);
    else context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [.9, .8, .7]) {
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob?.size && blob.size <= MOBILE_MAX_FILE_BYTES) break;
    }
    if (!blob?.size || blob.size > MOBILE_MAX_FILE_BYTES) throw new Error('Não foi possível preparar a digital dentro de 10 MiB; original preservado.');
    const checked = await decode(blob);
    try {
      if (checked.width !== canvas.width || checked.height !== canvas.height) throw new Error('Dimensões da foto preparada não conferem. Original preservado.');
      return { blob, width: checked.width, height: checked.height };
    } finally { checked.release(); canvas.width = canvas.height = 0; }
  } finally { decoded.release(); }
};
