import { describe, expect, it } from 'vitest';
import { resolveModulePageContext } from './navigation-context';

describe('resolveModulePageContext', () => {
  it.each([
    ['/contratos-locacoes', 'panel', 'Painel', 'Visão geral das locações, cobranças, vencimentos e pendências.', ['Contratos e Locações', 'Painel']],
    ['/contratos-locacoes/cobrancas', 'billings', 'Cobranças', 'Acompanhe documentos emitidos, vencimentos, recebimentos e saldos.', ['Contratos e Locações', 'Cobranças']],
    ['/contratos-locacoes/contratos', 'contracts', 'Locações', 'Crie, consulte e acompanhe locações, equipamentos e documentos.', ['Contratos e Locações', 'Locações']],
    ['/contratos-locacoes/contratos/novo', 'contracts', 'Nova locação', 'Cadastre uma locação vinculando pedido, cliente, obra, equipamentos e documentos.', ['Contratos e Locações', 'Locações', 'Nova locação']],
    ['/contratos-locacoes/contratos/contract-1', 'contracts', 'Detalhe da locação', 'Acompanhe dados, equipamentos, cobranças e documentos desta locação.', ['Contratos e Locações', 'Locações', 'Detalhe da locação']],
    ['/contratos-locacoes/clientes', 'customers', 'Clientes', 'Cadastre e edite clientes, obras e contatos.', ['Contratos e Locações', 'Clientes']],
    ['/contratos-locacoes/clientes/novo', 'customers', 'Novo cliente', 'Cadastre um cliente com suas obras e contatos.', ['Contratos e Locações', 'Clientes', 'Novo cliente']],
    ['/contratos-locacoes/clientes/customer-1', 'customers', 'Detalhe do cliente', 'Consulte e edite os dados, obras e contatos deste cliente.', ['Contratos e Locações', 'Clientes', 'Detalhe do cliente']],
    ['/contratos-locacoes/ativos', 'assets', 'Ativos', 'Cadastre e acompanhe os equipamentos disponíveis para locação.', ['Contratos e Locações', 'Ativos']],
    ['/contratos-locacoes/recibos/billing-1', 'billings', 'Recibo', 'Consulte os dados e o histórico desta cobrança.', ['Contratos e Locações', 'Cobranças', 'Recibo']],
  ] as const)('resolves %s without confusing dynamic and new routes', (pathname, activeSection, title, description, breadcrumb) => {
    expect(resolveModulePageContext(pathname)).toEqual({ activeSection, title, description, breadcrumb });
  });
});
