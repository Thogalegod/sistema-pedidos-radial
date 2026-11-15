import { describe, expect, it, vi } from 'vitest';
import {
  CABINE_DOCUMENT_SIGNED_URL_TTL_SECONDS,
  assertCabineDocumentRemoved,
  buildCabineDocumentPath,
  deleteCabineReportThenDocument,
  getCabineDocumentSignedUrl,
  uploadAndAttachCabineArt,
} from './documents';

const organizationId = '0f4239ca-2266-4b2f-a0a3-767791053c46';
const reportId = '1080fd6e-c94e-4e38-80a6-a829f1d75641';
const fileName = 'art-20260721T133500000Z.pdf';
const storagePath = `${organizationId}/${reportId}/${fileName}`;

describe('Cabine document paths and signed URLs', () => {
  it('builds the exact organization/report/file path', () => {
    expect(buildCabineDocumentPath(organizationId, reportId, fileName)).toBe(storagePath);
  });

  it('rejects nested or non-PDF filenames', () => {
    expect(() => buildCabineDocumentPath(organizationId, reportId, 'nested/art.pdf')).toThrow(
      'Nome de arquivo inválido'
    );
    expect(() => buildCabineDocumentPath(organizationId, reportId, 'art.jpg')).toThrow(
      'Somente arquivos PDF'
    );
  });

  it('creates an expiring signed URL without persisting it', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      signedUrl: 'https://signed.example/art.pdf',
    });

    await expect(getCabineDocumentSignedUrl(storagePath, createSignedUrl)).resolves.toBe(
      'https://signed.example/art.pdf'
    );
    expect(createSignedUrl).toHaveBeenCalledWith(
      storagePath,
      CABINE_DOCUMENT_SIGNED_URL_TTL_SECONDS
    );
  });
});

describe('Cabine ART upload compensation', () => {
  it('uploads first and attaches the resulting path to the existing report', async () => {
    const events: string[] = [];
    const uploadDocument = vi.fn(async (path: string) => events.push(`upload:${path}`));
    const attachDocument = vi.fn(async (path: string) => events.push(`attach:${path}`));
    const removeDocument = vi.fn(async (path: string) => events.push(`remove:${path}`));

    await expect(
      uploadAndAttachCabineArt({
        organizationId,
        reportId,
        fileName,
        uploadDocument,
        attachDocument,
        removeDocument,
      })
    ).resolves.toBe(storagePath);

    expect(events).toEqual([`upload:${storagePath}`, `attach:${storagePath}`]);
    expect(removeDocument).not.toHaveBeenCalled();
  });

  it('removes only the newly uploaded object when attaching fails', async () => {
    const events: string[] = [];

    await expect(
      uploadAndAttachCabineArt({
        organizationId,
        reportId,
        fileName,
        uploadDocument: async (path) => events.push(`upload:${path}`),
        attachDocument: async (path) => {
          events.push(`attach:${path}`);
          throw new Error('database update failed');
        },
        removeDocument: async (path) => events.push(`remove:${path}`),
      })
    ).rejects.toThrow('Relatório criado sem ART; o upload recém-enviado foi removido');

    expect(events).toEqual([
      `upload:${storagePath}`,
      `attach:${storagePath}`,
      `remove:${storagePath}`,
    ]);
  });

  it('signals a possible orphan when attachment and cleanup both fail', async () => {
    await expect(
      uploadAndAttachCabineArt({
        organizationId,
        reportId,
        fileName,
        uploadDocument: async () => undefined,
        attachDocument: async () => {
          throw new Error('database update failed');
        },
        removeDocument: async () => {
          throw new Error('storage cleanup failed');
        },
      })
    ).rejects.toThrow('pode ter restado um objeto órfão no Storage');
  });
});

describe('Cabine report deletion ordering', () => {
  it('rejects a successful Storage response that did not remove the requested path', () => {
    expect(() =>
      assertCabineDocumentRemoved(storagePath, { data: [], error: null })
    ).toThrow('Storage não confirmou a remoção da ART');
  });

  it('accepts Storage confirmation only for the requested path', () => {
    expect(() =>
      assertCabineDocumentRemoved(storagePath, {
        data: [{ name: storagePath }],
        error: null,
      })
    ).not.toThrow();
  });

  it('deletes the report before removing the preserved Storage path', async () => {
    const events: string[] = [];

    await deleteCabineReportThenDocument({
      artStoragePath: storagePath,
      deleteReport: async () => events.push('delete-report'),
      removeDocument: async (path) => events.push(`remove:${path}`),
    });

    expect(events).toEqual(['delete-report', `remove:${storagePath}`]);
  });

  it('does not remove the object when database deletion fails', async () => {
    const removeDocument = vi.fn();

    await expect(
      deleteCabineReportThenDocument({
        artStoragePath: storagePath,
        deleteReport: async () => {
          throw new Error('database delete failed');
        },
        removeDocument,
      })
    ).rejects.toThrow('database delete failed');

    expect(removeDocument).not.toHaveBeenCalled();
  });

  it('signals a possible orphan when Storage fails after database deletion', async () => {
    await expect(
      deleteCabineReportThenDocument({
        artStoragePath: storagePath,
        deleteReport: async () => undefined,
        removeDocument: async () => {
          throw new Error('storage delete failed');
        },
      })
    ).rejects.toThrow('Relatório excluído, mas pode ter restado um objeto órfão no Storage');
  });

  it('signals a possible orphan when Storage returns an empty removal result', async () => {
    await expect(
      deleteCabineReportThenDocument({
        artStoragePath: storagePath,
        deleteReport: async () => undefined,
        removeDocument: async (path) =>
          assertCabineDocumentRemoved(path, { data: [], error: null }),
      })
    ).rejects.toThrow('Relatório excluído, mas pode ter restado um objeto órfão no Storage');
  });
});
