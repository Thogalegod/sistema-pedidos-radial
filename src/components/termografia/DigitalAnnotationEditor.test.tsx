import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DigitalAnnotationEditor } from './DigitalAnnotationEditor';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('digital annotations', () => {
  it('normalizes drawing coordinates against the rendered image and preserves the original source', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const change = vi.fn();
    render(<DigitalAnnotationEditor src="blob:original" photoId="photo" annotations={[]} hotspots={[]} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desenho' }));
    expect(screen.queryByRole('button', { name: 'Seta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ponto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Círculo' })).not.toBeInTheDocument();
    const surface = screen.getByLabelText('Desenhar na foto digital');
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    fireEvent.pointerDown(surface, { clientX: 30, clientY: 40 });
    fireEvent.pointerUp(surface, { clientX: 190, clientY: 100 });
    expect(change).toHaveBeenCalledWith([expect.objectContaining({ tool: 'freehand', points: [{ x: .1, y: .2 }, { x: .9, y: .8 }] })]);
    expect(screen.getByAltText('Foto digital original')).toHaveAttribute('src', 'blob:original');
  });
  it('does not attach a deleted hotspot to a new annotation after its thermal image is removed', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const change = vi.fn();
    const props = { src: 'blob:original', photoId: 'photo', annotations: [], onChange: change };
    const view = render(<DigitalAnnotationEditor {...props} hotspots={[{ id: 'removed-hotspot', photoId: 'thermal', componente: 'Borne', temperatura: '', conclusao: '' }]} />);
    fireEvent.change(screen.getByLabelText(/Relacionar marcação/), { target: { value: 'removed-hotspot' } });
    view.rerender(<DigitalAnnotationEditor {...props} hotspots={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desenho' }));
    const surface = screen.getByLabelText('Desenhar na foto digital');
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    fireEvent.pointerDown(surface, { clientX: 25, clientY: 25 }); fireEvent.pointerUp(surface, { clientX: 25, clientY: 25 });
    expect(change.mock.calls[0][0][0]).not.toHaveProperty('hotspotId');
  });
});
