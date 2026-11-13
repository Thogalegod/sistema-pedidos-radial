import { describe, expect, it, vi } from 'vitest';
import { saveTermografiaPhoto } from './storage';

const input = {
  organizationId: '552c1ecb-c3aa-40b6-836a-b8f368c7c8f4',
  reportId: '65a0cb38-3d61-442d-a48f-f0ee2c9b1e23',
  pointId: '9c772870-9d76-4717-83ed-d14b48f06aaf',
  fileId: '15dc388d-bbd1-429c-a2a1-9eb7e9036abd',
  kind: 'digital' as const,
  file: new File(['image'], 'novo.jpg', { type: 'image/jpeg' }),
  previous: { id: 'old-file', storage_path: 'old/path.jpg' },
};

function clientFixture() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const download = vi.fn().mockResolvedValue({ data: input.file, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [{ name: 'old/path.jpg' }], error: null });
  const single = vi.fn().mockResolvedValue({ data: { id: input.fileId }, error: null });
  const rpc = vi.fn(() => ({ single }));
  const query = { select: () => query, eq: () => query, maybeSingle: vi.fn().mockResolvedValue({ data: { id: input.fileId, file_name: 'novo.jpg', storage_path: 'new/path.jpg' }, error: null }) };
  return { client: { storage: { from: () => ({ upload, download, remove }) }, rpc, from: () => query }, upload, download, remove, rpc, single, query };
}

describe('substituição de foto sem apagar original antes da confirmação', () => {
  it('retoma upload sem metadados usando outro objeto, preservando o objeto incerto', async () => {
    const f = clientFixture();
    f.upload.mockResolvedValueOnce({ error: { statusCode: '400', error: 'Duplicate' } }).mockResolvedValue({ error: null });
    f.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await saveTermografiaPhoto(f.client, { ...input, previous: undefined });
    expect(f.upload).toHaveBeenCalledTimes(2);
    expect(f.upload.mock.calls[0][0]).not.toBe(f.upload.mock.calls[1][0]);
    expect(f.download).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('mantém a foto anterior quando o upload falha', async () => {
    const f = clientFixture();
    f.upload.mockResolvedValue({ error: new Error('offline') });
    await expect(saveTermografiaPhoto(f.client, input)).rejects.toThrow('offline');
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('preserva ambos os objetos quando a resposta da transação é incerta', async () => {
    const f = clientFixture();
    f.single.mockRejectedValue(new Error('resposta perdida'));
    await expect(saveTermografiaPhoto(f.client, input)).rejects.toThrow('resposta perdida');
    expect(f.remove).not.toHaveBeenCalled();
  });

  it('limpa o original somente depois da troca confirmada', async () => {
    const f = clientFixture();
    await saveTermografiaPhoto(f.client, input);
    expect(f.rpc).toHaveBeenCalledWith('save_termografia_photo', expect.objectContaining({ p_file_id: input.fileId, p_previous_file_id: 'old-file' }));
    expect(f.remove.mock.invocationCallOrder[0]).toBeGreaterThan(f.single.mock.invocationCallOrder[0]);
  });

  it('não aceita objeto de conteúdo diferente ao retomar um upload', async () => {
    const f = clientFixture();
    f.upload.mockResolvedValue({ error: { statusCode: '409' } });
    f.download.mockResolvedValue({ data: new File(['different'], 'novo.jpg'), error: null });
    await expect(saveTermografiaPhoto(f.client, input)).rejects.toThrow('conteúdo');
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
});
