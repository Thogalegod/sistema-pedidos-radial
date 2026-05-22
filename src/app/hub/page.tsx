'use client';

import Link from 'next/link';
import { LayoutDashboard, FileText, ArrowRight } from 'lucide-react';

export default function HubPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">RADIAL ENERGIA</h1>
        <p className="text-gray-500 mt-2 font-medium">Hub de Aplicações</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        
        {/* Controle de Pedidos */}
        <Link href="/" className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-500 transition-all">
          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <LayoutDashboard size={28} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">Controle de Pedidos</h2>
          <p className="text-gray-500 mb-6 line-clamp-2">Gerenciamento de ordens de serviço, tarefas, prazos e prioridades da equipe técnica.</p>
          <div className="flex items-center text-blue-600 font-medium text-sm">
            Acessar Módulo <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Relatórios Técnicos */}
        <Link href="/relatorios-tecnicos" className="group bg-white p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-green-500 transition-all">
          <div className="w-14 h-14 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <FileText size={28} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">Relatórios Técnicos</h2>
          <p className="text-gray-500 mb-6 line-clamp-2">Transformador, inspeção de cabine, termografia e futuros relatórios de equipamentos de média tensão.</p>
          <div className="flex items-center text-green-600 font-medium text-sm">
            Acessar Módulo <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>
    </div>
  );
}
