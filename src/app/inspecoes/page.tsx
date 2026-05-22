'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { FilePlus, Search, X, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type TransformadorRelatorioRow = {
  id: string;
  numero_relatorio: string;
  cliente_nome: string;
  potencia_kva: number;
  tensao_bt_label: string;
  data_relatorio: string;
  status: string;
  criado_em: string;
};

export default function InspecoesPage() {
  const [relatorios, setRelatorios] = useState<TransformadorRelatorioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<'ativos' | 'cancelados' | 'todos'>('ativos');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    supabase.from('relatorios_transformador')
      .select('id, numero_relatorio, cliente_nome, potencia_kva, tensao_bt_label, data_relatorio, status, criado_em')
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setRelatorios(data);
        setLoading(false);
      });
  }, []);

  const filtrados = relatorios
    .filter(r => {
      if (abaAtiva === 'ativos') return r.status !== 'cancelado';
      if (abaAtiva === 'cancelados') return r.status === 'cancelado';
      return true;
    })
    .filter(r => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      return (
        r.numero_relatorio.toLowerCase().includes(t) ||
        r.cliente_nome.toLowerCase().includes(t)
      );
    });

  const ativosCount = relatorios.filter(r => r.status !== 'cancelado').length;
  const canceladosCount = relatorios.filter(r => r.status === 'cancelado').length;
  const todosCount = relatorios.length;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/relatorios-tecnicos/transformador" className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              &larr; Voltar ao Transformador
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ensaio Rápido / Concessionária</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie e emita a ficha rápida de ensaio de transformador</p>
        </div>
        <Link 
          href="/inspecoes/nova" 
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          <FilePlus size={20} />
          <span>Novo Relatório</span>
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
        
        {/* ABAS */}
        <div className="border-b border-gray-200 px-4 pt-4 flex gap-6 overflow-x-auto">
          <button 
            onClick={() => setAbaAtiva('ativos')}
            className={`pb-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${abaAtiva === 'ativos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Ativos ({ativosCount})
          </button>
          <button 
            onClick={() => setAbaAtiva('cancelados')}
            className={`pb-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${abaAtiva === 'cancelados' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Cancelados ({canceladosCount})
          </button>
          <button 
            onClick={() => setAbaAtiva('todos')}
            className={`pb-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${abaAtiva === 'todos' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Todos ({todosCount})
          </button>
        </div>

        {/* BUSCA */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número do relatório ou cliente..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            {busca && (
              <button 
                onClick={() => setBusca('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* TABELA */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                <th className="p-4 font-medium">Nº Relatório</th>
                <th className="p-4 font-medium">Cliente</th>
                <th className="p-4 font-medium">Potência</th>
                <th className="p-4 font-medium">Tensão BT</th>
                <th className="p-4 font-medium">Data Ensaio</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    <p className="text-lg font-medium">Carregando relatórios...</p>
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <FilePlus size={48} className="text-gray-300 mb-3" />
                      <p className="text-lg font-medium text-gray-900">
                        {busca 
                          ? `Nenhum relatório encontrado para "${busca}".` 
                          : abaAtiva === 'cancelados' 
                            ? 'Nenhum relatório cancelado.'
                            : 'Nenhum relatório gerado ainda.'
                        }
                      </p>
                      {!busca && abaAtiva !== 'cancelados' && (
                        <p className="mt-1">Clique em &quot;Novo Relatório&quot; para começar a gerar fichas de ensaio.</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtrados.map((rel) => (
                  <tr key={rel.id} className={`hover:bg-gray-50 transition-colors ${rel.status === 'cancelado' ? 'opacity-50 grayscale line-through' : ''}`}>
                    <td className="p-4 whitespace-nowrap">
                      <Link href={`/inspecoes/${rel.id}`} className="text-blue-600 font-semibold hover:text-blue-800 hover:underline">
                        {rel.numero_relatorio}
                      </Link>
                    </td>
                    <td className="p-4 font-medium text-gray-900">{rel.cliente_nome}</td>
                    <td className="p-4 whitespace-nowrap">{rel.potencia_kva} kVA</td>
                    <td className="p-4 whitespace-nowrap">{rel.tensao_bt_label}</td>
                    <td className="p-4 whitespace-nowrap text-gray-600">
                      {format(parseISO(rel.data_relatorio), "dd/MM/yyyy")}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                        rel.status === 'gerado' ? 'bg-blue-100 text-blue-800' :
                        rel.status === 'revisado' ? 'bg-yellow-100 text-yellow-800' :
                        rel.status === 'emitido' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {rel.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap text-center">
                      <Link href={`/inspecoes/${rel.id}`} className="inline-block p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Visualizar">
                        <Eye size={20} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
