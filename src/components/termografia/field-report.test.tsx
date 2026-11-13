import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFieldPoint, pointMetadata } from '@/lib/termografia/field-collection';
import { mapTermografiaReport } from '@/lib/termografia/report-actions';
import { FieldPrintReport } from './FieldPrintReport';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/termografia/storage', () => ({ createTermografiaSignedUrl: vi.fn(async (_client, path) => `https://images.test/${path}`) }));
afterEach(cleanup);
function fixture() {
  const p = createFieldPoint({ setor: 'Setor A', local: 'Q01' });
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]; p.photoIds = ids; p.inspectionStatus = 'inspected';
  p.hotspots = [0, 1, 2].map((n) => ({ id: crypto.randomUUID(), photoId: ids[n === 2 ? 2 : 1], componente: `Componente ${n + 1}`, temperatura: '60', conclusao: '', descricao: `Descrição do aquecimento ${n + 1}` }));
  p.annotations = [{ id: crypto.randomUUID(), photoId: ids[0], hotspotId: p.hotspots[0].id, tool: 'point', color: '#ff0000', strokeWidth: .01, points: [{ x: .2, y: .3 }] }];
  return mapTermografiaReport({ report: { id: crypto.randomUUID(), mobile_sync_state: 'complete', cliente_nome: 'Cliente', data_execucao: '2026-11-12', equipamento: 'InfiRay T2S Plus' }, points: [{ id: p.id, setor: p.setor, local: p.local, metadados_coleta: pointMetadata(p) }], files: ids.map((id, n) => ({ id, point_id: p.id, tipo: n ? 'termica' : 'digital', storage_path: `photo-${n}`, file_name: `photo-${n}.jpg` })) });
}
describe('complete versioned print report', () => {
  it('includes every thermal image, multiple hotspot descriptions and only digital annotations', async () => {
    render(<FieldPrintReport report={fixture()} />);
    await waitFor(() => expect(screen.getAllByAltText(/Foto térmica T/)).toHaveLength(3));
    expect(screen.getAllByAltText(/Foto digital D/)).toHaveLength(1);
    expect(screen.getByText('Descrição do aquecimento 1')).toBeVisible();
    expect(screen.getByText('Descrição do aquecimento 2')).toBeVisible();
    expect(screen.getByText('Descrição do aquecimento 3')).toBeVisible();
    expect(screen.getAllByRole('img', { name: 'Identificação dos componentes' })).toHaveLength(1);
    expect(screen.getByText('InfiRay T2S Plus')).toBeVisible();
  });
  it('does not print when an image fails to decode', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const oldDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockRejectedValue(new Error('decode')) });
    render(<FieldPrintReport report={fixture()} />);
    const button = screen.getByRole('button', { name: 'Imprimir / salvar PDF' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(/foto|imagem/i);
    expect(print).not.toHaveBeenCalled();
    if (oldDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', oldDecode); else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
    print.mockRestore();
  });
  it('does not print if a photo disappears or the report unmounts while waiting for fonts', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const oldFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    const oldDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    for (const unmount of [false, true]) {
      let ready = () => {};
      Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise<void>(resolve => { ready = resolve; }) } });
      const view = render(<FieldPrintReport report={fixture()} />);
      const button = screen.getByRole('button', { name: 'Imprimir / salvar PDF' });
      await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
      if (unmount) view.unmount(); else fireEvent.error(screen.getAllByAltText(/Foto térmica T/)[0]);
      await act(async () => { ready(); });
      expect(print).not.toHaveBeenCalled();
      view.unmount();
    }
    if (oldFonts) Object.defineProperty(document, 'fonts', oldFonts); else Reflect.deleteProperty(document, 'fonts');
    if (oldDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', oldDecode); else Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
    print.mockRestore();
  });
});
