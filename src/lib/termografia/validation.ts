import { z } from 'zod';

export const termografiaPointDraftSchema = z.object({
  id: z.string().optional(),
  setor: z.string().trim().min(1, 'Informe o setor/área.'),
  local: z.string().trim().min(1, 'Informe o local.'),
  inspecionado: z.boolean(),
  ocorrencia: z.boolean(),
  componente: z.string().trim().optional(),
  temperatura: z.string().trim().optional(),
  dataHoraFoto: z.string().trim().optional(),
  classificacao: z.enum(['Normal', 'Observação', 'Intervenção Programada', 'Intervenção Imediata', 'Crítico']).optional(),
  risco: z.enum(['Baixo', 'Médio', 'Alto']).optional(),
  conclusao: z.string().trim().optional(),
  fotoDigitalUrl: z.string().trim().nullable().optional(),
  fotoTermicaUrl: z.string().trim().nullable().optional(),
});

export const termografiaCreateReportSchema = z.object({
  clienteNome: z.string().trim().min(1, 'Informe o cliente.'),
  dataExecucao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.'),
  responsavelNome: z.string().trim().min(1, 'Informe o responsável técnico.'),
  responsavelCrea: z.string().trim().min(1, 'Informe o CREA.'),
  pontos: z.array(termografiaPointDraftSchema).min(1, 'Informe ao menos um ponto.'),
});

export type TermografiaPointDraftInput = z.infer<typeof termografiaPointDraftSchema>;
export type TermografiaCreateReportInput = z.infer<typeof termografiaCreateReportSchema>;
