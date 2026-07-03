import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhotoAnnotationDialog } from './PhotoAnnotationDialog';

vi.mock('@/lib/termografia/annotations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/termografia/annotations')>();
  return {
    ...actual,
    renderAnnotationsToCanvas: vi.fn(),
  };
});

const createObjectURL = vi.fn(() => 'blob:preview');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('PhotoAnnotationDialog', () => {
  it('renderiza diálogo acessível com canvas', () => {
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Marcar foto' })).toBeInTheDocument();
    expect(screen.getByTestId('annotation-canvas')).toBeInTheDocument();
  });

  it('cancela e fecha o diálogo', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    // Use header Cancelar (the one without disabled attr)
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancelar' });
    await user.click(cancelButtons[0]);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('fecha com Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('salvar chama onConfirm com File', async () => {
    const { renderAnnotationsToCanvas } = await import('@/lib/termografia/annotations');
    vi.mocked(renderAnnotationsToCanvas).mockResolvedValue(
      new Blob(['fake-jpeg'], { type: 'image/jpeg' }),
    );
    const onConfirm = vi.fn();
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    const arg = onConfirm.mock.calls[0][0];
    expect(arg).toBeInstanceOf(File);
    expect(arg.type).toBe('image/jpeg');
  });

  it('exibe erro e permite retry', async () => {
    const { renderAnnotationsToCanvas } = await import('@/lib/termografia/annotations');
    vi.mocked(renderAnnotationsToCanvas)
      .mockRejectedValueOnce(new Error('falha na imagem'))
      .mockResolvedValueOnce(new Blob(['ok'], { type: 'image/jpeg' }));
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('falha na imagem');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('desfazer reverte a última anotação (botão desabilitado no início)', async () => {
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const undoBtn = screen.getByRole('button', { name: 'Desfazer' });
    expect(undoBtn).toBeDisabled();
  });

  it('limpar remove todas as anotações (botão desabilitado no início)', () => {
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const clearBtn = screen.getByRole('button', { name: 'Limpar' });
    expect(clearBtn).toBeDisabled();
  });

  it('revoga a URL de preview ao desmontar', () => {
    const file = new File(['foto'], 'foto.jpg');
    const { unmount } = render(
      <PhotoAnnotationDialog file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(createObjectURL).toHaveBeenCalledWith(file);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('processando bloqueia botões', async () => {
    const { renderAnnotationsToCanvas } = await import('@/lib/termografia/annotations');
    let resolveConfirm!: () => void;
    vi.mocked(renderAnnotationsToCanvas).mockImplementation(
      () => new Promise<Blob>((resolve) => (resolveConfirm = () => resolve(new Blob(['ok'], { type: 'image/jpeg' })))),
    );
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <PhotoAnnotationDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    // Header cancel button is also disabled
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancelar' });
    expect(cancelButtons[0]).toBeDisabled();
    resolveConfirm();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
