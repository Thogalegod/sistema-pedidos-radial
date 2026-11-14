import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RentalRouteAccess } from './RentalRouteAccess';

const route = vi.hoisted(() => ({ path: '' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
vi.mock('./RentalAccessGate', () => ({ RentalAccessGate: () => <p>Verificando permissão financeira</p> }));
afterEach(cleanup);
describe('financial route coverage', () => {
  it.each(['', '/', '/contratos', '/contratos/novo', '/contratos/123', '/cobrancas', '/recibos/123'])('guards the financial route %s', suffix => {
    route.path = '/contratos-locacoes' + suffix;
    render(<RentalRouteAccess>Conteúdo</RentalRouteAccess>);
    expect(screen.getByText('Verificando permissão financeira')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument();
  });
  it.each(['/ativos', '/clientes', '/clientes/123'])('preserves existing access to %s', suffix => {
    route.path = '/contratos-locacoes' + suffix;
    render(<RentalRouteAccess>Conteúdo</RentalRouteAccess>);
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });
});
