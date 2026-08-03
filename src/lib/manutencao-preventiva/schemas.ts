import { z } from 'zod';

const emptyToNull = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const lowerText = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase() : value
);

const optionalText = z.preprocess(emptyToNull, z.string().trim().nullable().optional())
  .transform((value) => value ?? null);

const jsonObjectSchema = z.record(z.string(), z.unknown());
const uuidSchema = z.string().trim().uuid('Identificador inválido');
const isoDateSchema = z.string().trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve usar o formato YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Data inválida');

export const cabinePrimariaDraftSchema = z.object({
  customer_id: uuidSchema,
  site_id: uuidSchema,
  nome: z.string().trim().min(1, 'Nome da cabine é obrigatório'),
  identificacao: optionalText,
  tipo: z.preprocess(
    lowerText,
    z.enum(['convencional', 'simplificada']).default('convencional')
  ),
  status: z.enum(['ativa', 'inativa']).default('ativa'),
  observacoes: optionalText,
});

export const cabineEquipamentoDraftSchema = z.object({
  cabine_id: uuidSchema,
  tipo: z.preprocess(lowerText, z.enum(['transformador', 'disjuntor_15kv'])),
  tag: z.string().trim().min(1, 'TAG do equipamento é obrigatória'),
  descricao: optionalText,
  fabricante: optionalText,
  numero_serie: optionalText,
  potencia_kva: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return null;
    return typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value;
  }, z.number().positive('Potência deve ser maior que zero').nullable().optional())
    .transform((value) => value ?? null),
  status: z.enum(['ativo', 'inativo']).default('ativo'),
  dados_tecnicos: jsonObjectSchema.default({}),
});

export const manutencaoPreventivaDraftSchema = z.object({
  cabine_id: uuidSchema,
  ano_referencia: z.preprocess((value) => {
    if (typeof value === 'string') return Number(value.trim());
    return value;
  }, z.number().int().min(2000).max(9999)),
  data_execucao: isoDateSchema,
  responsavel_nome: optionalText,
  responsavel_crea: optionalText,
  status: z.enum(['rascunho', 'concluida', 'cancelada']).default('rascunho'),
  observacoes: optionalText,
});

export const manutencaoFichaTransformadorDraftSchema = z.object({
  manutencao_id: uuidSchema,
  equipamento_id: uuidSchema,
  dados_ficha: jsonObjectSchema,
});

export const manutencaoFichaDisjuntorDraftSchema = z.object({
  manutencao_id: uuidSchema,
  equipamento_id: uuidSchema,
  dados_ficha: jsonObjectSchema,
});

export type CabinePrimariaDraftInput = z.input<typeof cabinePrimariaDraftSchema>;
export type CabineEquipamentoDraftInput = z.input<typeof cabineEquipamentoDraftSchema>;
export type ManutencaoPreventivaDraftInput = z.input<typeof manutencaoPreventivaDraftSchema>;
export type ManutencaoFichaTransformadorDraftInput = z.input<typeof manutencaoFichaTransformadorDraftSchema>;
export type ManutencaoFichaDisjuntorDraftInput = z.input<typeof manutencaoFichaDisjuntorDraftSchema>;
