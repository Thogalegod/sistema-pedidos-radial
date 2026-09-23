import {
  Building2,
  Camera,
  ClipboardList,
  FileText,
  House,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScrollText,
  Users,
} from 'lucide-react';

export const CENTRAL = { id: 'central', label: 'Central', href: '/hub', icon: House };

export const REPORT_SUBMENU = [
  { id: 'reports-cabin', label: 'Cabine Primária', href: '/relatorios-tecnicos/cabine-primaria', icon: Building2 },
  { id: 'reports-transformer', label: 'Transformador', href: '/relatorios-tecnicos/transformador', icon: FileText },
  { id: 'reports-thermography', label: 'Termografia', href: '/termografia', icon: Camera },
];

export const RENTAL_SUBMENU = [
  { id: 'rentals-panel', label: 'Painel', href: '/contratos-locacoes', icon: LayoutDashboard },
  { id: 'rentals-contracts', label: 'Locações', href: '/contratos-locacoes/contratos', icon: ScrollText },
  { id: 'rentals-customers', label: 'Clientes', href: '/contratos-locacoes/clientes', icon: Users },
  { id: 'rentals-assets', label: 'Ativos', href: '/contratos-locacoes/ativos', icon: Package },
  { id: 'rentals-billings', label: 'Cobranças', href: '/contratos-locacoes/cobrancas', icon: ReceiptText },
];

export const MODULES = [
  { id: 'orders', label: 'Controle de Pedidos', href: '/', icon: LayoutDashboard, description: 'Gerencie pedidos, tarefas e prazos da equipe.' },
  { id: 'reports', label: 'Relatórios Técnicos', href: '/relatorios-tecnicos', icon: FileText, description: 'Acesse inspeções, termografia e relatórios de equipamentos.', children: REPORT_SUBMENU },
  { id: 'rentals', label: 'Controle de Locações', href: '/contratos-locacoes', icon: ClipboardList, description: 'Acompanhe contratos, clientes, cobranças e itens locados.', children: RENTAL_SUBMENU },
];

const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export function isNavigationActive(id: string, path: string) {
  switch (id) {
    case 'central': return path === '/hub';
    case 'orders': return path === '/';
    case 'reports': return ['/relatorios-tecnicos', '/inspecoes', '/cabine', '/termografia'].some(root => within(path, root));
    case 'reports-cabin': return within(path, '/relatorios-tecnicos/cabine-primaria') || within(path, '/cabine');
    case 'reports-transformer': return within(path, '/relatorios-tecnicos/transformador') || within(path, '/inspecoes');
    case 'reports-thermography': return within(path, '/termografia');
    case 'rentals': return within(path, '/contratos-locacoes');
    case 'rentals-panel': return path === '/contratos-locacoes';
    case 'customers':
    case 'rentals-customers': return within(path, '/contratos-locacoes/clientes');
    case 'contracts':
    case 'rentals-contracts': return within(path, '/contratos-locacoes/contratos');
    case 'rentals-assets': return within(path, '/contratos-locacoes/ativos');
    case 'billings':
    case 'rentals-billings': return within(path, '/contratos-locacoes/cobrancas') || within(path, '/contratos-locacoes/recibos');
    default: return false;
  }
}

export function usesAppShell(path: string) {
  if (path.endsWith('/imprimir') || path.endsWith('/visualizar')) return false;
  if (/^\/inspecoes\/[^/]+$/.test(path) && path !== '/inspecoes/nova') return false;
  return path === '/' || ['/hub', '/contratos-locacoes', '/relatorios-tecnicos', '/inspecoes', '/cabine', '/termografia', '/configuracoes']
    .some(root => within(path, root));
}
