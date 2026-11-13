import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFieldCollection, createFieldPoint } from '@/lib/termografia/field-collection';
import type { DraftStore } from '@/lib/termografia/offline-store';
import { FieldPhotos } from './FieldPhotos';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const draft = createFieldCollection({ projectId: 'p', origin: 'o', userId: 'u', organizationId: 'g' });
  const point = createFieldPoint({ setor: 'A', local: 'QGBT' }); draft.points.push(point);
  return { draft, point, disabled: false, localSaved: true, attach: vi.fn(), removePhoto: vi.fn(), updatePoint: vi.fn(), flush: vi.fn(async () => {}), store: null as DraftStore | null };
}
describe('original photo preview and external camera', () => {
  it('keeps multiple occurrences under their own digital photo', () => {
    const props = setup(); props.point.occurrenceSelected = true;
    for (const kind of ['digital', 'digital', 'termica'] as const) {
      const photo = { id: crypto.randomUUID(), pointId: props.point.id, kind, fileName: kind + '.jpg', contentType: 'image/jpeg', size: 4 };
      props.draft.photos.push(photo); props.point.photoIds.push(photo.id);
    }
    props.updatePoint.mockImplementation(update => update(props.point));
    const view = render(<FieldPhotos {...props} />);
    const first = within(screen.getByRole('region', { name: 'Foto digital 1' }));
    const second = within(screen.getByRole('region', { name: 'Foto digital 2' }));
    fireEvent.click(first.getByRole('button', { name: 'Adicionar descrição' }));
    fireEvent.click(first.getByRole('button', { name: 'Adicionar descrição' }));
    fireEvent.click(second.getByRole('button', { name: 'Adicionar descrição' }));
    view.rerender(<FieldPhotos {...props} />);
    expect(first.getAllByLabelText('Componente')).toHaveLength(2);
    expect(second.getAllByLabelText('Componente')).toHaveLength(1);
    expect(props.point.hotspots.map(h => h.digitalPhotoId)).toEqual([props.draft.photos[0].id, props.draft.photos[0].id, props.draft.photos[1].id]);
  });
  it('reports decode failure explicitly and releases the URL without deleting the original', async () => {
    const props = setup();
    const photo = { id: crypto.randomUUID(), pointId: props.point.id, kind: 'termica' as const, fileName: 'original.jpg', contentType: 'image/jpeg', size: 4 };
    props.draft.photos.push(photo); props.point.photoIds.push(photo.id);
    const getBlob = vi.fn(async () => new Blob(['foto']));
    props.store = { getBlob } as unknown as DraftStore;
    const revoke = vi.fn(); vi.stubGlobal('URL', class extends URL { static createObjectURL = () => 'blob:unchanged'; static revokeObjectURL = revoke; });
    const view = render(<FieldPhotos {...props} />);
    const image = await screen.findByAltText('Térmica original original.jpg');
    fireEvent.error(image);
    expect(screen.getByRole('alert')).toHaveTextContent('O original foi preservado');
    expect(props.removePhoto).not.toHaveBeenCalled();
    view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:unchanged');
  });
  it('exposes an Android launch only after local save settles and requires a fresh click', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
    const props = setup(); let resolve!: () => void; props.flush.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    render(<FieldPhotos {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar antes de abrir Xtherm' }));
    expect(screen.queryByRole('link', { name: /Tentar abrir Xtherm/ })).not.toBeInTheDocument();
    await act(async () => resolve());
    await waitFor(() => expect(screen.getByRole('link', { name: /Tentar abrir Xtherm/ })).toHaveAttribute('href', expect.stringContaining('com.infiRay.Xtherm')));
    expect(screen.getByLabelText('Adicionar térmicas do álbum')).toBeInTheDocument();
  });
});
