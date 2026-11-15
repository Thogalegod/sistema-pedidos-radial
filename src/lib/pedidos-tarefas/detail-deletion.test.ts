import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteOrderDetail } from './detail-deletion';

function deletionClient(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.delete.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);

  return {
    client: { from: vi.fn(() => query) },
    query,
  };
}

describe('deleteOrderDetail', () => {
  it.each(['subtarefas', 'comentarios_tarefa'] as const)(
    'deletes one confirmed %s row inside the active organization',
    async (table) => {
      const { client, query } = deletionClient({
        data: { id: 'detail-a' },
        error: null,
      });

      await deleteOrderDetail(
        client as unknown as Pick<SupabaseClient, 'from'>,
        table,
        'org-a',
        'detail-a'
      );

      expect(client.from).toHaveBeenCalledWith(table);
      expect(query.delete).toHaveBeenCalledOnce();
      expect(query.eq).toHaveBeenNthCalledWith(1, 'organization_id', 'org-a');
      expect(query.eq).toHaveBeenNthCalledWith(2, 'id', 'detail-a');
      expect(query.select).toHaveBeenCalledWith('id');
      expect(query.maybeSingle).toHaveBeenCalledOnce();
    }
  );

  it('fails closed when RLS or a stale id removes zero rows', async () => {
    const { client } = deletionClient({ data: null, error: null });

    await expect(
      deleteOrderDetail(
        client as unknown as Pick<SupabaseClient, 'from'>,
        'subtarefas',
        'org-a',
        'missing'
      )
    ).rejects.toThrow('não foi excluído');
  });

  it('propagates a database deletion error', async () => {
    const { client } = deletionClient({
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(
      deleteOrderDetail(
        client as unknown as Pick<SupabaseClient, 'from'>,
        'comentarios_tarefa',
        'org-a',
        'note-a'
      )
    ).rejects.toMatchObject({ message: 'permission denied' });
  });
});
