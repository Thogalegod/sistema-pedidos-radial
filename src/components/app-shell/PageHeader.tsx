import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageTab {
  label: string;
  href: string;
  active?: boolean;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs: BreadcrumbItem[];
  actions?: ReactNode;
  secondary?: ReactNode;
  tabs?: PageTab[];
  compact?: boolean;
}

export function PageHeader({ title, description, breadcrumbs, actions, secondary, tabs, compact = false }: PageHeaderProps) {
  return <header className={`${compact ? 'mb-4' : 'mb-6'} min-w-0`}>
    {breadcrumbs.length > 0 && <nav aria-label="Breadcrumb" className="min-w-0 overflow-hidden">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-slate-500 sm:text-sm">
        {breadcrumbs.map((item, index) => {
          const current = index === breadcrumbs.length - 1;
          return <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight size={14} className="shrink-0 text-slate-300" aria-hidden="true" />}
            {item.href && !current
              ? <Link href={item.href} className="truncate hover:text-slate-900">{item.label}</Link>
              : <span aria-current={current ? 'page' : undefined} className={`truncate ${current ? 'font-medium text-slate-700' : ''}`}>{item.label}</span>}
          </li>;
        })}
      </ol>
    </nav>}
    <div className={`${breadcrumbs.length > 0 ? (compact ? 'mt-2' : 'mt-3') : ''} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">{actions}</div>}
    </div>
    {secondary && <div className="mt-4">{secondary}</div>}
    {tabs && tabs.length > 0 && <nav aria-label="Seções da página" className="mt-5 overflow-x-auto border-b border-slate-200">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.active ? 'page' : undefined}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab.active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'}`}>
          {tab.label}
        </Link>)}
      </div>
    </nav>}
  </header>;
}

export function ContentContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10 ${className}`}>{children}</div>;
}
