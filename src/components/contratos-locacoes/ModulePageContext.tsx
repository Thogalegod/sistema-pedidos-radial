'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, FileText, LayoutDashboard, List, Package, Users } from 'lucide-react';
import { resolveModulePageContext, type ModuleSection } from '@/lib/contratos-locacoes/navigation-context';

const navigation = [
  { section: 'panel', href: '/contratos-locacoes', label: 'Painel', icon: LayoutDashboard },
  { section: 'contracts', href: '/contratos-locacoes/contratos', label: 'Locações', icon: List },
  { section: 'customers', href: '/contratos-locacoes/clientes', label: 'Clientes', icon: Users },
  { section: 'assets', href: '/contratos-locacoes/ativos', label: 'Ativos', icon: Package },
  { section: 'billings', href: '/contratos-locacoes/cobrancas', label: 'Cobranças', icon: FileText },
] satisfies Array<{ section: ModuleSection; href: string; label: string; icon: typeof LayoutDashboard }>;

export function ModulePageContext() {
  const page = resolveModulePageContext(usePathname());

  return (
    <header className="mb-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow-lg md:p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <nav aria-label="Navegação estrutural" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-200">
            <Link className="hover:text-white" href="/hub">Hub</Link>
            <ChevronRight aria-hidden="true" size={14} />
            {page.breadcrumb.map((item, index) => (
              <span className="contents" key={`${item}-${index}`}>
                {index > 0 ? <ChevronRight aria-hidden="true" size={14} /> : null}
                <span aria-current={index === page.breadcrumb.length - 1 ? 'page' : undefined}>{item}</span>
              </span>
            ))}
          </nav>
          <h1 className="text-3xl font-black tracking-tight">{page.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-200">
            {page.description}
          </p>
        </div>

        <nav aria-label="Seções de contratos e locações" className="flex flex-wrap gap-2 md:justify-end">
          {navigation.map(({ section, href, label, icon: Icon }) => {
            const isActive = page.activeSection === section;

            return (
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition md:px-4 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                href={href}
                key={section}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
