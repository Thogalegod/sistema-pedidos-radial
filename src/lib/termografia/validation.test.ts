import { describe, expect, it } from 'vitest';
import { termografiaCreateReportSchema } from './validation';

describe('termografiaCreateReportSchema', () => {
  it('accepts a minimal valid report draft', () => {
    const result = termografiaCreateReportSchema.safeParse({
      clienteNome: 'Cliente QA',
      dataExecucao: '2026-07-24',
      responsavelNome: 'Roberto Fontes Lopes',
      responsavelCrea: '0601049229',
      pontos: [
        {
          setor: 'Painel A',
          local: 'Disjuntor principal',
          inspecionado: true,
          ocorrencia: false,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
