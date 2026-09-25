'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { removeTask, saveSubtask, updateTask } from '@/lib/pedidos-tarefas/commands';
import { deleteOrderDetail } from '@/lib/pedidos-tarefas/detail-deletion';
import {
  createSupabaseStandaloneTaskReadClient,
  loadStandaloneTaskDetail,
  type StandaloneTaskDetail as Detail,
} from '@/lib/pedidos-tarefas/standalone-task';
import { addTaskNote, deleteTaskNote } from '@/lib/pedidos-tarefas/task-notes';
import { addUpdate } from '@/lib/pedidos-tarefas/timeline';
import type { Capabilities, Member } from '@/lib/pedidos-tarefas/types';
import { TaskDetailDrawer } from './TaskDetailDrawer';

export function StandaloneTaskDetail({ organizationId, taskId, members, today, timelineMode, onClose }: {
  organizationId: string;
  taskId: string;
  members: Member[];
  today: string;
  timelineMode: Capabilities['timelineMode'];
  onClose: () => void;
}) {
  const readClient = useMemo(() => createSupabaseStandaloneTaskReadClient(supabase, timelineMode), [timelineMode]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    loadStandaloneTaskDetail(readClient, organizationId, taskId)
      .then(next => {
        if (!active) return;
        if (!next) setError('Tarefa avulsa não encontrada nesta organização.');
        else setDetail(next);
      })
      .catch(() => { if (active) setError('Não foi possível carregar a tarefa avulsa.'); });
    return () => { active = false; };
  }, [organizationId, readClient, revision, taskId]);

  if (error) return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/40 p-6">
    <div role="alert" className="max-w-md rounded-xl bg-white p-5 shadow-xl">
      <p className="text-sm text-red-800">{error}</p>
      <button type="button" onClick={onClose} className="mt-4 rounded-md border px-3 py-2 text-sm">Fechar</button>
    </div>
  </div>;
  if (!detail) return <p role="status" className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/40 text-white">
    Carregando tarefa avulsa…
  </p>;

  const changed = () => {
    setDetail(null);
    setError(null);
    setRevision(value => value + 1);
  };
  return <TaskDetailDrawer taskId={taskId} orderId={null} task={detail.task}
    fronts={[]} members={members} subtasks={detail.subtasks} comments={detail.comments}
    dependencies={[]} orderTasks={[]} today={today} onClose={onClose} onChanged={changed}
    onSaveTask={async (id, patch) => (await updateTask(supabase, organizationId, id, patch)).ok}
    onToggleTask={async id => (await updateTask(supabase, organizationId, id, {
      status: detail.task.status === 'Concluída' ? 'Aberta' : 'Concluída',
    })).ok}
    onSaveSubtask={async input => (await saveSubtask(supabase, organizationId, input)).ok}
    onDeleteSubtask={async id => {
      try {
        await deleteOrderDetail(supabase, 'subtarefas', organizationId, id);
        return true;
      } catch { return false; }
    }}
    onAddNote={async text => (await addTaskNote(supabase, organizationId, taskId, text, timelineMode)).ok}
    onDeleteNote={async id => (await deleteTaskNote(supabase, organizationId, id, timelineMode)).ok}
    onSaveUpdate={timelineMode === 'v1'
      ? input => addUpdate(supabase, organizationId, input) : undefined}
    onAddDependency={async () => false}
    onRemoveDependency={async () => false}
    onDeleteTask={async id => {
      const result = await removeTask(supabase, organizationId, id);
      if (result.ok) onClose();
      return result.ok;
    }} />;
}
