import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Login from './page';
import ResetPassword from '../redefinir-senha/page';

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(), getSession: vi.fn(), updateUser: vi.fn(),
  onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ supabase: { auth } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, '', '/');
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.updateUser.mockResolvedValue({ error: null });
});
afterEach(cleanup);

it('solicita recuperação com destino na mesma origem, sem exigir senha', async () => {
  render(<Login />);
  fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }));
  await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('teste@example.com', {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('Se houver uma conta');
});

it('permite tentar novamente após falha de rede ao solicitar o link', async () => {
  auth.resetPasswordForEmail.mockRejectedValue(new Error('network'));
  render(<Login />);
  fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar link de recuperação' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');
  expect(screen.getByRole('button', { name: 'Enviar link de recuperação' })).toBeEnabled();
});

it('bloqueia redefinição sem sessão e oferece novo link', async () => {
  render(<ResetPassword />);
  expect(await screen.findByRole('alert')).toHaveTextContent('inválido ou expirado');
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
  expect(auth.updateUser).not.toHaveBeenCalled();
});

it('rejeita link expirado mesmo com uma sessão anterior', async () => {
  window.history.replaceState({}, '', '/redefinir-senha#error=access_denied&error_code=otp_expired');
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } }, error: null });
  render(<ResetPassword />);
  expect(await screen.findByRole('alert')).toHaveTextContent('inválido ou expirado');
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
});

it('valida confirmação e salva a nova senha apenas com sessão', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } }, error: null });
  render(<ResetPassword />);
  fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'exemplo-teste123' } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'diferente123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('não coincidem');
  expect(auth.updateUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'exemplo-teste123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Senha atualizada');
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'exemplo-teste123' });
});

it('não informa sucesso quando o servidor recusa a senha', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } }, error: null });
  auth.updateUser.mockResolvedValue({ error: { code: 'weak_password' } });
  render(<ResetPassword />);
  fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'exemplo-teste123' } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'exemplo-teste123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('senha mais forte');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('bloqueia o formulário quando a sessão é encerrada em outra aba', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } }, error: null });
  render(<ResetPassword />);
  await screen.findByLabelText('Nova senha');
  const { act } = await import('@testing-library/react');
  act(() => auth.onAuthStateChange.mock.calls[0][0]('SIGNED_OUT', null));
  expect(screen.getByRole('alert')).toHaveTextContent('inválido ou expirado');
  expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
});

it('preserva a possibilidade de tentar novamente após erro de rede ao salvar', async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'test' } } }, error: null });
  auth.updateUser.mockRejectedValue(new Error('network'));
  render(<ResetPassword />);
  fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'exemplo-teste123' } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'exemplo-teste123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Verifique sua conexão');
  expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled();
});
