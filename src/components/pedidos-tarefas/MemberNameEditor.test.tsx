import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createClient } from '@supabase/supabase-js';
import type { Member } from '@/lib/pedidos-tarefas/types';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { MemberNameEditor } from './MemberNameEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let clientNumber = 0;
function editorClient(options: {
  members: Member[];
  tasks: Array<{ taskId: string; label: string }>;
  assignmentStatus?: number;
}) {
  let members = options.members.map(member => ({
    user_id: member.userId,
    display_name: member.displayName,
  }));
  let tasks = options.tasks.map(task => ({ id: task.taskId, responsavel: task.label }));

  return createClient('https://example.test', 'test-public-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `member-editor-${++clientNumber}`,
    },
    global: {
      fetch: async (url, init) => {
        const path = String(url);
        const body = init?.body ? JSON.parse(String(init.body)) : null;

        if (path.includes('/rpc/list_pedido_members')) {
          return Response.json(members);
        }
        if (path.includes('/rest/v1/tarefas?')) {
          return Response.json(tasks);
        }
        if (path.includes('/rpc/set_pedido_member_display_name')) {
          members = members.map(member => member.user_id === body.p_member
            ? { ...member, display_name: body.p_name }
            : member);
          return Response.json(null);
        }
        if (path.includes('/rpc/assign_legacy_pedido_tasks')) {
          if (options.assignmentStatus) {
            return Response.json(
              { code: '42501', message: 'Organization admin required' },
              { status: options.assignmentStatus }
            );
          }
          const ids = new Set(body.p_task_ids as string[]);
          const affected = tasks.filter(task => ids.has(task.id)).length;
          tasks = tasks.filter(task => !ids.has(task.id));
          return Response.json(affected);
        }
        return Response.json({ message: 'unexpected request' }, { status: 500 });
      },
    },
  });
}

describe('MemberNameEditor', () => {
  it('explains that disposable test data does not need reconciliation', async () => {
    render(
      <MemberNameEditor
        organizationId="org-a"
        client={editorClient({
          members: [{ userId: '12345678-aaaa', displayName: null }],
          tasks: [{ taskId: 'task-a', label: 'Responsável de teste' }],
        })}
        onChanged={vi.fn()}
      />
    );

    expect(await screen.findByRole('heading', {
      name: 'Identidades e tarefas antigas (opcional)',
    })).toBeInTheDocument();
    expect(screen.getByText(
      'Use esta área somente para dados reais que precisam ser preservados.'
    )).toBeInTheDocument();
    expect(screen.getByText(
      'Se estes membros e tarefas são testes que serão apagados, não preencha nem associe nada.'
    )).toBeInTheDocument();
  });

  it('shows unnamed members without guessing and saves an administrator-verified name', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <MemberNameEditor
        organizationId="org-a"
        client={editorClient({
          members: [{ userId: '12345678-aaaa', displayName: null }],
          tasks: [],
        })}
        onChanged={onChanged}
      />
    );

    const input = await screen.findByRole('textbox', { name: 'Nome do membro 12345678' });
    expect(screen.getByText('Membro sem nome · 12345678')).toBeInTheDocument();
    await user.type(input, 'Roberto');
    await user.click(screen.getByRole('button', { name: 'Salvar nome do membro 12345678' }));

    expect(await screen.findByText('Roberto')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('suggests only a unique normalized name and requires confirmation before assignment', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(
      <MemberNameEditor
        organizationId="org-a"
        client={editorClient({
          members: [
            { userId: 'user-a', displayName: 'Roberto' },
            { userId: 'user-b', displayName: 'Katlyn' },
          ],
          tasks: [
            { taskId: 'task-a', label: '  ROBERTO ' },
            { taskId: 'task-b', label: '  ROBERTO ' },
          ],
        })}
        onChanged={onChanged}
      />
    );

    const select = await screen.findByRole('combobox', { name: 'Membro para tarefas ROBERTO' });
    expect(select).toHaveValue('user-a');
    const assign = screen.getByRole('button', { name: 'Associar 2 tarefas de ROBERTO' });

    await user.click(assign);
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText('2 tarefas pendentes')).toBeInTheDocument();

    await user.click(assign);
    await waitFor(() => expect(screen.queryByText('2 tarefas pendentes')).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('does not preselect an ambiguous homonym', async () => {
    render(
      <MemberNameEditor
        organizationId="org-a"
        client={editorClient({
          members: [
            { userId: 'user-a', displayName: 'Thomás' },
            { userId: 'user-b', displayName: 'Thomás' },
          ],
          tasks: [{ taskId: 'task-a', label: 'Thomás' }],
        })}
        onChanged={vi.fn()}
      />
    );

    expect(await screen.findByRole('combobox', { name: 'Membro para tarefas Thomás' }))
      .toHaveValue('');
  });

  it('keeps the unresolved group visible when the RPC refuses the assignment', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemberNameEditor
        organizationId="org-a"
        client={editorClient({
          members: [{ userId: 'user-a', displayName: 'Roberto' }],
          tasks: [{ taskId: 'task-a', label: 'Roberto' }],
          assignmentStatus: 403,
        })}
        onChanged={vi.fn()}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Associar 1 tarefa de Roberto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Organization admin required');
    expect(screen.getByText('1 tarefa pendente')).toBeInTheDocument();
  });
});
