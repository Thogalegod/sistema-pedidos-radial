import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DigitalPhotoCropper } from './DigitalPhotoCropper';

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }) });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }) });
});
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); vi.restoreAllMocks(); });
function setup(hasDrawings = false) {
  const onSave = vi.fn(async () => true), onCancel = vi.fn();
  render(<DigitalPhotoCropper src="blob:photo" hasDrawings={hasDrawings} onSave={onSave} onCancel={onCancel} />);
  fireEvent.load(screen.getByAltText('Foto inteira para recortar'));
  return { onSave, onCancel };
}
describe('digital crop controls', () => {
  it('can cancel without applying and never enables save before a selection changes', () => {
    const props = setup();
    expect(screen.getByRole('button', { name: 'Aplicar recorte' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Canto superior esquerdo' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(props.onSave).not.toHaveBeenCalled(); expect(props.onCancel).toHaveBeenCalledOnce();
  });
  it('adjusts a crop, asks explicitly to clear drawings and keeps open on a save failure', async () => {
    const props = setup(true); props.onSave.mockResolvedValue(false);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Canto superior esquerdo' }), { key: 'ArrowRight' });
    expect(screen.getByRole('note')).toHaveTextContent('descrições das ocorrências serão mantidas');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar e limpar desenhos' }));
    await screen.findByRole('alert');
    expect(props.onSave).toHaveBeenCalledWith({ x: .02, y: 0, width: .98, height: 1 });
    expect(props.onCancel).not.toHaveBeenCalled();
  });
  it('restores the complete image only after confirmation', async () => {
    const onSave = vi.fn(async () => true), onCancel = vi.fn();
    render(<DigitalPhotoCropper src="blob:photo" crop={{ x: .2, y: .2, width: .5, height: .5 }} hasDrawings={false} onSave={onSave} onCancel={onCancel} />);
    fireEvent.load(screen.getByAltText('Foto inteira para recortar'));
    fireEvent.click(screen.getByRole('button', { name: 'Foto inteira' }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar recorte' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(undefined);
  });
});
