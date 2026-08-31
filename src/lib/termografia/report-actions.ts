import {
  removeRegisteredTermografiaFile,
  uploadTermografiaPhoto,
} from './storage';
import {
  TermografiaFileRow,
  TermografiaPointRow,
  TermografiaRelatorio,
  TermografiaReportRow,
} from './types';

type SupabaseLike = any;

export type TermografiaReportListItem = TermografiaReportRow & {
  pontos_count: number;
  ocorrencias_count: number;
};

export type TermografiaReportInput = Partial<Pick<
  TermografiaReportRow,
  | 'cliente_cnpj'
  | 'cliente_endereco'
  | 'cliente_cidade'
  | 'cliente_uf'
  | 'cliente_cep'
  | 'objetivo'
  | 'equipamento'
  | 'responsavel_nome'
  | 'responsavel_crea'
  | 'revisao'
  | 'status'
>> & Pick<TermografiaReportRow, 'cliente_nome' | 'data_execucao'>;

export type TermografiaPointInput = Partial<Pick<
  TermografiaPointRow,
  | 'equipamento'
  | 'componente'
  | 'inspecionado'
  | 'ocorrencia'
  | 'temperatura'
  | 'data_hora_foto'
  | 'classificacao'
  | 'risco'
  | 'diagnostico'
  | 'recomendacao'
  | 'conclusao'
>> & Pick<TermografiaPointRow, 'setor' | 'local'>;

function throwIfError(error: unknown) {
  if (error) throw error;
}

export async function getActiveTermografiaOrganizationId(client: SupabaseLike) {
  const { data: userData, error: userError } = await client.auth.getUser();
  throwIfError(userError);
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  const { data, error } = await client
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  throwIfError(error);
  if (!data?.organization_id) {
    throw new Error('Usuário sem organização ativa para Termografia.');
  }

  return data.organization_id as string;
}

function cleanReportPayload(input: Partial<TermografiaReportInput>) {
  return {
    cliente_nome: input.cliente_nome,
    cliente_cnpj: input.cliente_cnpj || null,
    cliente_endereco: input.cliente_endereco || null,
    cliente_cidade: input.cliente_cidade || null,
    cliente_uf: input.cliente_uf || null,
    cliente_cep: input.cliente_cep || null,
    data_execucao: input.data_execucao,
    objetivo: input.objetivo || undefined,
    equipamento: input.equipamento || undefined,
    responsavel_nome: input.responsavel_nome || undefined,
    responsavel_crea: input.responsavel_crea || undefined,
    revisao: input.revisao ?? undefined,
    status: input.status ?? undefined,
  };
}

export async function listTermografiaReports(client: SupabaseLike) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data: reports, error: reportsError } = await client
    .from('relatorios_termografia')
    .select('*')
    .eq('organization_id', organizationId)
    .order('criado_em', { ascending: false });
  throwIfError(reportsError);

  const reportRows = (reports ?? []) as TermografiaReportRow[];
  if (reportRows.length === 0) return [];

  const { data: points, error: pointsError } = await client
    .from('termografia_pontos')
    .select('id, organization_id, report_id, ocorrencia')
    .eq('organization_id', organizationId);
  throwIfError(pointsError);

  const pointsByReport = new Map<string, { total: number; ocorrencias: number }>();
  for (const point of (points ?? []) as TermografiaPointRow[]) {
    const current = pointsByReport.get(point.report_id) ?? { total: 0, ocorrencias: 0 };
    current.total += 1;
    if (point.ocorrencia) current.ocorrencias += 1;
    pointsByReport.set(point.report_id, current);
  }

  return reportRows.map((report) => {
    const counts = pointsByReport.get(report.id) ?? { total: 0, ocorrencias: 0 };
    return {
      ...report,
      pontos_count: counts.total,
      ocorrencias_count: counts.ocorrencias,
    };
  }) as TermografiaReportListItem[];
}

export async function createTermografiaReport(client: SupabaseLike, input: TermografiaReportInput) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data, error } = await client
    .from('relatorios_termografia')
    .insert({
      organization_id: organizationId,
      ...cleanReportPayload(input),
    })
    .select('*')
    .single();

  throwIfError(error);
  return data as TermografiaReportRow;
}

export async function updateTermografiaReport(client: SupabaseLike, reportId: string, input: Partial<TermografiaReportInput>) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data, error } = await client
    .from('relatorios_termografia')
    .update(cleanReportPayload(input))
    .eq('organization_id', organizationId)
    .eq('id', reportId)
    .select('*')
    .single();

  throwIfError(error);
  return data as TermografiaReportRow;
}

export async function loadTermografiaReport(client: SupabaseLike, reportId: string) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data: report, error: reportError } = await client
    .from('relatorios_termografia')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', reportId)
    .single();
  throwIfError(reportError);

  const { data: points, error: pointsError } = await client
    .from('termografia_pontos')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('report_id', reportId)
    .order('ordem', { ascending: true });
  throwIfError(pointsError);

  const { data: files, error: filesError } = await client
    .from('termografia_arquivos')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('report_id', reportId);
  throwIfError(filesError);

  return mapTermografiaReport({
    report: report as TermografiaReportRow,
    points: (points ?? []) as TermografiaPointRow[],
    files: (files ?? []) as TermografiaFileRow[],
  });
}

