import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveStatusBanner } from './SaveStatusBanner';

afterEach(cleanup);

describe('SaveStatusBanner', () => {
  it('só informa que é seguro sair depois que o rascunho foi salvo', () => {
    const { rerender } = render(<SaveStatusBanner status="salvando" />);

    expect(screen.getByText('Salvando…')).toBeInTheDocument();
    expect(screen.queryByText(/você pode sair/i)).not.toBeInTheDocument();

    rerender(
      <SaveStatusBanner status="salvo" salvoEm={new Date(2026, 6, 2, 14, 32)} />,
    );

    expect(
      screen.getByText('Rascunho salvo às 14:32 — você pode sair e continuar depois.'),
    ).toBeInTheDocument();
  });

  it('informa perda de conexão sem afirmar que o rascunho foi salvo', () => {
    render(<SaveStatusBanner status="offline" />);

    expect(screen.getByText('Sem conexão — alterações ainda não enviadas.')).toBeInTheDocument();
    expect(screen.queryByText(/salvo/i)).not.toBeInTheDocument();
  });

  it('permite tentar novamente depois de uma falha', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<SaveStatusBanner status="erro" onRetry={onRetry} />);

    expect(screen.getByText('Falha ao salvar — tentar novamente.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
