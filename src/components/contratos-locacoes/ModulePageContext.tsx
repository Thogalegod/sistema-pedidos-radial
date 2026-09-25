'use client';

import { usePathname } from 'next/navigation';
import { FileText, LayoutDashboard, List, Package, Users } from 'lucide-react';
import { PageHeader, type BreadcrumbItem } from '@/components/app-shell/PageHeader';
import { resolveModulePageContext, type ModuleSection } from '@/lib/contratos-locacoes/navigation-context';

const navigation = [
  { section: 'panel', href: '/contratos-locacoes', label: 'Painel', icon: LayoutDashboard },
  { section: 'contracts', href: '/contratos-locacoes/contratos', label: 'Locações', icon: List },
  { section: 'customers', href: '/contratos-locacoes/clientes', label: 'Clientes', icon: Users },
  { section: 'assets', href: '/contratos-locacoes/ativos', label: 'Ativos', icon: Package },
  { section: 'billings', href: '/contratos-locacoes/cobrancas', label: 'Cobranças', icon: FileText },
] satisfies Array<{ section: ModuleSection; href: string; label: string; icon: typeof LayoutDashboard }>;

const parentHref: Partial<Record<string, string>> = {
  Locações: '/contratos-locacoes/contratos',
  Clientes: '/contratos-locacoes/clientes',
  Ativos: '/contratos-locacoes/ativos',
  Cobranças: '/contratos-locacoes/cobrancas',
};

export function ModulePageContext() {
  const page = resolveModulePageContext(usePathname());
  const moduleBreadcrumb = page.breadcrumb.slice(1);
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Central', href: '/hub' },
    {
      label: 'Controle de Locações',
      href: moduleBreadcrumb.length > 0 ? '/contratos-locacoes' : undefined,
    },
    ...moduleBreadcrumb.map((label, index) => ({
      label,
      href: index < moduleBreadcrumb.length - 1 ? parentHref[label] : undefined,
    })),
  ];

  return <PageHeader
    breadcrumbs={breadcrumbs}
    title={page.title}
    description={page.description}
    tabs={navigation.map(({ section, href, label }) => ({
      href,
      label,
      active: page.activeSection === section,
    }))}
  />;
}
