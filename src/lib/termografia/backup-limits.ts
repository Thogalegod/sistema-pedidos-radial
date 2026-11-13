import type JSZip from 'jszip';

/** Shared import/export resource limits, never point/photo count limits. */
export interface BackupImportLimits {
  maxArchiveBytes: number;
  maxManifestBytes: number;
  maxOriginalBytes: number;
  maxExpandedBytes: number;
}
export const DEFAULT_BACKUP_IMPORT_LIMITS: Readonly<BackupImportLimits> = Object.freeze({
  maxArchiveBytes: 256 * 1024 * 1024, maxManifestBytes: 2 * 1024 * 1024,
  maxOriginalBytes: 64 * 1024 * 1024, maxExpandedBytes: 256 * 1024 * 1024,
});
export function resolveBackupLimits(options: Partial<BackupImportLimits>): BackupImportLimits {
  const limits = { ...DEFAULT_BACKUP_IMPORT_LIMITS, ...options };
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)) throw resourceError('Limites de cópia inválidos.');
  return limits;
}
export function resourceError(detail: string): Error {
  return new Error(`${detail} Mantenha o ZIP original e tente uma cópia menor ou um dispositivo com mais recursos.`);
}
interface ZipMember { size: number; compressedSize: number; directory: boolean }

/** Read only classic ZIP headers. Never decompress untrusted members during preflight. */
export function inspectBackupZip(buffer: ArrayBuffer, limits: BackupImportLimits): Map<string, ZipMember> {
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  const invalid = () => resourceError('ZIP inválido ou formato de arquivo não suportado.');
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 65557)) throw invalid();
  const count = view.getUint16(end + 10, true); const centralSize = view.getUint32(end + 12, true); const offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || centralSize === 0xffffffff || offset === 0xffffffff || offset + centralSize !== end) throw invalid();
  const members = new Map<string, ZipMember>(); let cursor = offset; let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw invalid();
    const flags = view.getUint16(cursor + 8, true); const compressedSize = view.getUint32(cursor + 20, true); const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || compressedSize === 0xffffffff || size === 0xffffffff) throw invalid();
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const attrs = view.getUint32(cursor + 38, true); const directory = name.endsWith('/') || !!(attrs & 0x10) || !!((attrs >>> 16) & 0x4000);
    if (members.has(name) || !/^(manifest\.json|originals\/|originals\/[\da-f-]{36})$/i.test(name)) throw resourceError('Arquivo inesperado ou duplicado na cópia.');
    if (directory && (name !== 'originals/' || size !== 0 || compressedSize !== 0)) throw resourceError('Diretório inesperado ou com conteúdo na cópia.');
    if (!directory && name === 'originals/') throw invalid();
    // JSZip normalizes entries claiming zero expanded bytes into empty content. Reject
    // hidden compressed payloads before its loader can discard that discrepancy.
    if (size === 0 && compressedSize !== 0) throw invalid();
    const memberLimit = name === 'manifest.json' ? limits.maxManifestBytes : limits.maxOriginalBytes;
    if (size > memberLimit) throw resourceError(name === 'manifest.json' ? 'Manifesto excede o limite de leitura.' : 'Original excede o limite de leitura.');
    total += size; if (!Number.isSafeInteger(total) || total > limits.maxExpandedBytes) throw resourceError('Conteúdo expandido excede o limite de leitura.');
    const local = view.getUint32(cursor + 42, true);
    if (local + 30 > offset || view.getUint32(local, true) !== 0x04034b50) throw invalid();
    const localNameLength = view.getUint16(local + 26, true); const localExtraLength = view.getUint16(local + 28, true);
    const content = local + 30 + localNameLength + localExtraLength;
    if (content + compressedSize > offset || new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name) throw invalid();
    members.set(name, { size, compressedSize, directory }); cursor = next;
  }
  if (cursor !== end || !members.has('manifest.json') || members.get('manifest.json')!.directory) throw invalid();
  return members;
}

// internalStream is a documented JSZip public API omitted by its bundled .d.ts.
type StreamingEntry = JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> };
/** Retain at most maxBytes; pause immediately on overrun instead of accumulating a payload. */
export function readBoundedZipEntry(entry: JSZip.JSZipObject, maxBytes: number): Promise<{ blob: Blob; size: number }> {
  return new Promise((resolve, reject) => {
    const stream = (entry as StreamingEntry).internalStream('uint8array');
    const chunks: ArrayBuffer[] = []; let size = 0; let settled = false;
    const fail = (error: unknown) => { if (settled) return; settled = true; stream.pause(); chunks.length = 0; reject(error); };
    stream.on('data', chunk => {
      if (settled) return;
      if (chunk.byteLength > maxBytes - size) { fail(resourceError('Tamanho expandido excede o tamanho declarado ou limite de leitura.')); return; }
      size += chunk.byteLength; chunks.push(Uint8Array.from(chunk).buffer);
    }).on('error', () => fail(resourceError('ZIP corrompido: falha na leitura do conteúdo.')))
      .on('end', () => { if (!settled) { settled = true; resolve({ blob: new Blob(chunks), size }); } })
      .resume();
  });
}
