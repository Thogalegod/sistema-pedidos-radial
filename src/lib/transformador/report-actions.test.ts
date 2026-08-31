import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularRelatorio, type TransformerInput } from '../transformer-calc';
import {
  buildTransformadorInsert,
  buildTransformadorRevisionInput,
  buildTransformadorSupersededUpdate,
} from './report-actions';

const sampleInput: TransformerInput = {
  clienteNome: 'Cliente Teste',
  clienteEndereco: 'Rua A, 123',
  clienteCidade: 'Sao Paulo',
  clienteUf: 'SP',
  clienteCnpj: '00.000.000/0001-00',
  clienteIe: 'ISENTO',
  observacoes: 'Observacao original',
  fabricante: 'Fabricante',
  numeroSerie: 'SER-123',
  potenciaKva: 112.5,
  tensaoAtNominal: 13800,
  tensaoBt: '380',
  resfriamento: 'LN',
  grupoLigacao: 'Subtrativa',
  tipoOleo: 'Mineral',
  procedenciaOleo: 'BR',
  taps: [13800, 13200, 12600],
  tapDespacho: 13200,
  temperaturaC: 27,
  umidadeRelativa: 55,
  dataRelatorio: '2026-07-30',
  responsavelNome: 'Roberto Fontes Lopes',
  responsavelCrea: 'CREA 060.104.922.9',
};

describe('transformador report action helpers', () => {
  it('builds the insert payload with organization ownership and without client numbering', () => {
    const payload = buildTransformadorInsert(sampleInput, {
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(payload).toMatchObject({
      organization_id: 'org-1',
      criado_por: 'user-1',
      cliente_nome: 'Cliente Teste',
      potencia_kva: 112.5,
      tensao_bt_label: '380 / 220 V',
      taps: [13800, 13200, 12600],
      valores_calculados: calcularRelatorio(sampleInput),
      status: 'gerado',
    });
    expect(payload).not.toHaveProperty('numero_relatorio');
    expect(payload).not.toHaveProperty('report_month');
    expect(payload).not.toHaveProperty('sequence_number');
  });

  it('preserves taps as a numeric array and stores calculated values as JSON-compatible data', () => {
    const payload = buildTransformadorInsert(sampleInput, {
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(payload.taps).toEqual([13800, 13200, 12600]);
    expect(JSON.parse(JSON.stringify(payload.valores_calculados))).toMatchObject({
      correnteBt: expect.any(Number),
      taps: expect.arrayContaining([
        expect.objectContaining({
          tensaoAt: 13800,
          relacaoTeorica: expect.any(Number),
        }),
      ]),
    });
  });

  it('links a revision to the original report and keeps the UI observation behavior', () => {
    const revision = buildTransformadorRevisionInput(sampleInput, {
      originalId: 'report-old',
      originalNumber: 'RT-202607-001',
    });

    expect(revision.input.observacoes).toBe('Observacao original\n(Revisão do relatório RT-202607-001)');
    expect(revision.revisedFromId).toBe('report-old');

    expect(
      buildTransformadorSupersededUpdate({
        replacementId: 'report-new',
        replacementNumber: 'RT-202607-002',
        originalObservations: '',
      })
    ).toEqual({
      status: 'revisado',
      superseded_by_id: 'report-new',
      observacoes: 'Substituído pelo relatório RT-202607-002',
    });
  });
});

describe('transformador actions source contract', () => {
  const source = readFileSync(path.resolve(__dirname, '../../app/inspecoes/actions.ts'), 'utf8');
  const helperSource = readFileSync(path.resolve(__dirname, 'report-actions.ts'), 'utf8');

  it('does not calculate report numbers with a client-side count', () => {
    expect(source).not.toMatch(/formatarNumeroRelatorio/);
    expect(source).not.toMatch(/count:\s*'exact'/);
    expect(source).not.toMatch(/\.gte\('criado_em',\s*inicioMes\)/);
  });

  it('uses the active organization when reading and mutating reports', () => {
    expect(source).toMatch(/getCurrentOrganizationId/);
    expect(helperSource).toMatch(/organization_id:\s*context\.organizationId/);
    expect(source).toMatch(/\.eq\('organization_id',\s*organizationId\)/);
  });

  it('creates revisions through the atomic RPC instead of client-side insert then update', () => {
    const revisionSource = source.slice(source.indexOf('export async function criarRevisao'));

    expect(revisionSource).toMatch(/\.rpc\('create_transformador_revision'/);
    expect(revisionSource).toMatch(/p_organization_id:\s*organizationId/);
    expect(revisionSource).toMatch(/p_original_id:\s*idOrigem/);
    expect(revisionSource).toMatch(/p_report:\s*payload/);
    expect(revisionSource).not.toMatch(/insertRelatorioTransformador/);
    expect(revisionSource).not.toMatch(/\.from\('relatorios_transformador'\)[\s\S]*\.update\(/);
  });
});
