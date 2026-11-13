import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflinePreparation } from './useOfflinePreparation';

const mock = vi.hoisted(() => ({ status: vi.fn(), prepare: vi.fn() }));
vi.mock('@/lib/termografia/offline-shell', () => ({ getOfflineReadiness: mock.status, prepareOfflineShell: mock.prepare }));
beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  mock.status.mockReset().mockResolvedValue({ ready: false });
  mock.prepare.mockReset().mockResolvedValue({ ready: true, buildId: 'new' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('automatic offline preparation', () => {
  it('starts when the collector is available, without asking for storage permission', async () => {
    const view = renderHook(({ enabled }) => useOfflinePreparation(enabled), { initialProps: { enabled: false } });
    expect(mock.prepare).not.toHaveBeenCalled();
    view.rerender({ enabled: true });
    await waitFor(() => expect(view.result.current.readiness.ready).toBe(true));
    expect(mock.prepare).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { requestPersistence: false });
  });
  it('uses the saved readiness offline and prepares when connection returns', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mock.status.mockResolvedValue({ ready: true, buildId: 'old' });
    const view = renderHook(() => useOfflinePreparation(true));
    await waitFor(() => expect(view.result.current.readiness.ready).toBe(true));
    expect(view.result.current.online).toBe(false);
    expect(mock.prepare).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(view.result.current.readiness.buildId).toBe('new'));
  });
  it('coalesces repeated online events and manual retries while preparing', async () => {
    let finish!: (value: { ready: boolean }) => void;
    mock.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderHook(() => useOfflinePreparation(true));
    await waitFor(() => expect(mock.prepare).toHaveBeenCalledOnce());
    act(() => { window.dispatchEvent(new Event('online')); void view.result.current.prepareOffline(); });
    expect(mock.prepare).toHaveBeenCalledOnce();
    await act(async () => finish({ ready: true }));
    expect(view.result.current.preparingOffline).toBe(false);
  });
  it('preserves a verified older build after failure and allows retry', async () => {
    mock.status.mockResolvedValue({ ready: true, buildId: 'old' });
    mock.prepare.mockRejectedValueOnce(new Error('Conexão interrompida'));
    const view = renderHook(() => useOfflinePreparation(true));
    await waitFor(() => expect(view.result.current.offlineError).toContain('Conexão interrompida'));
    expect(view.result.current.readiness.buildId).toBe('old');
    expect(view.result.current.preparingOffline).toBe(false);
    await act(() => view.result.current.prepareOffline());
    expect(view.result.current.readiness.buildId).toBe('new');
    expect(view.result.current.offlineError).toBeUndefined();
  });
  it('does not publish a late completion after collector access is revoked', async () => {
    let finish!: (value: { ready: boolean }) => void;
    mock.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderHook(({ enabled }) => useOfflinePreparation(enabled), { initialProps: { enabled: true } });
    await waitFor(() => expect(mock.prepare).toHaveBeenCalledOnce());
    view.rerender({ enabled: false });
    await act(async () => finish({ ready: true }));
    expect(view.result.current.readiness.ready).toBe(false);
    act(() => window.dispatchEvent(new Event('online')));
    expect(mock.prepare).toHaveBeenCalledOnce();
  });
});
