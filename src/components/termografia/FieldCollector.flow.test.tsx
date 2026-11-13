import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFieldCollection, createFieldPoint, type FieldCollection } from '@/lib/termografia/field-collection';
import { FieldCollector } from './FieldCollector';
const mock = vi.hoisted(() => ({ value: {} as Record<string, unknown>, attach: vi.fn(), authorize: vi.fn(), flush: vi.fn() }));
vi.mock('./useFieldCollector', () => ({ useFieldCollector: () => mock.value }));
let draft: FieldCollection;
beforeEach(() => {
  window.history.replaceState({}, '', '/termografia/nova');
  draft = createFieldCollection({ projectId: 'p', origin: 'o', userId: 'u', organizationId: 'g' }, { cliente_nome: 'Cliente' });
  draft.points.push(createFieldPoint({ setor: 'Sala', local: 'QGBT' })); draft.activePointId = draft.points[0].id;
  mock.attach.mockReset(); mock.authorize.mockReset(); mock.flush.mockReset().mockResolvedValue(undefined);
  mock.value = { state: { draft, saved: true, saving: false, conflict: false }, drafts: [draft], loading: false, busy: false, online: true, preparingOffline: false, readiness: { ready: false }, edit: (change: (draft: FieldCollection) => void) => change(draft), attach: mock.attach, authorizeSend: mock.authorize, flush: mock.flush, exportBackup: vi.fn(), resume: vi.fn() };
});
afterEach(cleanup);
describe('mobile collection navigation', () => {
  it('shows occurrence descriptions in the digital card only after the inspection choice', () => {
    const view = render(<FieldCollector />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir QGBT/ }));
    expect(screen.queryByRole('option', { name: 'Em aberto' })).not.toBeInTheDocument();
    expect(screen.queryByText('Descrição da ocorrência')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Situação da inspeção'), { target: { value: 'occurrence' } });
    view.rerender(<FieldCollector />);
    expect(draft.points[0].inspectionStatus).toBe('inspected');
    expect(draft.points[0].occurrenceSelected).toBe(true);
    expect(screen.getByText('Adicione uma foto digital para descrever as ocorrências.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Situação da inspeção'), { target: { value: 'inspected' } });
    view.rerender(<FieldCollector />);
    expect(screen.queryByText('Descrição da ocorrência')).not.toBeInTheDocument();
  });
  it('starts with client and date only, without a phantom panel', async () => {
    draft.report.cliente_nome = ''; draft.points = []; delete draft.activePointId;
    render(<FieldCollector />);
    expect(screen.getByLabelText('Cliente *')).toBeInTheDocument();
    expect(screen.queryByText('Câmera / equipamento')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('CNPJ')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cliente *'), { target: { value: 'Empresa' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Dados gerais da coleta' }));
    await screen.findByRole('button', { name: 'Adicionar quadro' });
    expect(draft.points).toHaveLength(0);
    expect(screen.queryByLabelText('Cliente *')).not.toBeInTheDocument();
  });
  it('isolates a panel from client fields and list, saving before returning', async () => {
    render(<FieldCollector />);
    expect(screen.getByRole('heading', { name: 'Quadros' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Fotografar digital')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Abrir QGBT/ }));
    expect(screen.queryByRole('heading', { name: 'Quadros' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cliente *')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fotografar digital')).toHaveAttribute('capture', 'environment');
    fireEvent.click(screen.getByRole('button', { name: 'Concluir quadro' }));
    await screen.findByRole('heading', { name: 'Quadros' });
    expect(mock.flush).toHaveBeenCalled();
    expect(draft.points[0].inspectionStatus).toBe('inspected');
    expect(mock.authorize).not.toHaveBeenCalled();
  });
  it('inherits the last sector and offers existing sectors or a new name', () => {
    draft.points.push(createFieldPoint({ setor: 'Produção', local: 'QD2' }));
    const view = render(<FieldCollector />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar quadro' }));
    expect(screen.getByLabelText('Setor / área *')).toHaveValue('Sala');
    fireEvent.click(screen.getByRole('button', { name: 'Escolher setor já usado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Produção' }));
    view.rerender(<FieldCollector />);
    expect(screen.getByLabelText('Setor / área *')).toHaveValue('Produção');
    fireEvent.change(screen.getByLabelText('Setor / área *'), { target: { value: 'Expedição' } });
    expect(draft.points.at(-1)?.setor).toBe('Expedição');
  });
  it('stays on the panel if the final local save fails', async () => {
    mock.flush.mockRejectedValue(new Error('Sem espaço no celular'));
    render(<FieldCollector />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir QGBT/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Concluir quadro' }));
    expect(await screen.findByText('Sem espaço no celular')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome / local do quadro *')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Quadros' })).not.toBeInTheDocument();
  });
  it('restores the selected panel on a cold return from the camera', () => {
    window.history.replaceState({}, '', `/termografia/nova?rascunho=${draft.id}&tela=point`);
    render(<FieldCollector />);
    expect(screen.getByLabelText('Nome / local do quadro *')).toHaveValue('QGBT');
  });
});
