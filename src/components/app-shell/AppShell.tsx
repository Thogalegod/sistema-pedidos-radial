'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { GlobalSearchDialog } from './CentralSearch';
import { Sidebar, type SidebarProps } from './Sidebar';
import { usesAppShell } from './navigation';

const ShellUserContext = createContext<{ user: User | null; loading: boolean; name: string }>({ user: null, loading: true, name: 'Usuário' });
export const useShellUser = () => useContext(ShellUserContext);

function userName(user: User | null) {
  const metadata = user?.user_metadata;
  const metadataName = [metadata?.full_name, metadata?.display_name, metadata?.name]
    .find(value => typeof value === 'string' && value.trim());
  if (typeof metadataName === 'string') return metadataName.trim();
  const emailName = user?.email?.split('@')[0];
  return emailName && !emailName.includes('+') ? emailName : 'Usuário Radial';
}

function MobileNavigation(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const triggerElement = trigger.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    // Native modal dialog contains keyboard focus and makes the page inert.
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', closeOnDesktop);
      triggerElement?.focus();
    };
  }, [open]);

  return <>
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 lg:hidden print:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} aria-controls="radial-mobile-menu"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><Menu size={22} /></button>
        <span className="truncate text-sm font-semibold text-slate-900">Radial Energia</span>
      </div>
      <span title={props.name} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{props.initials}</span>
    </header>
    <dialog ref={dialog} id="radial-mobile-menu" aria-label="Menu Radial" onCancel={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
      className="radial-mobile-dialog fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[calc(100%-2rem)] border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/35 print:hidden">
      {open && <div className="relative h-full pt-10">
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="absolute right-3 top-2 flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        <Sidebar {...props} onSearch={(searchTrigger) => {
          setOpen(false);
          props.onSearch(trigger.current ?? searchTrigger);
        }} onNavigate={() => setOpen(false)} />
      </div>}
    </dialog>
  </>;
}

function AuthenticatedShell({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const searchTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    // Presentation only: reuse the app's existing session, without a profile query.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      receivedEvent = true;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active && !receivedEvent) { setUser(data.session?.user ?? null); setLoading(false); }
    }).catch(() => { if (active && !receivedEvent) setLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const openWithKeyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      searchTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSearchOpen(true);
    };
    window.addEventListener('keydown', openWithKeyboard);
    return () => window.removeEventListener('keydown', openWithKeyboard);
  }, []);

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch {
      setLogoutError('Não foi possível sair. Tente novamente.');
    } finally {
      setSigningOut(false);
    }
  };
  const name = userName(user);
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const openSearch = (trigger: HTMLButtonElement) => {
    searchTrigger.current = trigger;
    setSearchOpen(true);
  };
  const closeSearch = () => {
    setSearchOpen(false);
    queueMicrotask(() => {
      if (searchTrigger.current?.isConnected) searchTrigger.current.focus();
    });
  };
  const sidebarProps = { pathname, name, initials, onSearch: openSearch, onLogout: logout, signingOut, logoutError };

  return <ShellUserContext.Provider value={{ user, loading, name }}>
    <div className="radial-shell min-h-dvh bg-slate-50/60" data-collapsed={collapsed}>
      <a href="#radial-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-blue-700">Ir para o conteúdo</a>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-100 bg-white lg:block print:hidden ${collapsed ? 'w-[72px]' : 'w-[244px]'}`} aria-label="Menu lateral">
        <Sidebar key={pathname} {...sidebarProps} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      <div className={`radial-shell-body min-w-0 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[244px]'} print:pl-0`}>
        <MobileNavigation key={pathname} {...sidebarProps} />
        <div id="radial-content" tabIndex={-1} className="radial-shell-content min-w-0 outline-none">{children}</div>
      </div>
      <GlobalSearchDialog open={searchOpen} onClose={closeSearch} />
    </div>
  </ShellUserContext.Provider>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!usesAppShell(pathname)) return children;
  return <AuthenticatedShell pathname={pathname}>{children}</AuthenticatedShell>;
}
