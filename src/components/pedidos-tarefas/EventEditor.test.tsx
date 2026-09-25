import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEditor } from './EventEditor';

const mocks = vi.hoisted(() => ({
  getCurrentOrganizationId: vi.fn(),
  loadEvent: vi.fn(),
  loadEventEditorOptions: vi.fn(),
  listMembers: vi.fn(),
  saveEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { marker: 'authenticated-client' } }));
vi.mock('@/lib/pedidos-tarefas/organization', () => ({
  getCurrentOrganizationId: mocks.getCurrentOrganizationId,
}));
vi.mock('@/lib/pedidos-tarefas/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pedidos-tarefas/events')>();
  return { ...actual, loadEvent: mocks.loadEvent, saveEvent: mocks.saveEvent,
    deleteEvent: mocks.deleteEvent, loadEventEditorOptions: mocks.loadEventEditorOptions };
});
vi.mock('@/lib/pedidos-tarefas/members', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pedidos-tarefas/members')>();
  return { ...actual, listMembers: mocks.listMembers };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const editorOptions = {
  orders: [{ id: 'order-a', label: '#10 · Projeto' }],
  fronts: [{ id: 'front-a', orderId: 'order-a', label: 'Instalação' }],
  tasks: [{ id: 'task-a', orderId: 'order-a', frontId: 'front-a', label: 'Vistoria' }],
  customers: [{ id: 'customer-a', label: 'Cliente A' }],
};

describe('EventEditor', () => {
  it('saves a standalone event in the authenticated organization and refreshes both calendar views', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('org-a');
    mocks.loadEventEditorOptions.mockResolvedValue(editorOptions);
    mocks.listMembers.mockResolvedValue([{ userId: 'user-a', displayName: 'Ana' }]);
    mocks.saveEvent.mockResolvedValue({ ok: true, value: { id: 'e1' } });
    const onSaved = vi.fn();

    render(<EventEditor eventId={null} onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'visit');
    await userEvent.type(screen.getByLabelText('Título'), 'Visita técnica');
    await userEvent.type(screen.getByLabelText('Data'), '2026-10-15');
    await userEvent.type(screen.getByLabelText('Horário'), '09:30');
    await userEvent.selectOptions(screen.getByLabelText('Responsável'), 'user-a');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar evento' }));

    await waitFor(() => expect(mocks.saveEvent).toHaveBeenCalledWith(
      { marker: 'authenticated-client' }, 'org-a', {
        id: '', kind: 'visit', title: 'Visita técnica', date: '2026-10-15', time: '09:30',
        assigneeId: 'user-a', note: null, customerId: null, orderId: null, frontId: null, taskId: null,
      }));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('does not expose an event guessed by URL when the organization-scoped read finds no row', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('org-a');
    mocks.loadEventEditorOptions.mockResolvedValue(editorOptions);
    mocks.listMembers.mockResolvedValue([{ userId: 'user-a', displayName: 'Ana' }]);
    mocks.loadEvent.mockResolvedValue(null);

    render(<EventEditor eventId="event-from-other-org" onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Evento não encontrado');
    expect(mocks.loadEvent).toHaveBeenCalledWith(
      { marker: 'authenticated-client' }, 'org-a', 'event-from-other-org');
    expect(screen.queryByRole('button', { name: 'Salvar evento' })).not.toBeInTheDocument();
  });

  it('deletes an organization-scoped event only after confirmation', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('org-a');
    mocks.loadEventEditorOptions.mockResolvedValue(editorOptions);
    mocks.listMembers.mockResolvedValue([{ userId: 'user-a', displayName: 'Ana' }]);
    mocks.loadEvent.mockResolvedValue({ id: 'e1', kind: 'meeting', title: 'Reunião',
      date: '2026-10-15', time: '09:30', assigneeId: 'user-a', note: null,
      customerId: null, orderId: null, frontId: null, taskId: null });
    mocks.deleteEvent.mockResolvedValue({ ok: true, value: undefined });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onSaved = vi.fn();

    render(<EventEditor eventId="e1" onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir evento' }));

    await waitFor(() => expect(mocks.deleteEvent).toHaveBeenCalledWith(
      { marker: 'authenticated-client' }, 'org-a', 'e1'));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('fills the consistent Pedido and Frente context when a task is selected', async () => {
    mocks.getCurrentOrganizationId.mockResolvedValue('org-a');
    mocks.loadEventEditorOptions.mockResolvedValue(editorOptions);
    mocks.listMembers.mockResolvedValue([{ userId: 'user-a', displayName: 'Ana' }]);
    mocks.saveEvent.mockResolvedValue({ ok: true, value: { id: 'e1' } });

    render(<EventEditor eventId={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Vistoria marcada');
    await userEvent.type(screen.getByLabelText('Data'), '2026-10-15');
    await userEvent.type(screen.getByLabelText('Horário'), '09:30');
    await userEvent.selectOptions(screen.getByLabelText('Responsável'), 'user-a');
    await userEvent.selectOptions(screen.getByLabelText('Tarefa'), 'task-a');

    expect(screen.getByLabelText('Pedido')).toHaveValue('order-a');
    expect(screen.getByLabelText('Frente')).toHaveValue('front-a');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar evento' }));
    await waitFor(() => expect(mocks.saveEvent).toHaveBeenCalledWith(
      { marker: 'authenticated-client' }, 'org-a', expect.objectContaining({
        taskId: 'task-a', orderId: 'order-a', frontId: 'front-a',
      })));
  });
});