export function mapTermografiaReport(input: {
  report: Partial<TermografiaReportRow>;
  points: Partial<TermografiaPointRow>[];
  files: Partial<TermografiaFileRow>[];
}): TermografiaRelatorio {
  const filesByPoint = new Map<string, Partial<TermografiaFileRow>[]>();
  for (const file of input.files) {
    if (!file.point_id) continue;
    filesByPoint.set(file.point_id, [...(filesByPoint.get(file.point_id) ?? []), file]);
  }

  const pontos = [...input.points]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((point) => {
      const pointFiles = filesByPoint.get(point.id ?? '') ?? [];
      const digital = pointFiles.find((file) => file.tipo === 'digital');
      const termica = pointFiles.find((file) => file.tipo === 'termica');
      return {
        id: point.id ?? '',
        setor: point.setor ?? '',
        local: point.local ?? '',
        inspecionado: point.inspecionado ?? true,
        ocorrencia: point.ocorrencia ?? false,
        componente: point.componente ?? undefined,
        temperatura: point.temperatura ?? undefined,
        dataHoraFoto: point.data_hora_foto ?? undefined,
        classificacao: point.classificacao ?? undefined,
        risco: point.risco ?? undefined,
        conclusao: point.conclusao ?? undefined,
        fotoDigitalUrl: digital?.storage_path ?? null,
        fotoTermicaUrl: termica?.storage_path ?? null,
        fotoDigitalArquivoId: digital?.id ?? null,
        fotoTermicaArquivoId: termica?.id ?? null,
      };
    });

  return {
    id: input.report.id ?? '',
    organization_id: input.report.organization_id ?? '',
    numero_relatorio: input.report.numero_relatorio ?? '',
    criado_em: input.report.criado_em ?? '',
    status: input.report.status ?? 'gerado',
    cliente_nome: input.report.cliente_nome ?? '',
    cliente_endereco: input.report.cliente_endereco ?? '',
    cliente_cidade: input.report.cliente_cidade ?? '',
    cliente_uf: input.report.cliente_uf ?? '',
    cliente_cep: input.report.cliente_cep ?? null,
    cliente_cnpj: input.report.cliente_cnpj ?? null,
    data_execucao: input.report.data_execucao ?? '',
    objetivo: input.report.objetivo ?? 'Estudo Termográfico da subestação primária e dos painéis elétricos',
    equipamento: input.report.equipamento ?? 'Flir InfraCAM SD',
    responsavel_nome: input.report.responsavel_nome ?? 'Roberto Fontes Lopes',
    responsavel_crea: input.report.responsavel_crea ?? '0601049229',
    revisao: input.report.revisao ?? 0,
    pontos,
  };
}

function pointPayload(input: TermografiaPointInput, organizationId: string, reportId: string, ordem: number) {
  return {
    organization_id: organizationId,
    report_id: reportId,
    ordem,
    setor: input.setor,
    local: input.local,
    equipamento: input.equipamento || null,
    componente: input.componente || null,
    inspecionado: input.inspecionado ?? true,
    ocorrencia: input.ocorrencia ?? false,
    temperatura: input.temperatura || null,
    data_hora_foto: input.data_hora_foto || null,
    classificacao: input.classificacao || null,
    risco: input.risco || null,
    diagnostico: input.diagnostico || null,
    recomendacao: input.recomendacao || null,
    conclusao: input.conclusao || null,
  };
}

export async function createTermografiaPoint(client: SupabaseLike, reportId: string, input: TermografiaPointInput, ordem: number) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data, error } = await client
    .from('termografia_pontos')
    .insert(pointPayload(input, organizationId, reportId, ordem))
    .select('*')
    .single();

  throwIfError(error);
  return data as TermografiaPointRow;
}

export async function updateTermografiaPoint(client: SupabaseLike, reportId: string, pointId: string, input: Partial<TermografiaPointInput>) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data, error } = await client
    .from('termografia_pontos')
    .update(input)
    .eq('organization_id', organizationId)
    .eq('report_id', reportId)
    .eq('id', pointId)
    .select('*')
    .single();

  throwIfError(error);
  return data as TermografiaPointRow;
}

async function listFilesForPoint(client: SupabaseLike, organizationId: string, reportId: string, pointId: string) {
  const { data, error } = await client
    .from('termografia_arquivos')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('report_id', reportId)
    .eq('point_id', pointId);

  throwIfError(error);
  return (data ?? []) as TermografiaFileRow[];
}

export async function deleteTermografiaPoint(client: SupabaseLike, reportId: string, pointId: string, deps = {
  removeRegisteredFile: removeRegisteredTermografiaFile,
}) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const files = await listFilesForPoint(client, organizationId, reportId, pointId);

  for (const file of files) {
    await deps.removeRegisteredFile(client, file);
  }

  const { error } = await client
    .from('termografia_pontos')
    .delete()
    .eq('organization_id', organizationId)
    .eq('report_id', reportId)
    .eq('id', pointId);

  throwIfError(error);
}

export async function deleteTermografiaReport(client: SupabaseLike, reportId: string, deps = {
  removeRegisteredFile: removeRegisteredTermografiaFile,
}) {
  const organizationId = await getActiveTermografiaOrganizationId(client);
  const { data: points, error: pointsError } = await client
    .from('termografia_pontos')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('report_id', reportId)
    .order('ordem', { ascending: true });
  throwIfError(pointsError);

  const { data: files, error: filesError } = await client
    .from('termografia_arquivos')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('report_id', reportId);
  throwIfError(filesError);

  for (const file of (files ?? []) as TermografiaFileRow[]) {
    await deps.removeRegisteredFile(client, file);
  }

  for (const point of (points ?? []) as TermografiaPointRow[]) {
    const { error } = await client
      .from('termografia_pontos')
      .delete()
      .eq('organization_id', organizationId)
      .eq('report_id', reportId)
      .eq('id', point.id);
    throwIfError(error);
  }

  const { error } = await client
    .from('relatorios_termografia')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', reportId);

  throwIfError(error);
}

export { uploadTermografiaPhoto };
