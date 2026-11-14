'use client';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RentalAccessGate } from './RentalAccessGate';

const mocks = vi.hoisted(() => ({ user: { id: 'owner' } as { id: string } | null, rpc: vi.fn() }));
vi.mock('@/components/app-shell/AppShell', () => ({ useShellUser: () => ({ user: mocks.user, loading: false }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
afterEach(cleanup);
beforeEach(() => { mocks.user = { id: 'owner' }; mocks.rpc.mockReset(); });
const content = <RentalAccessGate><div>Dados financeiros privados</div></RentalAccessGate>;

describe('owner-only rental access', () => {
  it('does not mount private content while checking or when denied', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    render(content);
    expect(screen.queryByText('Dados financeiros privados')).not.toBeInTheDocument();
    expect(await screen.findByText(/acesso restrito/i)).toBeInTheDocument();
  });
  it('mounts content only when the database authorizes the current account', async () => {
    mocks.rpc.mockResolvedValue({ data: 'org-owner', error: null });
    render(content);
    expect(await screen.findByText('Dados financeiros privados')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('current_rental_organization');
  });
  it('hides the previous account immediately and ignores its late response', async () => {
    let finish!: (result: { data: string; error: null }) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(content);
    mocks.user = { id: 'other' };
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    view.rerender(<RentalAccessGate><div>Dados financeiros privados</div></RentalAccessGate>);
    await act(async () => { finish({ data: 'org-owner', error: null }); });
    await screen.findByText(/acesso restrito/i);
    expect(screen.queryByText('Dados financeiros privados')).not.toBeInTheDocument();
  });
  it('fails closed on network errors and allows retry without displaying database details', async () => {
    mocks.rpc.mockRejectedValue(new Error('private database detail'));
    render(content);
    await waitFor(() => expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument());
    expect(screen.queryByText(/private database detail/)).not.toBeInTheDocument();
    expect(screen.queryByText('Dados financeiros privados')).not.toBeInTheDocument();
  });
});
