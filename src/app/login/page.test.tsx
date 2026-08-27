'use client';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './page';

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.replaceMock,
    refresh: mocks.refreshMock,
  }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPasswordMock,
    },
  },
}));

describe('Login page', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.replaceMock.mockReset();
    mocks.refreshMock.mockReset();
    mocks.signInWithPasswordMock.mockReset();
  });

  it('prevents the native submit, calls sign in, and shows an error when credentials are invalid', async () => {
    mocks.signInWithPasswordMock.mockResolvedValue({
      error: new Error('Invalid login credentials'),
    });

    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText('Seu e-mail de acesso'), {
      target: { value: 'qa@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Sua senha'), {
      target: { value: 'secret' },
    });

    const submitButton = screen.getByRole('button', { name: 'Entrar no Sistema' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();

    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const dispatchResult = form!.dispatchEvent(submitEvent);

    await waitFor(() => {
      expect(mocks.signInWithPasswordMock).toHaveBeenCalledWith({
        email: 'qa@example.com',
        password: 'secret',
      });
    });

    expect(dispatchResult).toBe(false);
    expect(submitEvent.defaultPrevented).toBe(true);

    expect(
      await screen.findByText('Credenciais inválidas. Verifique seu e-mail e senha.')
    ).toBeInTheDocument();
    expect(mocks.replaceMock).not.toHaveBeenCalled();
    expect(mocks.refreshMock).not.toHaveBeenCalled();
  });

  it('replaces and refreshes the home route when sign in succeeds', async () => {
    mocks.signInWithPasswordMock.mockResolvedValue({
      error: null,
    });

    render(<Login />);

    fireEvent.change(screen.getByPlaceholderText('Seu e-mail de acesso'), {
      target: { value: 'qa@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Sua senha'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar no Sistema' }));

    await waitFor(() => {
      expect(mocks.replaceMock).toHaveBeenCalledWith('/');
      expect(mocks.refreshMock).toHaveBeenCalled();
    });
  });
});
