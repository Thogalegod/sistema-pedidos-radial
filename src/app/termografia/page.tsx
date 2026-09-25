'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Camera, Eye, FileText, Search, X } from 'lucide-react';
import { ContentContainer, PageHeader } from '@/components/app-shell/PageHeader';
import { supabase } from '@/lib/supabase';
import { listTermografiaReports, TermografiaReportListItem } from '@/lib/termografia/report-actions';

export default function TermografiaListPage() {
  const [relatorios, setRelatorios] = useState<TermografiaReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    listTermografiaReports(supabase)
      .then((data) => {
        setRelatorios(data);
        setLoading(false);
      })
      .catch(() => {
        setRelatorios([]);
        setLoading(false);
      });
  }, []);

  const filtrados = relatorios.filter((rel) => {
    if (!busca) return true;
    const t = busca.toLowerCase();
    return rel.numero_relatorio?.toLowerCase().includes(t) || rel.cliente_nome?.toLowerCase().includes(t);
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <ContentContainer className="pb-20">
      <PageHeader
        breadcrumbs={[{ label: 'Central', href: '/hub' }, { label: 'Relatórios Técnicos', href: '/relatorios-tecnicos' }, { label: 'Termografia' }]}
        title="Relatórios de Termografia"
        description="Inspeções termográficas com fotos digitais, imagens térmicas e ocorrências."
        actions={<Link href="/termografia/nova" className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700">
          <Camera size={20} />
          <span>Novo Relatório</span>
        </Link>}
      />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número ou cliente..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                <th className="p-4 font-medium">Nº Relatório</th>
                <th className="p-4 font-medium">Cliente</th>
                <th className="p-4 font-medium">Data</th>
                <th className="p-4 font-medium">Ocorrências</th>
                <th className="p-4 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {loading ? (
                <tr><td colSpan={5} className="p-12 text-center text-gray-500">Carregando relatórios...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-500">
                    <FileText size={44} className="mx-auto text-gray-300 mb-3" />
                    Nenhum relatório de termografia encontrado.
                  </td>
                </tr>
              ) : (
                filtrados.map((rel) => {
                  const ocorrencias = rel.ocorrencias_count;
                  return (
                    <tr key={rel.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <Link href={`/termografia/${rel.id}`} className="text-blue-600 font-semibold hover:text-blue-800 hover:underline">
                          {rel.numero_relatorio}
                        </Link>
                      </td>
                      <td className="p-4 font-medium text-gray-900">{rel.cliente_nome}</td>
                      <td className="p-4 whitespace-nowrap text-gray-600">{format(parseISO(rel.data_execucao), 'dd/MM/yyyy')}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${ocorrencias ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                          {ocorrencias}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-center">
                        <Link href={`/termografia/${rel.id}`} className="inline-block p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Visualizar">
                          <Eye size={20} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </ContentContainer>
    </div>
  );
}
