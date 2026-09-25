import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDocumentInNewTab } from './open-document-window';

afterEach(() => {
  vi.restoreAllMocks();
});

function buildOpenedWindow() {
  return {
    close: vi.fn(),
    location: { href: 'about:blank' },
    opener: window,
  };
}

describe('openDocumentInNewTab', () => {
  it('opens a blank isolated tab before loading and navigates only that tab', async () => {
    const events: string[] = [];
    const openedWindow = buildOpenedWindow();
    vi.spyOn(window, 'open').mockImplementation(() => {
      events.push('open');
      return openedWindow as unknown as Window;
    });

    await openDocumentInNewTab(async () => {
      events.push('load-url');
      return 'https://storage.example/document.pdf';
    });

    expect(events).toEqual(['open', 'load-url']);
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(openedWindow.opener).toBeNull();
    expect(openedWindow.location.href).toBe('https://storage.example/document.pdf');
    expect(openedWindow.close).not.toHaveBeenCalled();
  });

  it('closes the blank tab when loading the signed URL fails', async () => {
    const openedWindow = buildOpenedWindow();
    vi.spyOn(window, 'open').mockReturnValue(openedWindow as unknown as Window);

    await expect(
      openDocumentInNewTab(async () => {
        throw new Error('link indisponível');
      })
    ).rejects.toThrow('link indisponível');

    expect(openedWindow.close).toHaveBeenCalledTimes(1);
    expect(openedWindow.location.href).toBe('about:blank');
  });

  it('reports a blocked popup without requesting the signed URL', async () => {
    const loadSignedUrl = vi.fn().mockResolvedValue('https://storage.example/document.pdf');
    vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(openDocumentInNewTab(loadSignedUrl)).rejects.toThrow(
      'O navegador bloqueou a nova aba. Permita pop-ups para abrir o documento.'
    );
    expect(loadSignedUrl).not.toHaveBeenCalled();
  });
});
