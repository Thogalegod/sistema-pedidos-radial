'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardCheck, FileStack } from 'lucide-react';

const modules = [
  {
    href: '/cabine',
    title: 'Inspeção Cabine (Concessionária)',
    description: 'Relatório para inspeção e energização da cabine primária pela concessionária.',
    icon: ClipboardCheck,
    active: true,
  },
  {
    href: '/relatorios-tecnicos/cabine-primaria/manutencao-preventiva',
    title: 'Manutenção Preventiva Completa',
    description: 'Estrutura para cadastro da cabine, histórico anual e fichas dos equipamentos inspecionados.',
    icon: FileStack,
    active: true,
  },
];

export default function CabinePrimariaMenuPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/relatorios-tecnicos" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            &larr; Voltar aos Relatórios Técnicos
          </Link>
          <div className="mt-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cabine Primária</h1>
            <p className="text-gray-500 mt-1">
              Relatórios de campo, inspeção de concessionária e futura manutenção completa da cabine.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modules.map((module) => {
            const Icon = module.icon;
            const content = (
              <>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-5 ${module.active ? 'bg-blue-100 text-blue-600 group-hover:scale-105 transition-transform' : 'bg-gray-100 text-gray-400'}`}>
                  <Icon size={24} />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold text-gray-900">{module.title}</h2>
                  {!module.active && (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                      Em breve
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-2 min-h-20">{module.description}</p>
                {module.active && (
                  <div className="mt-6 flex items-center font-medium text-sm text-blue-600">
                    Acessar <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
              </>
            );

            return module.active ? (
              <Link
                key={module.title}
                href={module.href}
                className="group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-500 transition-all"
              >
                {content}
              </Link>
            ) : (
              <div key={module.title} className="bg-white p-6 rounded-xl shadow-sm border border-dashed border-gray-300 opacity-80">
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
