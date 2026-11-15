import { describe, expect, it, vi } from 'vitest';
import {
  TERMOGRAFIA_MAX_FILE_SIZE_BYTES,
  buildSafeTermografiaFileName,
  createTermografiaSignedUrl,
  isConfirmedStorageRemoval,
  registerUploadedTermografiaFile,
  uploadTermografiaPhoto,
} from './storage';
import { TERMOGRAFIA_DOCUMENT_BUCKET } from './paths';

function fileFixture(name = 'Foto Termica 01.JPG', type = 'image/jpeg', size = 1024) {
  return { name, type, size };
}

describe('termografia storage actions', () => {
  it('builds strict safe unique file names without folders', () => {
    const name = buildSafeTermografiaFileName({
      kind: 'termica',
      originalName: 'Sub/Painel\\Foto 01.JPG',
      uniqueToken: 'abc123',
    });

    expect(name).toBe('termica-abc123-foto-01.jpg');
    expect(name).not.toMatch(/[\\/]/);
  });

  it('rejects non image files and files above the bucket limit before upload', async () => {
    const client = { storage: { from: vi.fn() } };

    await expect(uploadTermografiaPhoto(client, {
      organizationId: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      kind: 'digital',
      file: fileFixture('x.pdf', 'application/pdf'),
    })).rejects.toThrow('imagem');

    await expect(uploadTermografiaPhoto(client, {
      organizationId: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      kind: 'digital',
      file: fileFixture('x.jpg', 'image/jpeg', TERMOGRAFIA_MAX_FILE_SIZE_BYTES + 1),
    })).rejects.toThrow('10 MB');

    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it('uploads to termografia-docs without upsert true and registers the exact path', async () => {
    const upload = vi.fn(async () => ({ data: { path: 'uploaded' }, error: null }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'file-1' }, error: null })) })) }));
    const client = {
      storage: { from: vi.fn(() => ({ upload })) },
      from: vi.fn(() => ({ insert })),
    };

    await uploadTermografiaPhoto(client, {
      organizationId: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      kind: 'digital',
      file: fileFixture('painel.jpg', 'image/jpeg', 2048),
      uniqueToken: 'tok',
    });

    const expectedPath = '0f4239ca-2266-4b2f-a0a3-767791053c46/65a0cb38-3d61-442d-a48f-f0ee2c9b1e23/9c772870-9d76-4717-83ed-d14b48f06aaf/digital-tok-painel.jpg';
    expect(client.storage.from).toHaveBeenCalledWith(TERMOGRAFIA_DOCUMENT_BUCKET);
    expect(upload).toHaveBeenCalledWith(expectedPath, expect.anything(), { contentType: 'image/jpeg', upsert: false });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: 'digital',
      storage_path: expectedPath,
      file_name: 'digital-tok-painel.jpg',
      content_type: 'image/jpeg',
      tamanho_bytes: 2048,
    }));
  });

  it('removes uploaded storage object when database registration fails', async () => {
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const remove = vi.fn(async () => ({ data: [{ name: '0f4239ca-2266-4b2f-a0a3-767791053c46/65a0cb38-3d61-442d-a48f-f0ee2c9b1e23/9c772870-9d76-4717-83ed-d14b48f06aaf/digital-tok-painel.jpg' }], error: null }));
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: new Error('insert failed') })) })) }));
    const client = {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => ({ insert })),
    };

    await expect(uploadTermografiaPhoto(client, {
      organizationId: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      kind: 'digital',
      file: fileFixture('painel.jpg'),
      uniqueToken: 'tok',
    })).rejects.toThrow('insert failed');

    expect(remove).toHaveBeenCalledWith(['0f4239ca-2266-4b2f-a0a3-767791053c46/65a0cb38-3d61-442d-a48f-f0ee2c9b1e23/9c772870-9d76-4717-83ed-d14b48f06aaf/digital-tok-painel.jpg']);
  });

  it('rejects ambiguous empty storage removal results', () => {
    expect(isConfirmedStorageRemoval([], 'org/report/point/file.jpg')).toBe(false);
    expect(isConfirmedStorageRemoval([{ name: 'org/report/point/file.jpg' }], 'org/report/point/file.jpg')).toBe(true);
  });

  it('creates signed urls from the private Termografia bucket', async () => {
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signed.local' }, error: null }));
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } };

    await expect(createTermografiaSignedUrl(client, 'org/report/point/file.jpg')).resolves.toBe('https://signed.local');

    expect(client.storage.from).toHaveBeenCalledWith(TERMOGRAFIA_DOCUMENT_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith('org/report/point/file.jpg', 3600);
  });

  it('keeps file registration bound to organization, report, point and exact storage path', async () => {
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'file-1' }, error: null })) })) }));
    const client = { from: vi.fn(() => ({ insert })) };

    await registerUploadedTermografiaFile(client, {
      organizationId: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      kind: 'termica',
      storagePath: '0f4239ca-2266-4b2f-a0a3-767791053c46/65a0cb38-3d61-442d-a48f-f0ee2c9b1e23/9c772870-9d76-4717-83ed-d14b48f06aaf/termica-tok-painel.jpg',
      fileName: 'termica-tok-painel.jpg',
      contentType: 'image/jpeg',
      size: 1234,
    });

    expect(insert).toHaveBeenCalledWith({
      organization_id: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      report_id: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      point_id: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      tipo: 'termica',
      storage_path: '0f4239ca-2266-4b2f-a0a3-767791053c46/65a0cb38-3d61-442d-a48f-f0ee2c9b1e23/9c772870-9d76-4717-83ed-d14b48f06aaf/termica-tok-painel.jpg',
      file_name: 'termica-tok-painel.jpg',
      content_type: 'image/jpeg',
      tamanho_bytes: 1234,
    });
  });

  it('rejects file registration when storage path does not match the canonical path', async () => {
    const client = { from: vi.fn() };

    await expect(registerUploadedTermografiaFile(client, {
      organizationId: '0f4239ca-2266-4b2f-a0a3-767791053c46',
      reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
      pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
      kind: 'termica',
      storagePath: '0f4239ca-2266-4b2f-a0a3-767791053c46/65a0cb38-3d61-442d-a48f-f0ee2c9b1e23/9c772870-9d76-4717-83ed-d14b48f06aaf/subpasta/foto.jpg',
      fileName: 'foto.jpg',
      contentType: 'image/jpeg',
      size: 1234,
    })).rejects.toThrow('path canônico');

    expect(client.from).not.toHaveBeenCalled();
  });
});
