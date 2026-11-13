import { describe, expect, it, vi } from 'vitest';
import { createTermografiaPoint, createTermografiaReport } from './report-actions';

describe('reconciliação após resposta perdida', () => {
  it.each(['report', 'point'] as const)('retoma o mesmo %s sem inserir novamente', async (kind) => {
    let saved: Record<string, unknown> | null = null;
    const insert = vi.fn((payload: Record<string, unknown>) => {
      saved = payload;
      return { select: () => ({ single: async () => { throw new Error('resposta perdida'); } }) };
    });
    const eq = vi.fn(() => query);
    const query = { select: () => query, eq, maybeSingle: async () => ({ data: saved, error: null }), insert };
    const membership = { select: () => membership, eq: () => membership, limit: () => membership,
      maybeSingle: async () => ({ data: { organization_id: 'org-1' }, error: null }) };
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      from: (table: string) => table === 'organization_members' ? membership : query,
    };
    const save = () => kind === 'report'
      ? createTermografiaReport(client, { cliente_nome: 'Cliente', data_execucao: '2026-11-11' }, 'stable-id')
      : createTermografiaPoint(client, 'report-1', { setor: 'Setor', local: 'Quadro' }, 1, 'stable-id');
    await expect(save()).rejects.toThrow('resposta perdida');
    await expect(save()).resolves.toMatchObject({ id: 'stable-id', organization_id: 'org-1' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(eq).toHaveBeenCalledWith('id', 'stable-id');
    if (kind === 'point') expect(eq).toHaveBeenCalledWith('report_id', 'report-1');
  });
});
