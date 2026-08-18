export type ModuleSection = 'panel' | 'contracts' | 'customers' | 'assets' | 'billings';

export interface ModulePageContextValue {
  activeSection: ModuleSection;
  title: string;
  description: string;
  breadcrumb: string[];
}

const ROOT = '/contratos-locacoes';

export function resolveModulePageContext(pathname: string): ModulePageContextValue {
  if (pathname === ROOT) {
    return context('panel', 'Painel', 'Visão geral das locações, cobranças, vencimentos e pendências.');
  }

  if (pathname.startsWith(`${ROOT}/cobrancas`)) {
    return context('billings', 'Cobranças', 'Acompanhe documentos emitidos, vencimentos, recebimentos e saldos.');
  }

  if (pathname.startsWith(`${ROOT}/ativos`)) {
    return context('assets', 'Ativos', 'Cadastre e acompanhe os equipamentos disponíveis para locação.');
  }

  if (pathname.startsWith(`${ROOT}/clientes`)) {
    if (pathname === `${ROOT}/clientes/novo`) {
      return nestedContext('customers', 'Clientes', 'Novo cliente', 'Cadastre um cliente com suas obras e contatos.');
    }

    if (pathname !== `${ROOT}/clientes`) {
      return nestedContext('customers', 'Clientes', 'Detalhe do cliente', 'Consulte e edite os dados, obras e contatos deste cliente.');
    }

    return context('customers', 'Clientes', 'Cadastre e edite clientes, obras e contatos.');
  }

  if (pathname === `${ROOT}/contratos/novo`) {
    return nestedContext('contracts', 'Locações', 'Nova locação', 'Cadastre uma locação vinculando pedido, cliente, obra, equipamentos e documentos.');
  }

  if (pathname.startsWith(`${ROOT}/contratos/`)) {
    return nestedContext('contracts', 'Locações', 'Detalhe da locação', 'Acompanhe dados, equipamentos, cobranças e documentos desta locação.');
  }

  if (pathname === `${ROOT}/contratos`) {
    return context('contracts', 'Locações', 'Crie, consulte e acompanhe locações, equipamentos e documentos.');
  }

  if (pathname.startsWith(`${ROOT}/recibos/`)) {
    return nestedContext('billings', 'Cobranças', 'Recibo', 'Consulte os dados e o histórico desta cobrança.');
  }

  return context('panel', 'Painel', 'Visão geral das locações, cobranças, vencimentos e pendências.');
}

function context(activeSection: ModuleSection, title: string, description: string): ModulePageContextValue {
  return {
    activeSection,
    title,
    description,
    breadcrumb: ['Contratos e Locações', title],
  };
}

function nestedContext(activeSection: ModuleSection, parent: string, title: string, description: string): ModulePageContextValue {
  return {
    activeSection,
    title,
    description,
    breadcrumb: ['Contratos e Locações', parent, title],
  };
}
