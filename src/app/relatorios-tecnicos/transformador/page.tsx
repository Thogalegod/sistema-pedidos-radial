'use client';

import Link from 'next/link';
import { ArrowRight, FileText, Wrench } from 'lucide-react';
import { ContentContainer, PageHeader } from '@/components/app-shell/PageHeader';

const modules = [
  {
    href: '/inspecoes',
    title: 'Ensaio Rápido / Concessionária',
    description: 'Relatório atual para gerar valores e ficha de ensaio de transformador para cliente e concessionária.',
    icon: FileText,
    active: true,
  },
  {
    href: '#',
    title: 'Manutenção / Oficina',
    description: 'Ficha completa para diagnóstico, abertura, reparo, ensaios detalhados, estoque e histórico técnico.',
    icon: Wrench,
    active: false,
  },
];

export default function TransformadorMenuPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <ContentContainer>
        <PageHeader
          breadcrumbs={[{ label: 'Central', href: '/hub' }, { label: 'Relatórios Técnicos', href: '/relatorios-tecnicos' }, { label: 'Transformador' }]}
          title="Transformador"
          description="Escolha entre o ensaio rápido de campo e a futura ficha completa de manutenção em oficina."
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {modules.map((module) => {
            const Icon = module.icon;
            const content = (
              <>
                <div className={`mb-4 flex size-10 items-center justify-center rounded-lg ${module.active ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                  <Icon size={21} />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">{module.title}</h2>
                  {!module.active && (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                      Em breve
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{module.description}</p>
                {module.active && (
                  <div className="mt-5 flex items-center text-sm font-semibold text-emerald-600">
                    Acessar <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
              </>
            );

            return module.active ? (
              <Link
                key={module.title}
                href={module.href}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-400"
              >
                {content}
              </Link>
            ) : (
              <div key={module.title} className="rounded-xl border border-dashed border-slate-300 bg-white p-5 opacity-80">
                {content}
              </div>
            );
          })}
        </div>
      </ContentContainer>
    </div>
  );
}
