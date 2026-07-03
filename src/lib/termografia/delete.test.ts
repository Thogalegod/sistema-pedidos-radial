import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted garante que as variáveis existem quando vi.mock é executado (hoisted)
const { mockList, mockRemove, mockEq, mockStorageFrom, mockTableFrom } = vi.hoisted(() => {
  const mockList = vi.fn();
  const mockRemove = vi.fn();
  const mockEq = vi.fn();
  const mockStorageFrom = vi.fn();
  const mockTableFrom = vi.fn();
  return { mockList, mockRemove, mockEq, mockStorageFrom, mockTableFrom };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: mockStorageFrom },
    from: mockTableFrom,
  },
}));

import { deletarRelatorio } from './delete';

beforeEach(() => {
  vi.clearAllMocks();
  mockStorageFrom.mockReturnValue({ list: mockList, remove: mockRemove });
  // .from().delete() chain returns { eq: mockEq }
  mockTableFrom.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: mockEq }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deletarRelatorio', () => {
  it('remove fotos e exclui o relatório com sucesso', async () => {
    mockList.mockResolvedValue({
      data: [{ name: 'foto1-digital.jpg' }, { name: 'foto1-termica.jpg' }],
      error: null,
    });
    mockRemove.mockResolvedValue({ error: null });
    mockEq.mockResolvedValue({ error: null });

    const result = await deletarRelatorio('rel-123', 'RT-202607-001');

    expect(result).toEqual({ error: null });
    expect(mockStorageFrom).toHaveBeenCalledWith('documentos-cabine');
    expect(mockList).toHaveBeenCalledWith('termografia/RT-202607-001/');
    expect(mockRemove).toHaveBeenCalledWith([
      'termografia/RT-202607-001/foto1-digital.jpg',
      'termografia/RT-202607-001/foto1-termica.jpg',
    ]);
    expect(mockTableFrom).toHaveBeenCalledWith('relatorios_termografia');
    expect(mockEq).toHaveBeenCalledWith('id', 'rel-123');
  });

  it('retorna erro quando falha ao remover fotos do Storage', async () => {
    mockList.mockResolvedValue({
      data: [{ name: 'foto.jpg' }],
      error: null,
    });
    mockRemove.mockResolvedValue({ error: { message: 'Storage error' } });

    const result = await deletarRelatorio('rel-123', 'RT-202607-001');

    expect(result.error).toContain('Erro ao remover fotos');
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('retorna erro quando falha ao excluir o relatório do banco', async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    mockEq.mockResolvedValue({ error: { message: 'Database error' } });

    const result = await deletarRelatorio('rel-123', 'RT-202607-001');

    expect(result.error).toContain('Erro ao excluir relatório');
  });

  it('funciona mesmo sem fotos no Storage', async () => {
    mockList.mockResolvedValue({ data: [], error: null });
    mockEq.mockResolvedValue({ error: null });

    const result = await deletarRelatorio('rel-123', 'RT-202607-001');

    expect(result).toEqual({ error: null });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('chama list com o prefixo correto', async () => {
    mockList.mockResolvedValue({ data: null, error: null });
    mockEq.mockResolvedValue({ error: null });

    await deletarRelatorio('rel-123', 'RT-202607-001');

    expect(mockStorageFrom).toHaveBeenCalledWith('documentos-cabine');
    expect(mockList).toHaveBeenCalledWith('termografia/RT-202607-001/');
  });
});
