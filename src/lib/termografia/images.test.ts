import { afterEach, describe, expect, it, vi } from 'vitest';
import { nomeFotoPonto, recortarImagem } from './images';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('imagens de termografia', () => {
  it('usa o id permanente, não o índice', () => {
    expect(nomeFotoPonto('ponto-abc', 'digital')).toBe('ponto-abc-digital.jpg');
    expect(nomeFotoPonto('ponto-abc', 'termica')).toBe('ponto-abc-termica.jpg');
  });

  it('rejeita área não finita e sempre fecha o bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 80, close }));

    await expect(
      recortarImagem(new File(['foto'], 'foto.png'), {
        x: Number.NaN,
        y: 0,
        width: 10,
        height: 10,
      }),
    ).rejects.toThrow('A área de recorte é inválida.');
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejeita recortes grandes demais e fecha o bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 5_000, height: 5_000, close }),
    );

    await expect(
      recortarImagem(new File(['foto'], 'foto.png'), {
        x: 0,
        y: 0,
        width: 5_000,
        height: 5_000,
      }),
    ).rejects.toThrow('A área de recorte é grande demais.');
    expect(close).toHaveBeenCalledOnce();
  });
});
