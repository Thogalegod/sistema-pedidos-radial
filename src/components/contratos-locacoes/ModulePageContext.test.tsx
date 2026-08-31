import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModulePageContext } from './ModulePageContext';

const mocks = vi.hoisted(() => ({ pathname: '/contratos-locacoes/cobrancas' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

afterEach(cleanup);

describe('ModulePageContext', () => {
  it('marks the current section and renders its title and breadcrumb', () => {
    render(<ModulePageContext />);

    expect(screen.getByRole('link', { name: 'Cobranças' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Cobranças', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Navegação estrutural')).toHaveTextContent('Contratos e LocaçõesCobranças');
    expect(screen.getByText('Acompanhe documentos emitidos, vencimentos, recebimentos e saldos.')).toBeInTheDocument();
    expect(screen.queryByText('Cadastro central, locações, cobranças e visão resumida para operação móvel.')).not.toBeInTheDocument();
  });
});
