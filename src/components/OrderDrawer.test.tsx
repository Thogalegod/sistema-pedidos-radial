import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Order } from '@/types';
import { OrderDrawer } from './OrderDrawer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const order: Order = {
  id: 'order-a',
  orderNumber: '123',
  title: 'Pedido QA',
  client: 'Cliente',
  address: 'Rua A',
  priority: 'Normal',
  status: 'Em andamento',
  createdAt: '2026-09-24T10:00:00Z',
  tasks: [
    {
      id: 'task-a',
      title: 'Tarefa atual',
      completed: false,
      subtarefas: [
        {
          id: 'sub-a',
          tarefa_id: 'task-a',
          descricao: 'Subtarefa descartável',
          concluida: false,
          criado_em: '2026-09-24T10:00:00Z',
        },
      ],
      comentarios: [
        {
          id: 'note-a',
          tarefa_id: 'task-a',
          texto: 'Nota descartável',
          usuario: 'Roberto',
          criado_em: '2026-09-24T10:00:00Z',
        },
      ],
    },
  ],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderDrawer(overrides: Partial<React.ComponentProps<typeof OrderDrawer>> = {}) {
  const props: React.ComponentProps<typeof OrderDrawer> = {
    order,
    isOpen: true,
    onClose: vi.fn(),
    onToggleTask: vi.fn(),
    onChangePriority: vi.fn(),
    onAddTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onDeleteOrder: vi.fn(),
    onAddAtividade: vi.fn(),
    onDeleteAtividade: vi.fn(),
    onEditTaskTitle: vi.fn(),
    currentUser: 'Roberto',
    onDeleteSubtarefa: vi.fn().mockResolvedValue(undefined),
    onDeleteComentarioTarefa: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<OrderDrawer {...props} />);
  return props;
}

async function expandTask(user: ReturnType<typeof userEvent.setup>) {
  const toggle = document.querySelector('.lucide-chevron-down')?.closest('button');
  expect(toggle).not.toBeNull();
  await user.click(toggle!);
}

describe('OrderDrawer detail deletion', () => {
  it('offers both delete actions to an authorized organization member', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await expandTask(user);

    expect(
      screen.getByRole('button', { name: 'Excluir subtarefa Subtarefa descartável' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Excluir nota de campo Nota descartável' })
    ).toBeVisible();
  });

  it.each([
    ['subtarefa', 'Excluir subtarefa Subtarefa descartável'],
    ['nota de campo', 'Excluir nota de campo Nota descartável'],
  ])('keeps the %s when confirmation is cancelled', async (_, buttonName) => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const props = renderDrawer();
    await expandTask(user);

    await user.click(screen.getByRole('button', { name: buttonName }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(props.onDeleteSubtarefa).not.toHaveBeenCalled();
    expect(props.onDeleteComentarioTarefa).not.toHaveBeenCalled();
    expect(screen.getByText('Subtarefa descartável')).toBeInTheDocument();
    expect(screen.getByText('Nota descartável')).toBeInTheDocument();
  });

  it.each([
    [
      'subtarefa',
      'Excluir subtarefa Subtarefa descartável',
      'onDeleteSubtarefa',
      ['order-a', 'task-a', 'sub-a'],
    ],
    [
      'nota de campo',
      'Excluir nota de campo Nota descartável',
      'onDeleteComentarioTarefa',
      ['order-a', 'task-a', 'note-a'],
    ],
  ] as const)(
    'keeps the %s delete action disabled while persistence is pending',
    async (_, buttonName, callbackName, expectedArguments) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const pending = deferred();
      const callback = vi.fn(() => pending.promise);
      renderDrawer({ [callbackName]: callback });
      await expandTask(user);

      const button = screen.getByRole('button', { name: buttonName });
      await user.click(button);

      expect(callback).toHaveBeenCalledWith(...expectedArguments);
      expect(button).toBeDisabled();
      pending.resolve();
      await screen.findByRole('button', { name: buttonName });
      expect(button).not.toBeDisabled();
    }
  );
});
