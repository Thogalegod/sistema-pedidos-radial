import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { orderFixture } from '@/lib/pedidos-tarefas/test-fixtures';

const mocks = vi.hoisted(() => ({
  listSelect: vi.fn(), loadOrder: vi.fn(), loadOrderTasks: vi.fn(),
  loadOrderRecentActivity: vi.fn(), loadLegacyOrderDetail: vi.fn(),
  loadOrderUpdates: vi.fn(), loadOrderAttachments: vi.fn(),
  createSignedUrl: vi.fn(),
  listRows: [] as Array<Record<string, unknown>>,
}));

vi.mock('../lib/supabase', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'member-a' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: (table: string) => table === 'pedido_templates' ? ({
    select: () => ({
      eq: () => ({ order: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
  }) : ({ select: (columns: string) => {
    mocks.listSelect(columns);
    return { eq: async () => ({ data: mocks.listRows, error: null }) };
  } }),
  storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
} }));
vi.mock('next/navigation', () => {
  const router = { replace: vi.fn() };
  return { useRouter: () => router };
});
vi.mock('../lib/pedidos-tarefas/organization', () => ({ getCurrentOrganizationId: async () => 'org1' }));
vi.mock('../lib/pedidos-tarefas/members', () => ({
  readCapabilities: async () => ({ statusMode: 'v1', timelineMode: 'legacy' }),
  listMembers: async () => [], readCurrentMembershipRole: async () => 'member',
  formatMemberLabel: () => 'Pessoa QA',
}));
vi.mock('../lib/pedidos-tarefas/order-queries', () => ({
  loadOrder: mocks.loadOrder, loadOrderTasks: mocks.loadOrderTasks,
  loadOrderRecentActivity: mocks.loadOrderRecentActivity,
  loadLegacyOrderDetail: mocks.loadLegacyOrderDetail,
  loadOrderUpdates: mocks.loadOrderUpdates, loadOrderAttachments: mocks.loadOrderAttachments,
}));
vi.mock('../components/OrderCard', () => ({ OrderCard: ({ order, onClick }: { order: { id: string }; onClick: () => void }) =>
  <button onClick={onClick}>Abrir {order.id}</button> }));
vi.mock('../components/OrderDrawer', () => ({ OrderDrawer: ({ order, activeTab, onTabChange, detailError }: {
  order: { id: string } | null; activeTab: string; onTabChange: (tab: 'files') => void;
  detailError: string | null;
}) => <div data-testid="pedido-detail">{order ? `${activeTab}:${order.id}` : detailError ?? 'carregando'}
  <button onClick={() => onTabChange('files')}>Ver arquivos</button></div> }));
vi.mock('../components/NewOrderDrawer', () => ({ NewOrderDrawer: () => null }));

import Home from './page';

afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });

function listRow(id: string) {
  return { id, organization_id: 'org1', numero_pedido: id, projeto: `Pedido ${id}`,
    cliente: 'Cliente', endereco: 'Rua', status: 'Em andamento', prioridade: 'Normal',
    data_criacao: '2026-09-25T10:00:00Z', prazo_concessionaria: null, tarefas: [] };
}

function legacyDetail(id: string) {
  return { id, orderNumber: id, title: `Pedido ${id}`, client: 'Cliente', address: 'Rua',
    status: 'Em andamento', priority: 'Normal', createdAt: '2026-09-25T10:00:00Z',
    tasks: [], atividades: [], anexos: [] };
}

describe('Pedido page focused reads', () => {
  it('does not request attachments for the list/summary and loads them on Files only', async () => {
    mocks.listRows = [listRow('p1')];
    mocks.loadOrder.mockResolvedValue(orderFixture({ id: 'p1', organizationId: 'org1' }));
    mocks.loadOrderTasks.mockResolvedValue({ fronts: [], tasks: [], subtasks: [], dependencies: [] });
    mocks.loadOrderRecentActivity.mockResolvedValue(null);
    mocks.loadLegacyOrderDetail.mockResolvedValue(legacyDetail('p1'));
    mocks.loadOrderAttachments.mockResolvedValue([{
      id: 'file-1', pedido_id: 'p1', nome_arquivo: 'proposta.pdf', legenda: undefined,
      storage_path: 'org1/p1/proposta.pdf', tipo: 'application/pdf',
      criado_em: '2026-09-25T10:00:00Z',
    }]);

    render(<Home />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir p1' }));
    await screen.findByText('summary:p1');
    expect(mocks.listSelect).toHaveBeenCalledOnce();
    expect(mocks.listSelect.mock.calls[0][0]).not.toMatch(/anexos|atividades|subtarefas/i);
    expect(mocks.loadOrderAttachments).not.toHaveBeenCalled();
    expect(mocks.loadOrderUpdates).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Ver arquivos' }));
    await waitFor(() => expect(mocks.loadOrderAttachments).toHaveBeenCalledWith(
      expect.anything(), 'org1', 'p1', 'legacy'));
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('ignores an older Pedido response after another Pedido is selected', async () => {
    mocks.listRows = [listRow('p1'), listRow('p2')];
    let finishP1!: (value: ReturnType<typeof orderFixture>) => void;
    const p1Read = new Promise<ReturnType<typeof orderFixture>>(resolve => { finishP1 = resolve; });
    mocks.loadOrder.mockImplementation((_client, _org, id: string) =>
      id === 'p1' ? p1Read : Promise.resolve(orderFixture({ id: 'p2', organizationId: 'org1' })));
    mocks.loadOrderTasks.mockResolvedValue({ fronts: [], tasks: [], subtasks: [], dependencies: [] });
    mocks.loadOrderRecentActivity.mockResolvedValue(null);
    mocks.loadLegacyOrderDetail.mockImplementation((_client, _org, id: string) => Promise.resolve(legacyDetail(id)));

    render(<Home />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir p1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir p2' }));
    await screen.findByText('summary:p2');
    await act(async () => { finishP1(orderFixture({ id: 'p1', organizationId: 'org1' })); await p1Read; });
    expect(screen.getByTestId('pedido-detail')).toHaveTextContent('summary:p2');
  });

  it('does not present a stale detail when the scoped Pedido is absent', async () => {
    mocks.listRows = [listRow('p1')];
    mocks.loadOrder.mockResolvedValue(null);
    mocks.loadOrderTasks.mockResolvedValue({ fronts: [], tasks: [], subtasks: [], dependencies: [] });
    mocks.loadOrderRecentActivity.mockResolvedValue(null);
    mocks.loadLegacyOrderDetail.mockResolvedValue(null);
    render(<Home />);
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir p1' }));
    await screen.findByText('Pedido não encontrado nesta organização.');
    expect(screen.getByTestId('pedido-detail')).not.toHaveTextContent('summary:p1');
  });

  it('opens the Summary from an existing Pedido URL after reload', async () => {
    window.history.replaceState(null, '', '/?pedido=p1');
    mocks.listRows = [listRow('p1')];
    mocks.loadOrder.mockResolvedValue(orderFixture({ id: 'p1', organizationId: 'org1' }));
    mocks.loadOrderTasks.mockResolvedValue({ fronts: [], tasks: [], subtasks: [], dependencies: [] });
    mocks.loadOrderRecentActivity.mockResolvedValue(null);
    mocks.loadLegacyOrderDetail.mockResolvedValue(legacyDetail('p1'));
    render(<Home />);
    await screen.findByText('summary:p1');
    expect(window.location.search).toBe('?pedido=p1');
  });
});
