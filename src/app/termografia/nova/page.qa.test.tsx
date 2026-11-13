import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFieldCollection, createFieldPoint } from '@/lib/termografia/field-collection';
import NovaTermografiaPage from './page';
const mock = vi.hoisted(() => ({ value: {} as Record<string, unknown>, attach: vi.fn(), authorize: vi.fn() }));
vi.mock('@/components/termografia/useFieldCollector', () => ({ useFieldCollector: () => mock.value }));
beforeEach(() => {
  window.history.replaceState({}, '', '/termografia/nova');
  const draft = createFieldCollection({ projectId: 'p', origin: 'o', userId: 'u', organizationId: 'g' }, { cliente_nome: 'Cliente' });
  draft.points.push(createFieldPoint({ setor: 'Sala', local: 'QGBT' })); draft.activePointId = draft.points[0].id;
  mock.attach.mockReset(); mock.authorize.mockReset();
  mock.value = { state: { draft, saved: true, saving: false, conflict: false }, drafts: [draft], loading: false, busy: false, online: true, preparingOffline: false, readiness: { ready: false }, edit: vi.fn(), attach: mock.attach, authorizeSend: mock.authorize, flush: async () => {}, exportBackup: vi.fn(), resume: vi.fn() };
});
afterEach(cleanup);
describe('mobile collection controls', () => {
  it('shows automatic preparation without disabling collection or offering an offline mode', () => {
    mock.value.preparingOffline = true;
    render(<NovaTermografiaPage />);
    expect(screen.getByText('Preparando uso sem internet…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dados' }));
    expect(screen.getByLabelText('Cliente *')).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Preparar celular|Atualizar preparação offline/ })).not.toBeInTheDocument();
  });
  it('explicitly tells an offline user to continue the same collection', () => {
    mock.value.online = false; mock.value.readiness = { ready: true };
    render(<NovaTermografiaPage />);
    expect(screen.getByText('Sem internet · continue sua coleta normalmente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções da coleta' }));
    expect(screen.getByText(/Não precisa ativar nenhum modo/)).toBeInTheDocument();
  });
  it('keeps multi thermal album available without capture and digital camera separate', () => {
    render(<NovaTermografiaPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir QGBT' }));
    const thermal = screen.getByLabelText('Adicionar térmicas do álbum') as HTMLInputElement;
    expect(thermal.multiple).toBe(true); expect(thermal).not.toHaveAttribute('capture');
    expect(screen.getByLabelText('Fotografar digital')).toHaveAttribute('capture', 'environment');
    const files = [new File(['a'], 'one.jpg'), new File(['b'], 'two.jpg')];
    fireEvent.change(thermal, { target: { files } });
    expect(mock.attach).toHaveBeenCalledWith(expect.any(String), files, 'termica');
    expect(mock.authorize).not.toHaveBeenCalled();
  });
  it('requires explicit sending after finishing the collection', async () => {
    render(<NovaTermografiaPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Terminar coleta' }));
    await screen.findByRole('heading', { name: 'Terminar coleta' });
    expect(screen.getByText(/sem foto térmica/i)).toBeInTheDocument();
    expect(mock.authorize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar à minha conta' }));
    expect(mock.authorize).toHaveBeenCalledOnce();
  });
  it('never labels an unsuccessful local write as saved', () => {
    mock.value.state = { ...(mock.value.state as object), saved: false, saving: false, error: 'Sem espaço no celular' };
    render(<NovaTermografiaPage />);
    expect(screen.getByText('Falha ao salvar localmente')).toBeInTheDocument();
    expect(screen.getByText('Sem espaço no celular')).toBeInTheDocument();
    expect(screen.queryByText('Salvo no celular')).not.toBeInTheDocument();
  });
});
