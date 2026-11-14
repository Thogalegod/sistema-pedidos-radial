import Link from 'next/link';
import { ArrowRight, Warehouse } from 'lucide-react';

export function RentalHubShortcut() {
  return (
    <Link href="/contratos-locacoes" aria-label="Abrir controle de locações"
      className="mb-6 flex min-w-0 flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-xl bg-white p-3 text-blue-700"><Warehouse size={24} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">Controle de locações</h2>
          <p className="mt-1 text-sm text-slate-600">Equipamentos, contratos, devoluções e cobranças.</p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-blue-800">
        Abrir locações <ArrowRight size={18} aria-hidden="true" />
      </span>
    </Link>
  );
}
