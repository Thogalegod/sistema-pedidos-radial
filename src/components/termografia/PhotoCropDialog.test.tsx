import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recortarImagem } from '@/lib/termografia/images';
import { PhotoCropDialog } from './PhotoCropDialog';

vi.mock('react-easy-crop', () => ({
  default: ({ onCropComplete, minZoom, maxZoom }: {
    onCropComplete: (area: unknown, pixels: unknown) => void;
    minZoom: number;
    maxZoom: number;
  }) => (
    <button
      type="button"
      data-testid="cropper"
      data-min-zoom={minZoom}
      data-max-zoom={maxZoom}
      onClick={() => onCropComplete({}, { x: 10, y: 20, width: 100, height: 80 })}
    >
      Definir recorte
    </button>
  ),
}));

vi.mock('@/lib/termografia/images', () => ({
  recortarImagem: vi.fn(),
}));

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

describe('PhotoCropDialog', () => {
  it('oferece um diálogo acessível, recorte livre e zoom de 1 a 5', () => {
    render(
      <PhotoCropDialog file={new File(['foto'], 'foto.jpg')} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('dialog', { name: 'Recortar foto' })).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom da foto')).toHaveAttribute('min', '1');
    expect(screen.getByLabelText('Zoom da foto')).toHaveAttribute('max', '5');
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-min-zoom', '1');
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-max-zoom', '5');
  });

  it('aplica o recorte em pixels e confirma o arquivo resultante', async () => {
    const user = userEvent.setup();
    const recortado = new File(['recortada'], 'foto.jpg');
    vi.mocked(recortarImagem).mockResolvedValue(recortado);
    const onConfirm = vi.fn();
    const file = new File(['foto'], 'foto.jpg');
    render(<PhotoCropDialog file={file} onConfirm={onConfirm} onCancel={vi.fn()} />);

    await user.click(screen.getByTestId('cropper'));
    await user.click(screen.getByRole('button', { name: 'Aplicar recorte' }));

    expect(recortarImagem).toHaveBeenCalledWith(file, {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    expect(onConfirm).toHaveBeenCalledWith(recortado);
  });

  it('usa o arquivo original e mantém o diálogo bloqueado até a confirmação resolver', async () => {
    const user = userEvent.setup();
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveConfirm = resolve; }));
    const onCancel = vi.fn();
    const file = new File(['foto'], 'foto.jpg');
    render(<PhotoCropDialog file={file} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Usar original' }));

    expect(onConfirm).toHaveBeenCalledWith(file);
    expect(screen.getByText('Processando imagem…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Usar original' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aplicar recorte' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(onCancel).not.toHaveBeenCalled();

    resolveConfirm();
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });

  it('revoga a URL de preview ao desmontar', () => {
    const file = new File(['foto'], 'foto.jpg');
    const { unmount } = render(
      <PhotoCropDialog file={file} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(createObjectURL).toHaveBeenCalledWith(file);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('troca a URL de preview e revoga cada URL no momento correto', () => {
    createObjectURL.mockReturnValueOnce('blob:primeira').mockReturnValueOnce('blob:segunda');
    const props = { onConfirm: vi.fn(), onCancel: vi.fn() };
    const { rerender, unmount } = render(
      <PhotoCropDialog file={new File(['1'], 'primeira.jpg')} {...props} />,
    );

    rerender(<PhotoCropDialog file={new File(['2'], 'segunda.jpg')} {...props} />);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:primeira');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:segunda');

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:segunda');
  });

  it('exibe erro de recorte e permite tentar novamente ou cancelar', async () => {
    const user = userEvent.setup();
    vi.mocked(recortarImagem)
      .mockRejectedValueOnce(new Error('recorte indisponível'))
      .mockResolvedValueOnce(new File(['ok'], 'ok.jpg'));
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PhotoCropDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByTestId('cropper'));
    await user.click(screen.getByRole('button', { name: 'Aplicar recorte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('recorte indisponível');
    expect(screen.getByRole('button', { name: 'Aplicar recorte' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Aplicar recorte' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
  });

  it('captura rejeição da confirmação sem fechar o diálogo', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <PhotoCropDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={vi.fn().mockRejectedValue(new Error('falha ao salvar'))}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usar original' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('falha ao salvar');
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('gerencia foco, prende Tab no diálogo e restaura o foco ao fechar', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();
    const { unmount } = render(
      <PhotoCropDialog file={new File(['foto'], 'foto.jpg')} onConfirm={vi.fn()} onCancel={onCancel} />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Recortar foto' });

    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(cancelar).toHaveFocus());

    await user.tab({ shift: true });
    // O foco deve permanecer dentro do diálogo (focus trap)
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('reinicia recorte, zoom e erro quando o arquivo muda', async () => {
    const user = userEvent.setup();
    const props = { onConfirm: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(
      <PhotoCropDialog file={new File(['1'], 'primeira.jpg')} {...props} />,
    );
    await user.click(screen.getByTestId('cropper'));
    expect(screen.getByRole('button', { name: 'Aplicar recorte' })).toBeEnabled();
    await user.type(screen.getByLabelText('Zoom da foto'), '{arrowright}');

    rerender(<PhotoCropDialog file={new File(['2'], 'segunda.jpg')} {...props} />);
    expect(screen.getByRole('button', { name: 'Aplicar recorte' })).toBeDisabled();
    expect(screen.getByLabelText('Zoom da foto')).toHaveValue('1');
  });

  it('ignora a conclusão de uma operação depois de desmontar', async () => {
    const user = userEvent.setup();
    let resolveConfirm!: () => void;
    const onCancel = vi.fn();
    const { unmount } = render(
      <PhotoCropDialog
        file={new File(['foto'], 'foto.jpg')}
        onConfirm={() => new Promise<void>((resolve) => { resolveConfirm = resolve; })}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Usar original' }));
    unmount();
    resolveConfirm();
    await Promise.resolve();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('mantém a operação ao receber uma nova identidade de onCancel', async () => {
    const user = userEvent.setup();
    let resolveConfirm!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveConfirm = resolve; }));
    const primeiroOnCancel = vi.fn();
    const novoOnCancel = vi.fn();
    const file = new File(['foto'], 'foto.jpg');
    const { rerender } = render(
      <PhotoCropDialog file={file} onConfirm={onConfirm} onCancel={primeiroOnCancel} />,
    );

    await user.click(screen.getByRole('button', { name: 'Usar original' }));
    rerender(<PhotoCropDialog file={file} onConfirm={onConfirm} onCancel={novoOnCancel} />);
    resolveConfirm();

    await waitFor(() => expect(novoOnCancel).toHaveBeenCalledOnce());
    expect(primeiroOnCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Usar original' })).toBeEnabled();
  });
});
