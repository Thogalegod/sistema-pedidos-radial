'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Camera, CheckCircle2, ClipboardList, FilePlus2, History, Layers3, Wrench } from 'lucide-react';

const primaryActions = [
  {
    title: 'Novo cliente / nova cabine',
    description: 'Primeiro cadastro do cliente, da cabine primária e do tipo de cabine: convencional ou simplificada.',
    icon: FilePlus2,
  },
  {
    title: 'Clientes / cabines cadastradas',
    description: 'Buscar uma cabine existente, abrir o histórico e criar uma nova manutenção daquele cliente.',
    icon: Building2,
  },
];

const equipmentItems = [
  { name: 'Transformadores', status: 'Primeira ficha' },
  { name: 'Disjuntores 15 kV', status: 'Depois' },
  { name: 'Chaves seccionadoras', status: 'Depois' },
  { name: 'Para-raios', status: 'Depois' },
  { name: 'TC / TP', status: 'Depois' },
  { name: 'Cabos de média tensão', status: 'Depois' },
  { name: 'Aterramento', status: 'Depois' },
];

const reportSections = [
  'Capa e dados do cliente',
  'Objetivo e abrangência',
  'Resumo de ocorrências e recomendações',
  'Serviços realizados',
  'Fichas dos equipamentos',
  'Relatório fotográfico das ocorrências',
  'Conclusão e disposições finais',
  'Anexos técnicos',
];

const transformerFields = [
  'Identificação do transformador',
  'Dados de placa',
  'Inspeção visual / mecânica / elétrica',
  'Ensaios elétricos',
  'Fotos do equipamento',
  'Comentários e observações',
  'Ocorrências para aparecer no resumo inicial',
];

const actionPlan = [
  { title: 'Organizar o fluxo da manutenção preventiva', done: true },
  { title: 'Criar ficha interna do transformador', done: false },
  { title: 'Criar cadastro de cliente e cabine', done: false },
  { title: 'Criar histórico por cabine', done: false },
  { title: 'Adicionar fichas dos outros equipamentos', done: false },
  { title: 'Montar PDF completo com capa, fichas, fotos e conclusão', done: false },
];

export default function ManutencaoPreventivaCabinePage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/relatorios-tecnicos/cabine-primaria" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            &larr; Voltar à Cabine Primária
          </Link>
          <div className="mt-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Manutenção Preventiva Completa</h1>
            <p className="text-gray-500 mt-1">
              Esqueleto inicial para cadastro da cabine, histórico de manutenções e equipamentos inspecionados.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {primaryActions.map((action) => {
            const Icon = action.icon;

            return (
              <div key={action.title} className="bg-white p-6 rounded-xl shadow-sm border border-dashed border-gray-300">
                <div className="w-12 h-12 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center mb-5">
                  <Icon size={24} />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold text-gray-900">{action.title}</h2>
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                    Em breve
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2 min-h-20">{action.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Layers3 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Fluxo planejado</h2>
                <p className="text-sm text-gray-500">A manutenção anual nasce de uma cabine cadastrada.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex gap-3">
                <span className="font-bold text-blue-600">1.</span>
                <span>Cadastro do cliente e da cabine primária.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold text-blue-600">2.</span>
                <span>Escolha do tipo de cabine: convencional ou simplificada.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold text-blue-600">3.</span>
                <span>Cadastro dos equipamentos que existem naquela cabine.</span>
              </div>
              <div className="flex gap-3">
                <span className="font-bold text-blue-600">4.</span>
                <span>Dentro da cabine cadastrada, criação da nova manutenção do ano.</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                <Wrench size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Equipamentos da cabine</h2>
                <p className="text-sm text-gray-500">Ficarão dentro da manutenção preventiva completa.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {equipmentItems.map((item) => (
                <span
                  key={item.name}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    item.status === 'Primeira ficha'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <ClipboardList size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Esqueleto do relatório</h2>
                <p className="text-sm text-gray-500">Base para montar o PDF completo depois das fichas.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reportSections.map((section) => (
                <div key={section} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
                  {section}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                <Wrench size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Ficha do transformador</h2>
                <p className="text-sm text-gray-500">Primeira ficha interna da manutenção preventiva.</p>
              </div>
            </div>
            <div className="space-y-2">
              {transformerFields.map((field) => (
                <div key={field} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <span>{field}</span>
                </div>
              ))}
            </div>
            <Link
              href="/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-transformador"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800"
            >
              Abrir esqueleto da ficha <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <Camera size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Fotos e ocorrências</h2>
                <p className="text-sm text-gray-500">Fotos ficam junto da ficha e ocorrências sobem para o resumo inicial.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                Fotos gerais do equipamento dentro da ficha técnica.
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                Ocorrências com foto, comentário, recomendação e prioridade.
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                Seção final com relatório fotográfico das ocorrências.
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Plano de ação</h2>
                <p className="text-sm text-gray-500">Etapas para implementar sem misturar tudo de uma vez.</p>
              </div>
            </div>
            <div className="space-y-2">
              {actionPlan.map((step, index) => (
                <div key={step.title} className="flex items-center gap-3 text-sm">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${step.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {index + 1}
                  </span>
                  <span className={step.done ? 'text-gray-900 font-medium' : 'text-gray-600'}>{step.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
              <History size={20} />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-900">Histórico por cliente</h2>
              <p className="text-sm text-gray-500">
                A nova manutenção anual será criada dentro da cabine cadastrada, depois que o cliente for localizado no histórico.
              </p>
            </div>
            <ArrowRight size={18} className="text-gray-300 hidden sm:block" />
          </div>
        </div>
      </div>
    </div>
  );
}
