'use client';

import Link from 'next/link';
import { ArrowRight, Boxes, Building2, Camera, FileText } from 'lucide-react';

const modules = [
  {
    href: '/relatorios-tecnicos/cabine-primaria',
    title: 'Cabine Primária',
    description: 'Inspeção de concessionária, manutenção preventiva e relatórios ligados à cabine de média tensão.',
    icon: Building2,
    tone: 'blue',
  },
  {
    href: '/relatorios-tecnicos/transformador',
    title: 'Transformador',
    description: 'Ensaios rápidos para concessionária e futuras fichas completas de manutenção em oficina.',
    icon: FileText,
    tone: 'green',
  },
  {
    href: '/termografia',
    title: 'Termografia',
    description: 'Relatório de inspeção termográfica com fotos digitais, térmicas e ocorrências por ponto.',
    icon: Camera,
    tone: 'orange',
  },
];

const toneClass: Record<string, { icon: string; hover: string; text: string }> = {
  green: { icon: 'bg-green-100 text-green-600', hover: 'hover:border-green-500', text: 'text-green-600' },
  blue: { icon: 'bg-blue-100 text-blue-600', hover: 'hover:border-blue-500', text: 'text-blue-600' },
  orange: { icon: 'bg-orange-100 text-orange-600', hover: 'hover:border-orange-500', text: 'text-orange-600' },
};

export default function RelatoriosTecnicosPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/hub" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            &larr; Voltar ao Hub
          </Link>
          <div className="mt-4 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Boxes size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Relatórios Técnicos</h1>
              <p className="text-gray-500 mt-1">
                Escolha a família do relatório técnico que será gerado.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {modules.map((module) => {
            const Icon = module.icon;
            const tone = toneClass[module.tone];

            return (
              <Link
                key={module.href}
                href={module.href}
                className={`group bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md ${tone.hover} transition-all`}
              >
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-5 group-hover:scale-105 transition-transform ${tone.icon}`}>
                  <Icon size={24} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{module.title}</h2>
                <p className="text-sm text-gray-500 min-h-16">{module.description}</p>
                <div className={`mt-6 flex items-center font-medium text-sm ${tone.text}`}>
                  Acessar <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
