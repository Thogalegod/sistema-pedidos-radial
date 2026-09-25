'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Camera, FileText } from 'lucide-react';
import { ContentContainer, PageHeader } from '@/components/app-shell/PageHeader';

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
    <div className="min-h-screen bg-slate-50">
      <ContentContainer>
        <PageHeader
          breadcrumbs={[{ label: 'Central', href: '/hub' }, { label: 'Relatórios Técnicos' }]}
          title="Relatórios Técnicos"
          description="Escolha a família do relatório técnico que será gerado."
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            const tone = toneClass[module.tone];

            return (
              <Link
                key={module.href}
                href={module.href}
                className={`group rounded-xl border border-slate-200 bg-white p-5 transition-colors ${tone.hover}`}
              >
                <div className={`mb-4 flex size-10 items-center justify-center rounded-lg ${tone.icon}`}>
                  <Icon size={21} />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-slate-900">{module.title}</h2>
                <p className="text-sm leading-6 text-slate-500">{module.description}</p>
                <div className={`mt-5 flex items-center text-sm font-semibold ${tone.text}`}>
                  Acessar <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </ContentContainer>
    </div>
  );
}
