import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TemplateRecord } from '@/lib/pedidos-tarefas/templates';
import { TemplateEditor } from './TemplateEditor';
import { TemplatePicker } from './TemplatePicker';
import { NewOrderDrawer } from '../NewOrderDrawer';

afterEach(cleanup);

const template: TemplateRecord = {
  id: 'template-a', name: 'Instalação', version: 2,
  definition: {
    schemaVersion: 1,
    fronts: [{ key: 'geral', name: 'Geral', position: 0 }],
    tasks: [{ key: 'visita', frontKey: 'geral', title: 'Visita', description: null,
      priority: 'Normal', dueRule: { kind: 'creation', offsetDays: 2 }, followUpRule: null }],
    subtasks: [], dependencies: [],
  },
};

describe('TemplatePicker', () => {
  it('offers the existing blank flow and a versioned template', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const view = render(<TemplatePicker templates={[template]} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /usar template/i }));
    expect(onSelect).toHaveBeenLastCalledWith('template-a');
    view.rerender(<TemplatePicker templates={[template]} selectedId="template-a" onSelect={onSelect} />);
    await user.selectOptions(screen.getByLabelText('Template do Pedido'), 'template-a');
    expect(onSelect).toHaveBeenLastCalledWith('template-a');

    await user.click(screen.getByRole('button', { name: /em branco/i }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('TemplateEditor', () => {
  it('edits a D+n blueprint and sends the current expected version', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({ ok: true, value: template });
    render(<TemplateEditor template={template} onSave={onSave} onDuplicate={vi.fn()} onClose={vi.fn()} />);

    const taskTitle = screen.getByLabelText('Título da tarefa 1');
    await user.clear(taskTitle);
    await user.type(taskTitle, 'Visita técnica');
    await user.clear(screen.getByLabelText('Prazo D+ da tarefa 1'));
    await user.type(screen.getByLabelText('Prazo D+ da tarefa 1'), '4');
    await user.click(screen.getByRole('button', { name: 'Salvar template' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'template-a', expectedVersion: 2, name: 'Instalação',
      definition: expect.objectContaining({
        tasks: [expect.objectContaining({
          title: 'Visita técnica', dueRule: { kind: 'creation', offsetDays: 4 },
        })],
      }),
    }));
  });

  it('preserves the draft and asks for reload when a stale edit conflicts', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue({
      ok: false, code: 'reload', message: 'Template version conflict',
    });
    render(<TemplateEditor template={template} onSave={onSave} onDuplicate={vi.fn()} onClose={vi.fn()} />);

    await user.clear(screen.getByLabelText('Nome do template'));
    await user.type(screen.getByLabelText('Nome do template'), 'Meu rascunho');
    await user.click(screen.getByRole('button', { name: 'Salvar template' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/recarregue/i);
    expect(screen.getByLabelText('Nome do template')).toHaveValue('Meu rascunho');
  });

  it('configures a deadline relative to another task completion', async () => {
    const user = userEvent.setup();
    const withSource: TemplateRecord = { ...template, definition: {
      ...template.definition,
      tasks: [
        template.definition.tasks[0],
        { key: 'entrega', frontKey: 'geral', title: 'Entrega', description: null,
          priority: 'Normal', dueRule: null, followUpRule: null },
      ],
    } };
    const onSave = vi.fn().mockResolvedValue({ ok: true, value: withSource });
    render(<TemplateEditor template={withSource} onSave={onSave} onDuplicate={vi.fn()} onClose={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Tipo de prazo da tarefa 2'), 'completion');
    await user.selectOptions(screen.getByLabelText('Tarefa de origem do prazo 2'), 'visita');
    await user.clear(screen.getByLabelText('Dias após conclusão do prazo 2'));
    await user.type(screen.getByLabelText('Dias após conclusão do prazo 2'), '3');
    await user.click(screen.getByRole('button', { name: 'Salvar template' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ definition: expect.objectContaining({
      tasks: expect.arrayContaining([expect.objectContaining({
        key: 'entrega', dueRule: { kind: 'completion', sourceTaskKey: 'visita', offsetDays: 3 },
      })]),
    }) }));
  });
});

describe('NewOrderDrawer template flow', () => {
  it('submits the selected version with one stable request id across a retry', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<NewOrderDrawer isOpen onClose={vi.fn()} onSave={onSave} templates={[template]} />);

    await user.click(screen.getByRole('button', { name: /usar template/i }));
    await user.type(screen.getByPlaceholderText('Ex: PED-2050'), 'PED-10');
    await user.type(screen.getByPlaceholderText('Ex: Instalação de Painel Solar'), 'Projeto template');
    await user.type(screen.getByPlaceholderText('Ex: Empresa Silva'), 'Cliente');
    await user.type(screen.getByPlaceholderText('Ex: Rua das Flores'), 'Rua A');
    await user.click(screen.getByRole('button', { name: /salvar pedido/i }));
    await user.click(screen.getByRole('button', { name: /salvar pedido/i }));

    expect(onSave).toHaveBeenCalledTimes(2);
    const first = onSave.mock.calls[0][0];
    const second = onSave.mock.calls[1][0];
    expect(first.template).toMatchObject({
      templateId: 'template-a', expectedVersion: 2,
    });
    expect(first.template.requestId).toBeTruthy();
    expect(first.template.timeZone).toBeTruthy();
    expect(second.template.requestId).toBe(first.template.requestId);
  });
});
