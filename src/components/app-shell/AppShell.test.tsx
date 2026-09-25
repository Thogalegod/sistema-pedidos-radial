import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import HubPage from '@/app/hub/page';
import Login from '@/app/login/page';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';

const mocks = vi.hoisted(() => ({
  path: '/hub', push: vi.fn(), replace: vi.fn(), getSession: vi.fn(), signOut: vi.fn(),
  onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), loadCentralSnapshot: vi.fn(),
  loadDashboardTasks: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.path,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: mocks } }));
vi.mock('@/lib/central/queries', () => ({
  createSupabaseCentralOperationalReadClient: vi.fn(() => ({})),
  loadCentralOperationalSnapshot: mocks.loadCentralSnapshot,
}));
vi.mock('@/lib/pedidos-tarefas/organization', () => ({
  getCurrentOrganizationId: async () => 'org-1',
}));
vi.mock('@/lib/pedidos-tarefas/members', () => ({
  listMembers: async () => [],
  readCapabilities: async () => ({ statusMode: 'v1', timelineMode: 'v1' }),
}));
vi.mock('@/lib/pedidos-tarefas/dashboard-queries', () => ({
  createSupabaseDashboardReadClient: () => ({}),
  loadDashboardTasks: mocks.loadDashboardTasks,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.path = '/hub';
  mocks.getSession.mockResolvedValue({ data: { session: { user: { email: 'ana@example.com', user_metadata: { full_name: 'Ana Radial' } } } }, error: null });
  mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.loadCentralSnapshot.mockResolvedValue({
    summary: { overdueTasks: 2, tasksToday: 1, periodsToBill: 3, overdueBillings: 4 },
    priorities: [], tasks: [], periodsToBill: [], overdueBillings: [],
  });
  mocks.loadDashboardTasks.mockResolvedValue([
    { task: taskFixture({ id: 'overdue-1', orderId: null, frontId: null,
      dueDate: '2000-01-01' }), order: null, lastUpdate: null },
    { task: taskFixture({ id: 'overdue-2', orderId: null, frontId: null,
      dueDate: '2000-01-02' }), order: null, lastUpdate: null },
    { task: taskFixture({ id: 'today-1', orderId: null, frontId: null,
      dueDate: new Date().toLocaleDateString('en-CA') }), order: null, lastUpdate: null },
  ]);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('login bem-sucedido abre /hub', async () => {
  render(<Login />);
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-de-teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar no Sistema' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/hub'));
});

it('Central mostra o resumo operacional, atalhos existentes e usa o usuário da sessão', async () => {
  render(<AppShell><HubPage /></AppShell>);
  expect(await screen.findByRole('heading', { name: 'Central' })).toBeInTheDocument();
  expect(screen.queryByText('Olá, Ana')).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox', { name: 'Busca global' })).not.toBeInTheDocument();
  const summary = screen.getByRole('region', { name: 'Resumo operacional' });
  await waitFor(() => expect(within(summary).getByText('Tarefas atrasadas').parentElement).toHaveTextContent('2'));
  expect(within(summary).getByText('Tarefas para hoje').parentElement).toHaveTextContent('1');
  expect(within(summary).getByText('Períodos a faturar').parentElement).toHaveTextContent('3');
  expect(within(summary).getByText('Cobranças vencidas').parentElement).toHaveTextContent('4');
  const shortcuts = screen.getByRole('region', { name: 'Atalhos rápidos' });
  expect(within(shortcuts).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual([
    '/?action=new-order',
    '/contratos-locacoes/contratos/novo',
    '/relatorios-tecnicos',
    '/contratos-locacoes/cobrancas',
  ]);
});

it.each(['/', '/contratos-locacoes/clientes/abc', '/contratos-locacoes/contratos/abc', '/contratos-locacoes/cobrancas'])(
  'preserva o conteúdo e o endereço no acesso direto a %s', async path => {
    mocks.path = path;
    render(<AppShell><p>Conteúdo existente</p></AppShell>);
    expect(screen.getByText('Conteúdo existente')).toBeInTheDocument();
    await screen.findByText('Ana Radial');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

it.each(['/login', '/redefinir-senha', '/cabine/abc/imprimir'])(
  'não envolve %s em navegação nem consulta sessão', path => {
    mocks.path = path;
    render(<AppShell><p>Conteúdo existente</p></AppShell>);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

it('abre o drawer e fecha ao escolher um destino', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
  const dialog = screen.getByRole('dialog', { name: 'Menu Radial' });
  expect(dialog).toHaveAttribute('open');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Expandir submenu Controle de Locações' }));
  const link = within(dialog).getByRole('link', { name: 'Clientes' });
  expect(link).toHaveAttribute('href', '/contratos-locacoes/clientes');
  fireEvent.click(link);
  await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
});

it('expande submenus por clique e abre automaticamente o grupo atual', async () => {
  mocks.path = '/relatorios-tecnicos/transformador';
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  const reportsToggle = screen.getByRole('button', { name: 'Recolher submenu Relatórios Técnicos' });
  expect(reportsToggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: 'Transformador' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(reportsToggle);
  expect(screen.getByRole('button', { name: 'Expandir submenu Relatórios Técnicos' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('link', { name: 'Transformador' })).not.toBeInTheDocument();
});

it('fecha o drawer em uma navegação externa e libera o scroll', async () => {
  const view = render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
  const dialog = screen.getByRole('dialog');
  expect(document.body.style.overflow).toBe('hidden');
  mocks.path = '/contratos-locacoes';
  view.rerender(<AppShell><p>Outro conteúdo</p></AppShell>);
  await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
  expect(document.body.style.overflow).not.toBe('hidden');
});

it('trata Escape no drawer e recolhe a sidebar desktop', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  fireEvent.click(screen.getByRole('button', { name: 'Recolher menu' }));
  expect(screen.getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
  const dialog = screen.getByRole('dialog');
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
});

it('mantém o controle de recolher no topo e a busca como ícone quando recolhida', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  const desktop = screen.getByLabelText('Menu lateral');
  const collapse = within(desktop).getByRole('button', { name: 'Recolher menu' });
  expect(collapse.parentElement).toHaveTextContent('Radial Energia');
  fireEvent.click(collapse);
  expect(within(desktop).getByRole('button', { name: 'Expandir menu' })).toHaveAttribute('title', 'Expandir menu');
  expect(within(desktop).getByRole('button', { name: 'Buscar' })).toHaveAttribute('title', 'Buscar');
});

it('abre a busca global pela sidebar e fecha com Escape devolvendo o foco', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  const desktop = screen.getByLabelText('Menu lateral');
  const trigger = within(desktop).getByRole('button', { name: 'Buscar ou ir para' });
  fireEvent.click(trigger);
  const palette = screen.getByRole('dialog', { name: 'Busca global' });
  const searchbox = within(palette).getByRole('searchbox', { name: 'Busca global' });
  expect(searchbox).toHaveFocus();
  fireEvent.keyDown(searchbox, { key: 'Escape' });
  await waitFor(() => expect(palette).not.toHaveAttribute('open'));
  expect(trigger).toHaveFocus();
});

it('abre a mesma busca global com Ctrl+K e pelo drawer mobile', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const palette = screen.getByRole('dialog', { name: 'Busca global' });
  expect(palette).toHaveAttribute('open');
  fireEvent.click(within(palette).getByRole('button', { name: 'Fechar busca' }));

  fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
  const drawer = screen.getByRole('dialog', { name: 'Menu Radial' });
  fireEvent.click(within(drawer).getByRole('button', { name: 'Buscar ou ir para' }));
  await waitFor(() => expect(drawer).not.toHaveAttribute('open'));
  expect(palette).toHaveAttribute('open');
});

it('logout reutiliza a ação existente e retorna ao login', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
  expect(mocks.replace).toHaveBeenCalledWith('/login');
});

it('mostra falha no logout sem fingir que saiu', async () => {
  mocks.signOut.mockResolvedValue({ error: new Error('network') });
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível sair');
  expect(mocks.replace).not.toHaveBeenCalled();
});

it('Central sem sessão volta ao login', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  render(<AppShell><HubPage /></AppShell>);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
});

it('atualiza a identificação quando a sessão muda', async () => {
  render(<AppShell><p>Conteúdo</p></AppShell>);
  await screen.findByText('Ana Radial');
  act(() => mocks.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: { email: 'bia@example.com' } }));
  expect(await screen.findByText('bia')).toBeInTheDocument();
});
