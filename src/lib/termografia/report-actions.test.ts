import { describe, expect, it, vi } from 'vitest';
import {
  createTermografiaReport,
  deleteTermografiaPoint,
  deleteTermografiaReport,
  listTermografiaReports,
  mapTermografiaReport,
} from './report-actions';

function queryResult(data: unknown, error: unknown = null) {
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    single: vi.fn(async () => ({ data, error })),
    maybeSingle: vi.fn(async () => ({ data, error })),
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error }),
  };
  return query;
}

function clientWithTables(tables: Record<string, unknown>) {
  const tableQueries: Record<string, ReturnType<typeof queryResult>> = {};
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      const query = queryResult(tables[table] ?? null);
      tableQueries[table] = query;
      return query;
    }),
  };
  return { client, tableQueries };
}

describe('termografia report actions', () => {
  it('lists reports only for the active user organization and maps occurrence counts', async () => {
    const { client, tableQueries } = clientWithTables({
      organization_members: { organization_id: 'org-1' },
      relatorios_termografia: [
        { id: 'report-1', organization_id: 'org-1', numero_relatorio: 'RT-2026-001', cliente_nome: 'Cliente', data_execucao: '2026-07-24', status: 'gerado', criado_em: '2026-07-24T10:00:00Z' },
      ],
      termografia_pontos: [
        { id: 'point-1', report_id: 'report-1', organization_id: 'org-1', ordem: 1, setor: 'QGBT', local: 'Entrada', inspecionado: true, ocorrencia: true },
      ],
    });

    const rows = await listTermografiaReports(client);

    expect(rows).toEqual([
      expect.objectContaining({ id: 'report-1', ocorrencias_count: 1, pontos_count: 1 }),
    ]);
    expect(tableQueries.relatorios_termografia.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(tableQueries.termografia_pontos.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });

  it('creates a report without client supplied numbering fields', async () => {
    const { client, tableQueries } = clientWithTables({
      organization_members: { organization_id: 'org-1' },
      relatorios_termografia: { id: 'report-1', organization_id: 'org-1', numero_relatorio: 'RT-2026-001' },
    });

    await createTermografiaReport(client, {
      cliente_nome: 'Cliente',
      data_execucao: '2026-07-24',
    });

    const insertMock = tableQueries.relatorios_termografia.insert as ReturnType<typeof vi.fn>;
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ organization_id: 'org-1', cliente_nome: 'Cliente' });
    expect(payload).not.toHaveProperty('report_year');
    expect(payload).not.toHaveProperty('sequence_number');
    expect(payload).not.toHaveProperty('numero_relatorio');
  });

  it('maps normalized point and file rows to the UI report shape', () => {
    const report = mapTermografiaReport({
      report: { id: 'report-1', numero_relatorio: 'RT-2026-001', criado_em: '2026-07-24T10:00:00Z', status: 'gerado', cliente_nome: 'Cliente', cliente_endereco: null, cliente_cidade: null, cliente_uf: null, data_execucao: '2026-07-24', objetivo: null, equipamento: null, responsavel_nome: null, responsavel_crea: null, revisao: 0 },
      points: [{ id: 'point-1', ordem: 1, setor: 'QGBT', local: 'Entrada', inspecionado: true, ocorrencia: true, componente: 'Disjuntor', temperatura: '76', data_hora_foto: '2026-07-24T10:00:00Z', classificacao: 'Crítico', risco: 'Alto', conclusao: 'Corrigir' }],
      files: [
        { point_id: 'point-1', tipo: 'digital', storage_path: 'org/report/point/digital.jpg' },
        { point_id: 'point-1', tipo: 'termica', storage_path: 'org/report/point/termica.jpg' },
      ],
    });

    expect(report.pontos).toEqual([
      expect.objectContaining({
        id: 'point-1',
        fotoDigitalUrl: 'org/report/point/digital.jpg',
        fotoTermicaUrl: 'org/report/point/termica.jpg',
        dataHoraFoto: '2026-07-24T10:00:00Z',
      }),
    ]);
  });

  it('deletes a point only after every registered object removal is confirmed', async () => {
    const { client, tableQueries } = clientWithTables({
      organization_members: { organization_id: 'org-1' },
      termografia_arquivos: [
        { id: 'file-1', storage_path: 'org/report/point/digital.jpg' },
        { id: 'file-2', storage_path: 'org/report/point/termica.jpg' },
      ],
      termografia_pontos: null,
    });
    const removeRegisteredFile = vi.fn().mockResolvedValue(undefined);

    await deleteTermografiaPoint(client, 'report-1', 'point-1', { removeRegisteredFile });

    expect(removeRegisteredFile).toHaveBeenNthCalledWith(1, client, expect.objectContaining({ id: 'file-1' }));
    expect(removeRegisteredFile).toHaveBeenNthCalledWith(2, client, expect.objectContaining({ id: 'file-2' }));
    expect(tableQueries.termografia_pontos.delete).toHaveBeenCalled();
    expect(tableQueries.termografia_pontos.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(tableQueries.termografia_pontos.eq).toHaveBeenCalledWith('report_id', 'report-1');
    expect(tableQueries.termografia_pontos.eq).toHaveBeenCalledWith('id', 'point-1');
  });

  it('stops report deletion when a registered object removal is not confirmed', async () => {
    const { client, tableQueries } = clientWithTables({
      organization_members: { organization_id: 'org-1' },
      termografia_pontos: [{ id: 'point-1', report_id: 'report-1' }],
      termografia_arquivos: [{ id: 'file-1', storage_path: 'org/report/point/digital.jpg' }],
      relatorios_termografia: null,
    });
    const removeRegisteredFile = vi.fn().mockRejectedValue(new Error('Storage não confirmou a remoção'));

    await expect(deleteTermografiaReport(client, 'report-1', { removeRegisteredFile })).rejects.toThrow('Storage não confirmou');

    expect(client.from).not.toHaveBeenCalledWith('relatorios_termografia');
  });
});
