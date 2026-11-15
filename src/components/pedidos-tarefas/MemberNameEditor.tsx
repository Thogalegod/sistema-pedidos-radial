'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Member } from '@/lib/pedidos-tarefas/types';
import {
  assignLegacyTasks,
  formatMemberLabel,
  listMembers,
  listUnassignedLegacyTasks,
  resolveNamedMember,
  setMemberDisplayName,
  type UnassignedLegacyTask,
} from '@/lib/pedidos-tarefas/members';

interface MemberNameEditorProps {
  organizationId: string;
  onChanged: () => void | Promise<void>;
  client?: SupabaseClient;
}

type LegacyGroup = { label: string; taskIds: string[] };

function groupLegacyTasks(tasks: UnassignedLegacyTask[]): LegacyGroup[] {
  const groups = new Map<string, string[]>();
  for (const task of tasks) {
    const label = task.label.trim();
    const current = groups.get(label) ?? [];
    current.push(task.taskId);
    groups.set(label, current);
  }
  return [...groups.entries()].map(([label, taskIds]) => ({ label, taskIds }));
}

export function MemberNameEditor({
  organizationId,
  onChanged,
  client = supabase,
}: MemberNameEditorProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<UnassignedLegacyTask[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [directory, unresolved] = await Promise.all([
        listMembers(client, organizationId),
        listUnassignedLegacyTasks(client, organizationId),
      ]);
      setMembers(directory);
      setTasks(unresolved);
      setDraftNames(Object.fromEntries(directory.map(member => [
        member.userId,
        member.displayName ?? '',
      ])));
      const groups = groupLegacyTasks(unresolved);
      setSelections(Object.fromEntries(groups.map(group => [
        group.label,
        resolveNamedMember(directory, group.label) ?? '',
      ])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar identidades');
    } finally {
      setLoading(false);
    }
  }, [client, organizationId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const groups = useMemo(() => groupLegacyTasks(tasks), [tasks]);

  const saveName = async (member: Member) => {
    const name = (draftNames[member.userId] ?? '').trim();
    if (!name) {
      setError('Informe um nome verificável para o membro.');
      return;
    }

    setSavingKey(`name:${member.userId}`);
    setError(null);
    const result = await setMemberDisplayName(client, organizationId, member.userId, name);
    if (!result.ok) {
      setError(result.message);
      setSavingKey(null);
      return;
    }
    await load();
    await onChanged();
    setSavingKey(null);
  };

  const assignGroup = async (group: LegacyGroup) => {
    const userId = selections[group.label];
    const member = members.find(candidate => candidate.userId === userId);
    if (!member) return;
    const countLabel = group.taskIds.length === 1 ? '1 tarefa' : `${group.taskIds.length} tarefas`;
    if (!window.confirm(
      `Associar ${countLabel} com o texto legado "${group.label}" a ${formatMemberLabel(member)} (${member.userId.slice(0, 8)})? O texto original será preservado.`
    )) return;

    setSavingKey(`tasks:${group.label}`);
    setError(null);
    const result = await assignLegacyTasks(
      client,
      organizationId,
      group.taskIds,
      member.userId
    );
    if (!result.ok) {
      setError(result.message);
      setSavingKey(null);
      return;
    }
    await load();
    await onChanged();
    setSavingKey(null);
  };

  return (
    <section aria-label="Identidades e tarefas antigas" className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-bold text-slate-900">Identidades e tarefas antigas (opcional)</h2>
      <p className="mt-1 text-xs text-slate-700">
        Use esta área somente para dados reais que precisam ser preservados.
      </p>
      <p className="mt-1 text-xs font-medium text-slate-700">
        Se estes membros e tarefas são testes que serão apagados, não preencha nem associe nada.
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Para dados reais, revise cada pessoa antes de salvar. E-mails não são usados e o texto antigo é preservado.
      </p>

      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="mt-3 text-sm text-slate-700">Carregando identidades...</p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Membros</h3>
            {members.map(member => (
              <div key={member.userId} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">{formatMemberLabel(member)}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label={`Nome do membro ${member.userId.slice(0, 8)}`}
                    value={draftNames[member.userId] ?? ''}
                    onChange={event => setDraftNames(current => ({
                      ...current,
                      [member.userId]: event.target.value,
                    }))}
                    maxLength={120}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    aria-label={`Salvar nome do membro ${member.userId.slice(0, 8)}`}
                    disabled={savingKey !== null}
                    onClick={() => void saveName(member)}
                    className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50"
                  >
                    Salvar nome
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Tarefas antigas</h3>
            {groups.length === 0 ? (
              <p className="text-sm text-emerald-700">Nenhuma tarefa aguarda associação.</p>
            ) : groups.map(group => {
              const countLabel = group.taskIds.length === 1
                ? '1 tarefa pendente'
                : `${group.taskIds.length} tarefas pendentes`;
              return (
                <div key={group.label} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-800">{group.label}</p>
                  <p className="mb-2 text-xs text-slate-500">{countLabel}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      aria-label={`Membro para tarefas ${group.label}`}
                      value={selections[group.label] ?? ''}
                      onChange={event => setSelections(current => ({
                        ...current,
                        [group.label]: event.target.value,
                      }))}
                      className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Selecione após revisar</option>
                      {members.map(member => (
                        <option key={member.userId} value={member.userId}>
                          {formatMemberLabel(member)} · {member.userId.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`Associar ${group.taskIds.length} ${group.taskIds.length === 1 ? 'tarefa' : 'tarefas'} de ${group.label}`}
                      disabled={savingKey !== null || !selections[group.label]}
                      onClick={() => void assignGroup(group)}
                      className="rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Confirmar associação
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
