import { describe, expect, it } from 'vitest';
import { MODULES, REPORT_SUBMENU, RENTAL_SUBMENU, isNavigationActive, usesAppShell } from './navigation';

describe('navegação Radial', () => {
  it('conserva as rotas principais e expõe somente subáreas com rotas reais', () => {
    expect(MODULES.map(item => item.href)).toEqual(['/', '/relatorios-tecnicos', '/contratos-locacoes']);
    expect(REPORT_SUBMENU.map(item => [item.label, item.href])).toEqual([
      ['Cabine Primária', '/relatorios-tecnicos/cabine-primaria'],
      ['Transformador', '/relatorios-tecnicos/transformador'],
      ['Termografia', '/termografia'],
    ]);
    expect(RENTAL_SUBMENU.map(item => [item.label, item.href])).toEqual([
      ['Painel', '/contratos-locacoes'],
      ['Locações', '/contratos-locacoes/contratos'],
      ['Clientes', '/contratos-locacoes/clientes'],
      ['Ativos', '/contratos-locacoes/ativos'],
      ['Cobranças', '/contratos-locacoes/cobrancas'],
    ]);
  });
  it.each(['/termografia/nova', '/cabine', '/inspecoes/nova', '/relatorios-tecnicos/transformador'])(
    'reconhece %s como parte de Relatórios Técnicos', path => {
      expect(isNavigationActive('reports', path)).toBe(true);
      expect(isNavigationActive('orders', path)).toBe(false);
    });
  it('reconhece faturas individuais dentro de Cobranças e Faturas', () => {
    expect(isNavigationActive('billings', '/contratos-locacoes/recibos/abc')).toBe(true);
    expect(isNavigationActive('rentals', '/contratos-locacoes/clientes/abc')).toBe(true);
    expect(isNavigationActive('customers', '/contratos-locacoes/clientes/abc')).toBe(true);
    expect(isNavigationActive('customers', '/contratos-locacoes/clientes-outro')).toBe(false);
    expect(isNavigationActive('orders', '/hub')).toBe(false);
  });
  it.each(['/login', '/redefinir-senha', '/cabine/abc/imprimir', '/termografia/abc/imprimir',
    '/inspecoes/abc', '/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-transformador/visualizar'])(
    'preserva %s fora do shell', path => expect(usesAppShell(path)).toBe(false));
  it.each(['/', '/hub', '/contratos-locacoes/clientes/abc', '/contratos-locacoes/recibos/abc'])(
    'mantém o shell no acesso direto a %s', path => expect(usesAppShell(path)).toBe(true));
});
