import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

it('renders linked ancestors, current page, actions and tabs accessibly', () => {
  render(<PageHeader
    title="Clientes"
    description="Cadastre e edite clientes."
    breadcrumbs={[
      { label: 'Central', href: '/hub' },
      { label: 'Controle de Locações', href: '/contratos-locacoes' },
      { label: 'Clientes' },
    ]}
    actions={<button type="button">Novo cliente</button>}
    tabs={[
      { label: 'Painel', href: '/contratos-locacoes' },
      { label: 'Clientes', href: '/contratos-locacoes/clientes', active: true },
    ]}
  />);

  const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(breadcrumb).getByRole('link', { name: 'Central' })).toHaveAttribute('href', '/hub');
  expect(within(breadcrumb).getByText('Clientes')).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Novo cliente' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('aria-current', 'page');
});
