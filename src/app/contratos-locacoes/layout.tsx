import Link from 'next/link';
import { Building2, ChevronRight, FileText, LayoutDashboard, Users } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

export default function ContratosLocacoesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="bottom-center" />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-200">
                <Link className="hover:text-white" href="/hub">
                  Hub
                </Link>
                <ChevronRight size={14} />
                <span>Contratos e Locações</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight">Contratos e Locações</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-200">
                Cadastro central, contratos, cobranças e visão resumida para operação móvel.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                href="/contratos-locacoes"
              >
                <LayoutDashboard size={16} />
                Painel
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                href="/contratos-locacoes/clientes"
              >
                <Users size={16} />
                Clientes
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
                href="/contratos-locacoes/cobrancas"
              >
                <FileText size={16} />
                Cobranças
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300"
                href="/contratos-locacoes/clientes/novo"
              >
                <Building2 size={16} />
                Novo cliente
              </Link>
            </div>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
