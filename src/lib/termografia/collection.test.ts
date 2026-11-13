import { describe, expect, it, vi } from 'vitest';
import { createCollectionProgress, saveCollection } from './collection';

describe('retomada da coleta na mesma aba', () => {
  it('reutiliza IDs e a foto já confirmada depois de falhar o segundo upload', async () => {
    const report = vi.fn().mockResolvedValue({ id: 'report', organization_id: 'org' });
    const point = vi.fn().mockResolvedValue({ id: 'point' });
    const photo = vi.fn().mockResolvedValueOnce({ id: 'digital' }).mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ id: 'termica' });
    const prepare = vi.fn(async (file: File) => file);
    const deps = { report, point, photo, prepare };
    const progress = createCollectionProgress();
    const input = { report: { cliente_nome: 'QA', data_execucao: '2026-11-11' }, points: [
      { id: 'local', setor: 'Setor', local: 'Quadro', inspecionado: true, ocorrencia: false,
        _fotoDigitalFile: new File(['digital'], 'digital.jpg', { type: 'image/jpeg' }),
        _fotoTermicaFile: new File(['termica'], 'termica.jpg', { type: 'image/jpeg' }) },
    ] };
    await expect(saveCollection({}, input, progress, deps)).rejects.toThrow('rede');
    await expect(saveCollection({}, input, progress, deps)).resolves.toBe('report');
    expect(report.mock.calls[0][2]).toBe(report.mock.calls[1][2]);
    expect(point.mock.calls[0][4]).toBe(point.mock.calls[1][4]);
    expect(photo).toHaveBeenCalledTimes(3);
    expect(photo.mock.calls[1][1].fileId).toBe(photo.mock.calls[2][1].fileId);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
