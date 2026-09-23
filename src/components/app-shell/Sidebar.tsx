'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, Search, Zap } from 'lucide-react';
import { CENTRAL, MODULES, isNavigationActive } from './navigation';

export interface SidebarProps {
  pathname: string;
  name: string;
  initials: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onSearch: (trigger: HTMLButtonElement) => void;
  onNavigate?: () => void;
  onLogout: () => void;
  signingOut: boolean;
  logoutError: string | null;
}

type GroupId = 'reports' | 'rentals';

export function Sidebar({ pathname, name, initials, collapsed = false, onToggle, onSearch, onNavigate, onLogout, signingOut, logoutError }: SidebarProps) {
  const [expanded, setExpanded] = useState<Record<GroupId, boolean>>({
    reports: isNavigationActive('reports', pathname),
    rentals: isNavigationActive('rentals', pathname),
  });

  const renderLink = (item: { id: string; label: string; href: string; icon: typeof CENTRAL.icon }, options: { module?: boolean; child?: boolean } = {}) => {
    const Icon = item.icon;
    const active = isNavigationActive(item.id, pathname);
    const exactPage = pathname === item.href || options.child;
    return <Link key={item.id} href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined}
      aria-label={item.label} aria-current={active ? (exactPage ? 'page' : 'location') : undefined}
      className={`flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${collapsed ? 'justify-center' : ''} ${options.module ? 'gap-2 px-2 text-[13px]' : ''} ${options.child ? 'ml-5 min-h-9 border-l border-slate-200 pl-4 text-[13px]' : ''} ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
      <Icon size={options.child ? 16 : 18} className={`shrink-0 ${active ? 'text-blue-600' : ''}`} aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
    </Link>;
  };

  const toggleGroup = (group: GroupId) => {
    setExpanded((current) => ({
      reports: group === 'reports' ? !current.reports : false,
      rentals: group === 'rentals' ? !current.rentals : false,
    }));
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className={`flex h-18 shrink-0 items-center gap-2 px-3 ${collapsed ? 'justify-center' : ''}`}>
      {!collapsed && <>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Zap size={20} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-slate-900">Radial Energia</span>
      </>}
      {onToggle && <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        title={collapsed ? 'Expandir menu' : 'Recolher menu'} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        {collapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
      </button>}
    </div>
    <div className="shrink-0 px-3 pb-4">
      <button type="button" onClick={(event) => onSearch(event.currentTarget)} aria-label={collapsed ? 'Buscar' : 'Buscar ou ir para'}
        title={collapsed ? 'Buscar' : undefined}
        className={`flex min-h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${collapsed ? 'justify-center px-0' : 'gap-1.5 px-2.5'}`}>
        <Search size={17} aria-hidden="true" className="shrink-0" />
        {!collapsed && <><span className="min-w-0 flex-1 truncate text-left text-xs">Buscar ou ir para...</span><kbd className="shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-400">Ctrl+K</kbd></>}
      </button>
    </div>
    <nav aria-label="Navegação principal" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {renderLink(CENTRAL)}
      <div className="space-y-1">
        <p className={`mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 ${collapsed ? 'sr-only' : ''}`}>Módulos</p>
        {MODULES.map((item) => {
          if (!('children' in item) || !item.children || collapsed) return renderLink(item, { module: true });
          const group = item.id as GroupId;
          const open = expanded[group];
          return <div key={item.id} className="space-y-1">
            <div className="flex min-w-0 items-center gap-0.5">
              <div className="min-w-0 flex-1">{renderLink(item, { module: true })}</div>
              <button type="button" onClick={() => toggleGroup(group)} aria-expanded={open} aria-controls={`submenu-${group}`}
                aria-label={`${open ? 'Recolher' : 'Expandir'} submenu ${item.label}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {open && <div id={`submenu-${group}`} className="space-y-0.5">{item.children.map((child) => renderLink(child, { child: true }))}</div>}
          </div>;
        })}
      </div>
    </nav>
    <div className="shrink-0 space-y-2 border-t border-slate-100 p-3">
      <div className={`flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 ${collapsed ? 'flex-col px-0' : ''}`}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600" title={name} aria-hidden="true">{initials}</span>
        <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate text-sm font-medium text-slate-700'} title={name}>{name}</span>
        <button type="button" onClick={onLogout} disabled={signingOut} title="Sair" aria-label="Sair"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">
          <LogOut size={18} aria-hidden="true" /><span className="sr-only">{signingOut ? 'Saindo…' : 'Sair'}</span>
        </button>
      </div>
      {logoutError && <p role="alert" className="px-1 text-xs text-red-700">{logoutError}</p>}
    </div>
  </div>;
}
