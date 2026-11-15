'use client';

import { usePathname } from 'next/navigation';
import { RentalAccessGate } from './RentalAccessGate';

export function RentalRouteAccess({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/\/$/, '');
  const financial = path === '/contratos-locacoes'
    || path.startsWith('/contratos-locacoes/contratos')
    || path.startsWith('/contratos-locacoes/cobrancas')
    || path.startsWith('/contratos-locacoes/recibos');
  return financial ? <RentalAccessGate>{children}</RentalAccessGate> : children;
}
